import type {
  PeopleDashboardActivity,
  PeopleDashboardRoster,
} from "@pcobooster/contracts/people-schemas";
import { describe, expect, it } from "vitest";

import {
  assemblePeopleDashboard,
  buildMonthDays,
  defaultPeopleDashboardScope,
  describeCoverage,
  initialScopeLoadCount,
  matchesPeopleQuery,
  matrixPageStart,
  normalizePeopleQuery,
  orderActivityBatches,
  parsePeopleDashboardScope,
  parsePeopleDashboardView,
  PEOPLE_DASHBOARD_SAMPLE_SIZE,
  planPeopleDashboardBatches,
  resolveScopePersonIds,
  serviceDays,
  teamScope,
  unrequestedMatchIds,
} from "@/lib/people-dashboard";

const roster = (
  count: number,
  ledTeamIds: string[] = []
): PeopleDashboardRoster => ({
  generatedAt: "2026-05-23T12:00:00.000Z",
  month: {
    year: 2026,
    monthIndex: 4,
    label: "May 2026",
    daysInMonth: 31,
    startsOnWeekday: 5,
  },
  people: Array.from({ length: count }, (_, index) => ({
    id: `person-${index}`,
    name: `Person ${index}`,
    initials: "P",
    photoThumbnailUrl: null,
    teams: index % 2 === 0 ? ["Vocals", "Band"] : ["Band"],
  })),
  teams: [
    {
      id: "band",
      name: "Band",
      serviceTypeName: "Sunday",
      personIds: Array.from({ length: count }, (_, index) => `person-${index}`),
    },
    {
      id: "vocals",
      name: "Vocals",
      serviceTypeName: "Sunday",
      personIds: Array.from({ length: count }, (_, index) => index)
        .filter((index) => index % 2 === 0)
        .map((index) => `person-${index}`),
    },
  ],
  ledTeamIds,
});

const activity = (
  id: string,
  overrides: Partial<PeopleDashboardActivity> = {}
): PeopleDashboardActivity => ({
  id,
  rhythm: {
    lastServedOn: "2026-05-10",
    nextServingOn: "2026-05-31",
    servedDays30: 1,
    servedDays90: 2,
    servedDays180: 4,
    upcomingDays30: 1,
    typicalGapDays: 21,
    requests180: 4,
    declined180: 0,
    pendingUpcoming: 0,
    nextPendingOn: null,
  },
  roles: ["Keys"],
  monthDays: [{ day: 31, kind: "service", status: "C" }],
  ...overrides,
});

const noneLoading = new Set<string>();

describe(planPeopleDashboardBatches, () => {
  it("splits the first requested scope people into fixed-size calls", () => {
    expect(
      planPeopleDashboardBatches(["a", "b", "c", "d", "e"], 4, 3)
    ).toStrictEqual([["a", "b", "c"], ["d"]]);
    expect(planPeopleDashboardBatches([], 4, 3)).toStrictEqual([]);
  });
});

describe(orderActivityBatches, () => {
  it("starts search matches before sample batches still waiting, never ahead of ones under way", () => {
    const started = new Set(["a"]);
    expect(
      orderActivityBatches([["a"], ["b"], ["c"]], [["s"]], ([first]) =>
        started.has(first ?? "")
      )
    ).toStrictEqual([["a"], ["s"], ["b"], ["c"]]);
  });
});

describe("people dashboard scopes", () => {
  it("lands a leader on their teams and everyone else on all teams", () => {
    expect(defaultPeopleDashboardScope(roster(2, ["vocals"]))).toBe("mine");
    expect(defaultPeopleDashboardScope(roster(2))).toBe("all");
  });

  it("resolves a scope to its people in roster order", () => {
    const data = roster(5, ["vocals"]);

    expect(resolveScopePersonIds(data, "mine")).toStrictEqual([
      "person-0",
      "person-2",
      "person-4",
    ]);
    expect(resolveScopePersonIds(data, teamScope("band"))).toHaveLength(5);
    expect(resolveScopePersonIds(data, teamScope("gone"))).toStrictEqual([]);
    expect(resolveScopePersonIds(data, "all")).toHaveLength(5);
  });

  it("loads a team scope whole and samples all teams", () => {
    expect(initialScopeLoadCount("mine", 70)).toBe(70);
    expect(initialScopeLoadCount(teamScope("band"), 500)).toBe(
      PEOPLE_DASHBOARD_SAMPLE_SIZE
    );
    expect(initialScopeLoadCount("all", 70)).toBe(PEOPLE_DASHBOARD_SAMPLE_SIZE);
  });

  it("reads scopes back from select values and search params", () => {
    expect(parsePeopleDashboardScope("mine")).toBe("mine");
    expect(parsePeopleDashboardScope("team:42")).toBe("team:42");
    expect(parsePeopleDashboardScope("team:")).toBeNull();
    expect(parsePeopleDashboardScope("elsewhere")).toBeNull();
    expect(parsePeopleDashboardScope()).toBeNull();
  });

  it("reads the view back from search params, Health unless it says Month", () => {
    expect(parsePeopleDashboardView("month")).toBe("month");
    expect(parsePeopleDashboardView("calendar")).toBe("health");
    expect(parsePeopleDashboardView()).toBe("health");
  });
});

const coverage = (loaded: number, sample: number, scope: number) => ({
  loadedPeopleCount: loaded,
  samplePeopleCount: sample,
  scopePeopleCount: scope,
});

describe(describeCoverage, () => {
  it("says how many people health covers while they load", () => {
    expect(describeCoverage(coverage(16, 40, 40), true)).toBe(
      "Based on 16 of 40 people so far"
    );
    expect(describeCoverage(coverage(40, 40, 40), false)).toBeNull();
  });

  it("says when all teams is a sample, not the whole roster", () => {
    expect(describeCoverage(coverage(48, 48, 230), false)).toBe(
      "Based on the first 48 of 230 people"
    );
    // A batch failed: no "first", since some of them are missing.
    expect(describeCoverage(coverage(32, 48, 230), false)).toBe(
      "Based on 32 of 230 people"
    );
  });
});

describe(assemblePeopleDashboard, () => {
  it("shows the roster and teams before any activity arrives", () => {
    const dashboard = assemblePeopleDashboard(roster(3, ["band"]), [], {
      scopePersonIds: ["person-0", "person-1", "person-2"],
      samplePeopleCount: 3,
      loadingPersonIds: new Set(["person-0", "person-1", "person-2"]),
    });

    expect(dashboard.teams.map(({ id }) => id)).toStrictEqual([
      "band",
      "vocals",
    ]);
    expect(dashboard.ledTeamIds).toStrictEqual(["band"]);
    expect(
      dashboard.sampleRows.map(({ person, member, loading }) => [
        person.name,
        member,
        loading,
      ])
    ).toStrictEqual([
      ["Person 0", null, true],
      ["Person 1", null, true],
      ["Person 2", null, true],
    ]);
    expect(dashboard.members).toStrictEqual([]);
    expect(dashboard.coverage).toStrictEqual({
      scopePeopleCount: 3,
      samplePeopleCount: 3,
      loadedPeopleCount: 0,
    });
  });

  it("fills in people as their batches answer, keeping roster order", () => {
    const dashboard = assemblePeopleDashboard(
      roster(4),
      [
        activity("person-2", { roles: ["Drums"] }),
        activity("person-0"),
        // Loaded for another scope; not part of this one.
        activity("person-3"),
      ],
      {
        scopePersonIds: ["person-0", "person-1", "person-2"],
        samplePeopleCount: 3,
        loadingPersonIds: new Set(["person-1"]),
      }
    );

    expect(
      dashboard.sampleRows.map(({ person, member, loading }) => [
        person.id,
        member?.roles ?? null,
        loading,
      ])
    ).toStrictEqual([
      ["person-0", ["Keys"], false],
      ["person-1", null, true],
      ["person-2", ["Drums"], false],
    ]);
    expect(dashboard.members[1]).toMatchObject({
      id: "person-2",
      name: "Person 2",
      teams: ["Vocals", "Band"],
      rhythm: { lastServedOn: "2026-05-10" },
    });
    expect(dashboard.coverage).toStrictEqual({
      scopePeopleCount: 3,
      samplePeopleCount: 3,
      loadedPeopleCount: 2,
    });
  });

  it("keeps health to the sample while search matches beyond it load too", () => {
    const dashboard = assemblePeopleDashboard(
      roster(6),
      [activity("person-0"), activity("person-1"), activity("person-5")],
      {
        scopePersonIds: roster(6).people.map(({ id }) => id),
        samplePeopleCount: 2,
        loadingPersonIds: noneLoading,
      }
    );

    expect(dashboard.members.map(({ id }) => id)).toStrictEqual([
      "person-0",
      "person-1",
    ]);
    expect(dashboard.scopeRows.at(-1)?.member?.id).toBe("person-5");
    expect(dashboard.coverage).toStrictEqual({
      scopePeopleCount: 6,
      samplePeopleCount: 2,
      loadedPeopleCount: 2,
    });
  });
});

describe("people search", () => {
  const dashboard = assemblePeopleDashboard(
    roster(5),
    [activity("person-0", { roles: ["Bass"] })],
    {
      scopePersonIds: roster(5).people.map(({ id }) => id),
      samplePeopleCount: 1,
      loadingPersonIds: new Set(["person-1"]),
    }
  );

  it("matches names and teams across the whole scope, and roles once loaded", () => {
    const vocals = normalizePeopleQuery("  VOCALS ");
    expect(
      dashboard.scopeRows
        .filter((row) => matchesPeopleQuery(row, vocals))
        .map(({ person }) => person.id)
    ).toStrictEqual(["person-0", "person-2", "person-4"]);
    expect(
      dashboard.scopeRows
        .filter((row) => matchesPeopleQuery(row, "bass"))
        .map(({ person }) => person.id)
    ).toStrictEqual(["person-0"]);
  });

  it("asks for matches nobody has requested yet, in roster order", () => {
    expect(
      unrequestedMatchIds(dashboard.scopeRows, "band", new Set(["person-1"]))
    ).toStrictEqual(["person-2", "person-3", "person-4"]);
    expect(
      unrequestedMatchIds(dashboard.scopeRows, "", new Set())
    ).toStrictEqual([]);
  });
});

describe(buildMonthDays, () => {
  it("counts people serving, pending, and rehearsing on each day", () => {
    const days = buildMonthDays([
      {
        monthDays: [
          { day: 3, kind: "rehearsal" },
          { day: 4, kind: "service", status: "U" },
        ],
      },
      {
        monthDays: [
          { day: 4, kind: "service", status: "C" },
          // Two services on one day are one person serving.
          { day: 11, kind: "service", status: "C" },
          { day: 11, kind: "service", status: "C", positionName: "Keys" },
        ],
      },
    ]);

    expect(days[3]).toStrictEqual({
      day: 4,
      serviceCount: 2,
      confirmedServiceCount: 1,
      pendingServiceCount: 1,
      rehearsalCount: 0,
    });
    expect(days[10]?.serviceCount).toBe(1);
    expect(serviceDays(days)).toStrictEqual([4, 11]);
  });
});

describe(matrixPageStart, () => {
  const days = [1, 5, 8, 12, 15, 19, 22, 26, 29];

  it("pages the matrix to the selected service day", () => {
    expect(matrixPageStart(days, 1)).toBe(0);
    expect(matrixPageStart(days, 15)).toBe(0);
    expect(matrixPageStart(days, 19)).toBe(5);
  });

  it("pages to the next service day, or the last page after the last one", () => {
    expect(matrixPageStart(days, 20)).toBe(5);
    expect(matrixPageStart(days, 31)).toBe(5);
    expect(matrixPageStart([], 3)).toBe(0);
  });
});

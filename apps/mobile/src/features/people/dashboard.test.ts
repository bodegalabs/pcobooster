import { describe, expect, it } from "vitest";

import rosterFixture from "../../harness/fixtures/people.dashboardRoster.json";
import {
  assembleDashboard,
  chunkPersonIds,
  describeCoverage,
  describeProgress,
  describeScope,
  effectiveScope,
  groupTeams,
  matchesQuery,
  normalizeQuery,
  orderActivityBatches,
  OTHER_TEAMS,
  planBatches,
  resolveScopePersonIds,
  sampleFooter,
  sampleSize,
  scheduledDays,
  searchFooter,
  sortRows,
  teamScope,
  todayInMonth,
  unrequestedMatchIds,
} from "./dashboard";
import type { Activity, Roster, RosterTeam, ServingRhythm } from "./types";

const roster: Roster = rosterFixture.default;

const rhythm = (overrides: Partial<ServingRhythm> = {}): ServingRhythm => ({
  lastServedOn: null,
  nextServingOn: null,
  servedDays30: 0,
  servedDays90: 0,
  servedDays180: 0,
  upcomingDays30: 0,
  typicalGapDays: null,
  requests180: 0,
  declined180: 0,
  pendingUpcoming: 0,
  nextPendingOn: null,
  ...overrides,
});

const activity = (id: string, overrides: Partial<Activity> = {}): Activity => ({
  id,
  rhythm: rhythm(),
  roles: [],
  monthDays: [],
  ...overrides,
});

const team = (
  id: string,
  personIds: string[],
  serviceTypeName: string | null = null
): RosterTeam => ({
  id,
  name: `Team ${id}`,
  serviceTypeName,
  personIds,
});

const smallRoster = (overrides: Partial<Roster> = {}): Roster => ({
  generatedAt: "2026-10-01T17:00:00.000Z",
  month: roster.month,
  people: ["a", "b", "c", "d"].map((id) => ({
    id,
    name: `Person ${id.toUpperCase()}`,
    initials: id.toUpperCase(),
    photoThumbnailUrl: null,
    teams: [],
  })),
  teams: [team("t1", ["a", "c"]), team("t2", ["b"])],
  ledTeamIds: ["t1"],
  ...overrides,
});

describe("People scopes", () => {
  it("lands a leader on their teams and everyone else on all teams", () => {
    expect(effectiveScope(null, smallRoster())).toBe("mine");
    expect(effectiveScope(null, smallRoster({ ledTeamIds: [] }))).toBe("all");
  });

  it("drops a remembered team that left the roster instead of showing an empty list", () => {
    expect(effectiveScope(teamScope("t2"), smallRoster())).toBe("team:t2");
    expect(effectiveScope(teamScope("gone"), smallRoster())).toBe("mine");
    expect(effectiveScope("mine", smallRoster({ ledTeamIds: [] }))).toBe("all");
  });

  it("keeps roster (last name) order inside a scope", () => {
    expect(resolveScopePersonIds(smallRoster(), "mine")).toStrictEqual([
      "a",
      "c",
    ]);
    expect(resolveScopePersonIds(smallRoster(), "all")).toStrictEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(resolveScopePersonIds(smallRoster(), teamScope("t2"))).toStrictEqual(
      ["b"]
    );
  });

  it("names the scope and groups teams by service type with other teams last", () => {
    const teams = [
      team("x", [], null),
      team("y", [], "Sunday"),
      team("z", [], "Midweek"),
      team("w", [], "Sunday"),
    ];
    expect(groupTeams(teams).map((group) => group.serviceType)).toStrictEqual([
      "Midweek",
      "Sunday",
      OTHER_TEAMS,
    ]);
    expect(describeScope(teamScope("y"), teams, [])).toBe("Team y · Sunday");
    expect(describeScope("mine", teams, ["y", "z"])).toBe("Teams you lead");
    expect(describeScope("all", teams, [])).toBe("All teams");
  });
});

describe("Progressive activity loading", () => {
  it("loads small team scopes whole and samples large or all-team scopes", () => {
    expect(sampleSize(teamScope("t"), 120, 0)).toBe(120);
    expect(sampleSize("all", 120, 0)).toBe(48);
    expect(sampleSize("all", 120, 48)).toBe(96);
    expect(sampleSize("all", 60, 48)).toBe(60);
    expect(sampleSize(teamScope("t"), 200, 0)).toBe(48);
  });

  it("splits the sample into calls of the contract's batch size", () => {
    const ids = Array.from({ length: 40 }, (_, index) => String(index));
    expect(planBatches(ids, 33, 16).map((batch) => batch.length)).toStrictEqual(
      [16, 16, 1]
    );
    expect(chunkPersonIds([], 16)).toStrictEqual([]);
  });

  it("keeps started calls first, then search matches, then the rest of the sample", () => {
    const started = new Set(["s2"]);
    const order = orderActivityBatches(
      [["s1"], ["s2"], ["s3"]],
      [["q1"]],
      (ids) => started.has(ids[0] ?? "")
    );
    expect(order).toStrictEqual([["s2"], ["q1"], ["s1"], ["s3"]]);
  });
});

describe("Assembly, search, and coverage", () => {
  const assembled = assembleDashboard(
    smallRoster(),
    [activity("a", { roles: ["Keys"] })],
    {
      scopePersonIds: ["a", "b", "c", "d"],
      sampleCount: 3,
      loadingPersonIds: new Set(["b"]),
    }
  );

  it("marks loading people and counts only loaded sample members as covered", () => {
    expect(
      assembled.scopeRows.map((row) => [
        row.person.id,
        row.member !== null,
        row.loading,
      ])
    ).toStrictEqual([
      ["a", true, false],
      ["b", false, true],
      ["c", false, false],
      ["d", false, false],
    ]);
    expect(assembled.coverage).toStrictEqual({
      scopePeopleCount: 4,
      samplePeopleCount: 3,
      loadedPeopleCount: 1,
    });
  });

  it("matches name, team, and loaded role, and lists only unrequested matches to load", () => {
    const query = normalizeQuery("  KEYS ");
    expect(
      assembled.scopeRows
        .filter((row) => matchesQuery(row, query))
        .map((row) => row.person.id)
    ).toStrictEqual(["a"]);
    expect(
      unrequestedMatchIds(
        assembled.scopeRows,
        normalizeQuery("person"),
        new Set(["b"])
      )
    ).toStrictEqual(["c", "d"]);
    expect(
      unrequestedMatchIds(assembled.scopeRows, "", new Set())
    ).toStrictEqual([]);
  });

  it("states partial coverage truthfully until everyone has loaded", () => {
    expect(describeCoverage(assembled.coverage, true)).toBe(
      "Based on 1 of 4 people so far"
    );
    expect(
      describeCoverage(
        { scopePeopleCount: 4, samplePeopleCount: 2, loadedPeopleCount: 2 },
        false
      )
    ).toBe("Based on the first 2 of 4 people");
    expect(
      describeCoverage(
        { scopePeopleCount: 2, samplePeopleCount: 2, loadedPeopleCount: 2 },
        false
      )
    ).toBeNull();
  });

  it("words the sampled roster and search footers", () => {
    expect(sampleFooter(assembled.coverage)).toBe(
      "The first 3 of 4 people, by last name"
    );
    expect(searchFooter(3, 2)).toBe("3 matches, 2 not loaded yet");
    expect(searchFooter(0, 0)).toBeNull();
  });

  it("reports failed batches ahead of loading progress", () => {
    expect(describeProgress(assembled.coverage, true, 1)).toStrictEqual({
      kind: "failed",
      text: "Some schedules failed to load.",
    });
    expect(describeProgress(assembled.coverage, true, 0)).toStrictEqual({
      kind: "loading",
      text: "Loading schedules · 1 of 3 people",
    });
    expect(describeProgress(assembled.coverage, false, 0)).toBeNull();
  });

  it("sorts by last served and 90-day serving with unloaded people last", () => {
    const rows = assembleDashboard(
      smallRoster(),
      [
        activity("a", {
          rhythm: rhythm({ lastServedOn: "2026-09-20", servedDays90: 2 }),
        }),
        activity("c", {
          rhythm: rhythm({ lastServedOn: "2026-08-02", servedDays90: 5 }),
        }),
        activity("d", { rhythm: rhythm({ servedDays90: 0 }) }),
      ],
      {
        scopePersonIds: ["a", "b", "c", "d"],
        sampleCount: 4,
        loadingPersonIds: new Set(),
      }
    ).scopeRows;
    expect(
      sortRows(rows, "lastServed").map((row) => row.person.id)
    ).toStrictEqual(["d", "c", "a", "b"]);
    expect(
      sortRows(rows, "served90").map((row) => row.person.id)
    ).toStrictEqual(["c", "a", "d", "b"]);
  });
});

describe("Month", () => {
  it("finds today only inside the dashboard month", () => {
    expect(todayInMonth("2026-10-04", roster.month)).toBe(4);
    expect(todayInMonth("2026-11-04", roster.month)).toBeNull();
  });

  it("lists who serves each day, services before rehearsals, with pending counts", () => {
    const people = assembleDashboard(
      smallRoster(),
      [
        activity("a", { monthDays: [{ day: 4, kind: "rehearsal" }] }),
        activity("b", {
          monthDays: [
            { day: 4, kind: "service", status: "U" },
            { day: 11, kind: "service", status: "C" },
          ],
        }),
      ],
      {
        scopePersonIds: ["a", "b"],
        sampleCount: 2,
        loadingPersonIds: new Set(),
      }
    ).members;
    const days = scheduledDays(people);
    expect(days.map(({ count }) => count)).toStrictEqual([
      { day: 4, serviceCount: 1, pendingServiceCount: 1, rehearsalCount: 1 },
      { day: 11, serviceCount: 1, pendingServiceCount: 0, rehearsalCount: 0 },
    ]);
    expect(days[0]?.people.map(({ person }) => person.id)).toStrictEqual([
      "b",
      "a",
    ]);
  });
});

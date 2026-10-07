import { describe, expect, it } from "vitest";

import { assembleDashboard } from "./dashboard";
import {
  blockedDays,
  cachedDashboard,
  commitmentGroups,
  commitmentPlan,
  describeBlockoutDates,
  describeBlockoutLength,
  describeCommitment,
  describeMonth,
  isAwayNow,
  nextServingPlan,
  parseMonthParam,
  placeholderDetail,
} from "./person-detail";
import {
  computeTeamHealth,
  describeHealth,
  describeSignal,
  isListSignal,
  personSignals,
} from "./team-health";
import type {
  Blockout,
  DashboardMonth,
  MonthDay,
  Roster,
  ServingRhythm,
} from "./types";

const LOS_ANGELES = "America/Los_Angeles";
const october: DashboardMonth = {
  year: 2026,
  monthIndex: 9,
  label: "October 2026",
  daysInMonth: 31,
  startsOnWeekday: 4,
};

const blockout = (overrides: Partial<Blockout>): Blockout => ({
  id: "b",
  reason: "Vacation",
  startsAt: new Date("2026-10-30T07:00:00.000Z"),
  endsAt: new Date("2026-11-03T07:59:00.000Z"),
  description: "",
  share: true,
  timeZone: LOS_ANGELES,
  ...overrides,
});

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

describe("Blockouts on their own calendar", () => {
  // 00:00 Oct 30 Pacific (07:00 UTC) to 23:59 Nov 2 Pacific, after DST ends (07:59 UTC Nov 3).
  const allDay = blockout({});

  it("reads an all-day range as entered, not shifted by UTC", () => {
    expect(describeBlockoutDates(allDay, "UTC", "2026-10-01")).toBe(
      "Fri, Oct 30 to Mon, Nov 2"
    );
    expect(describeBlockoutLength(allDay, "UTC")).toBe("4 days");
  });

  it("falls back to the organization zone when the blockout has none or an invalid one", () => {
    const evening = blockout({
      startsAt: new Date("2026-10-04T01:00:00.000Z"),
      endsAt: new Date("2026-10-04T03:00:00.000Z"),
      timeZone: "Not/AZone",
    });
    expect(describeBlockoutDates(evening, LOS_ANGELES, "2026-10-01")).toBe(
      "Sat, Oct 3, 6:00 PM to 8:00 PM"
    );
    expect(describeBlockoutLength(evening, LOS_ANGELES)).toBeNull();
  });

  it("shows the year only outside the current year", () => {
    const later = blockout({
      startsAt: new Date("2027-01-02T08:00:00.000Z"),
      endsAt: new Date("2027-01-03T07:59:00.000Z"),
    });
    expect(describeBlockoutDates(later, LOS_ANGELES, "2026-10-01")).toBe(
      "Sat, Jan 2, 2027"
    );
  });

  it("marks the month's blocked days on the blockout's calendar", () => {
    expect([...blockedDays(october, [allDay], "UTC")]).toStrictEqual([30, 31]);
    expect([...blockedDays(october, [], LOS_ANGELES)]).toStrictEqual([]);
  });

  it("knows when someone is away right now", () => {
    expect(
      isAwayNow(allDay, new Date("2026-10-31T12:00:00.000Z"))
    ).toBeTruthy();
    expect(isAwayNow(allDay, new Date("2026-10-29T12:00:00.000Z"))).toBeFalsy();
  });
});

describe("The person's month", () => {
  const later: MonthDay = {
    day: 18,
    kind: "service",
    positionName: "Keys",
    serviceTypeName: "Sunday",
    status: "U",
    planUrl: "/services/1101/plans/9/lineup",
  };
  const sunday: MonthDay = {
    day: 4,
    kind: "service",
    positionName: "Keys",
    serviceTypeName: "Sunday",
    status: "C",
    planUrl: "/services/1101/plans/8/lineup",
  };
  const rehearsal: MonthDay = {
    day: 3,
    kind: "rehearsal",
    positionName: "Keys",
    planUrl: "/services/1101/plans/8/lineup",
  };
  const entries = [later, sunday, rehearsal];

  it("splits commitments around the org day and orders them by day", () => {
    const groups = commitmentGroups(entries, october, "2026-10-04");
    expect(
      groups.map((group) => [
        group.title,
        group.entries.map((entry) => entry.day),
      ])
    ).toStrictEqual([
      ["Coming up", [4, 18]],
      ["Earlier this month", [3]],
    ]);
    expect(commitmentGroups(entries, october, "2026-11-02")).toStrictEqual([
      { title: null, isPast: true, entries: [rehearsal, sunday, later] },
    ]);
  });

  it("describes commitments and counts distinct days", () => {
    expect(describeCommitment(later)).toBe("Keys · Sunday · Pending");
    expect(describeCommitment(rehearsal)).toBe("Keys · Rehearsal");
    expect(describeMonth(entries)).toBe("2 services · 1 rehearsal");
    expect(describeMonth([])).toBe("Nothing scheduled");
  });

  it("opens the plan a commitment belongs to, and the next serving plan only in this month", () => {
    expect(commitmentPlan(later)).toStrictEqual({
      serviceTypeId: "1101",
      planId: "9",
    });
    expect(commitmentPlan({ planUrl: "/elsewhere" })).toBeNull();
    expect(nextServingPlan("2026-10-04", october, entries)).toStrictEqual({
      serviceTypeId: "1101",
      planId: "8",
    });
    expect(nextServingPlan("2026-11-01", october, entries)).toBeNull();
  });

  it("accepts only YYYY-MM month params", () => {
    expect(parseMonthParam("2026-11")).toBe("2026-11");
    expect(parseMonthParam("2026-11-01")).toBeNull();
    expect(parseMonthParam(["2026-11"])).toBeNull();
  });

  it("paints a known person from the dashboard for its month only", () => {
    const roster: Roster = {
      generatedAt: "",
      month: october,
      people: [
        {
          id: "p",
          name: "Pat Lee",
          initials: "PL",
          photoThumbnailUrl: null,
          teams: ["Band"],
        },
      ],
      teams: [],
      ledTeamIds: [],
    };
    const dashboard = cachedDashboard(roster, [
      { id: "p", rhythm: rhythm(), roles: ["Keys"], monthDays: entries },
    ]);
    expect(placeholderDetail(dashboard, "p", null)).toMatchObject({
      person: { name: "Pat Lee" },
      previousMonth: "2026-09",
      nextMonth: "2026-11",
      continuation: null,
    });
    expect(placeholderDetail(dashboard, "p", "2026-11")).toBeUndefined();
    expect(placeholderDetail(dashboard, "someone-else", null)).toBeUndefined();
    expect(
      placeholderDetail(cachedDashboard(undefined, []), "p", null)
    ).toBeUndefined();
  });
});

describe("Signals on the organization's day", () => {
  it("flags a reply waiting within a week and who is due or not serving", () => {
    const waiting = personSignals(
      rhythm({
        pendingUpcoming: 2,
        nextPendingOn: "2026-10-08",
        nextServingOn: "2026-10-08",
      }),
      "2026-10-04",
      null
    );
    expect(waiting).toStrictEqual([
      { kind: "waiting", nextPendingOn: "2026-10-08", pending: 2 },
    ]);
    expect(waiting.map(describeSignal)).toStrictEqual([
      { label: "No reply", detail: "Hasn't answered for Thu, Oct 8 (2 open)." },
    ]);
    const notServing = personSignals(rhythm(), "2026-10-04", null);
    expect(notServing).toStrictEqual([
      { kind: "due", daysSinceServed: null, typicalGapDays: null },
    ]);
    expect(notServing.every(isListSignal)).toBeTruthy();
    const due = personSignals(
      rhythm({ lastServedOn: "2026-08-01" }),
      "2026-10-04",
      null
    );
    expect(due.filter(isListSignal)).toStrictEqual([]);
  });

  it("finds drifting regulars and heavy loads against the team pace", () => {
    expect(
      personSignals(
        rhythm({
          lastServedOn: "2026-07-01",
          servedDays180: 6,
          typicalGapDays: 14,
        }),
        "2026-10-04",
        null
      ).map((signal) => signal.kind)
    ).toStrictEqual(["drifting", "due"]);
    expect(
      personSignals(
        rhythm({ servedDays30: 4, nextServingOn: "2026-10-11" }),
        "2026-10-04",
        3
      )
    ).toStrictEqual([
      { kind: "overloaded", basis: "recent", days: 4, teamPace: 3 },
    ]);
  });

  it("summarizes team health over loaded members", () => {
    const { members } = assembleDashboard(
      {
        generatedAt: "",
        month: october,
        people: ["a", "b", "c"].map((id) => ({
          id,
          name: id,
          initials: id,
          photoThumbnailUrl: null,
          teams: [],
        })),
        teams: [],
        ledTeamIds: [],
      },
      [
        {
          id: "a",
          rhythm: rhythm({ servedDays90: 9, nextServingOn: "2026-10-11" }),
          roles: [],
          monthDays: [],
        },
        {
          id: "b",
          rhythm: rhythm({ servedDays90: 1, nextServingOn: "2026-10-11" }),
          roles: [],
          monthDays: [],
        },
        {
          id: "c",
          rhythm: rhythm({ servedDays90: 1, nextServingOn: "2026-10-11" }),
          roles: [],
          monthDays: [],
        },
      ],
      {
        scopePersonIds: ["a", "b", "c"],
        sampleCount: 3,
        loadingPersonIds: new Set(),
      }
    );
    const health = computeTeamHealth(members, [], "2026-10-04");
    expect(health.status).toBe("stretched");
    expect(describeHealth(health)).toBe(
      "3 of 3 people served in the last 90 days, but the busiest 1 person covered 82% of serving days."
    );
  });
});

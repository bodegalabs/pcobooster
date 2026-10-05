import {
  checkInReasons,
  computeMemberPaces,
  computeTeamHealth,
  describeCadence,
  describePersonSignal,
  dueThresholdDays,
  heavyThirtyDayLoad,
  isRosterSignal,
  personSignals,
  waitingReply,
} from "@pcobooster/client/team-health";
import type {
  PeopleDashboardPerson,
  ServingRhythm,
} from "@pcobooster/contracts/people-schemas";
import { describe, expect, it } from "vitest";

const TODAY = "2026-09-25";

const rhythm = (overrides: Partial<ServingRhythm> = {}): ServingRhythm => ({
  lastServedOn: "2026-09-20",
  nextServingOn: "2026-10-11",
  servedDays30: 1,
  servedDays90: 4,
  servedDays180: 8,
  upcomingDays30: 1,
  typicalGapDays: 21,
  requests180: 9,
  declined180: 0,
  pendingUpcoming: 0,
  nextPendingOn: null,
  ...overrides,
});

const member = (
  name: string,
  overrides: Partial<ServingRhythm> = {}
): PeopleDashboardPerson => ({
  id: name.toLowerCase(),
  name,
  initials: name.slice(0, 2).toUpperCase(),
  photoThumbnailUrl: null,
  teams: ["Band"],
  roles: ["Vocals"],
  monthDays: [],
  rhythm: rhythm(overrides),
});

const teamOf = (members: readonly PeopleDashboardPerson[]) => [
  { personIds: members.map(({ id }) => id) },
];

const notServing = {
  lastServedOn: null,
  nextServingOn: null,
  servedDays30: 0,
  servedDays90: 0,
  servedDays180: 0,
  upcomingDays30: 0,
  typicalGapDays: null,
  requests180: 0,
} satisfies Partial<ServingRhythm>;

describe(dueThresholdDays, () => {
  it("scales with the person's own rhythm but never drops below six weeks", () => {
    expect(dueThresholdDays(null)).toBe(42);
    expect(dueThresholdDays(7)).toBe(42);
    expect(dueThresholdDays(42)).toBe(63);
  });
});

describe(checkInReasons, () => {
  it("has nothing to say about a steady server", () => {
    expect(checkInReasons(rhythm(), TODAY, 4)).toStrictEqual([]);
  });

  it("flags a regular who stopped serving, relative to their usual gap", () => {
    const monthly = rhythm({
      lastServedOn: "2026-08-02",
      nextServingOn: null,
      typicalGapDays: 28,
      servedDays180: 5,
    });

    // 54 days is still inside the eight-week floor.
    expect(checkInReasons(monthly, TODAY, null)).toStrictEqual([]);
    expect(
      checkInReasons({ ...monthly, lastServedOn: "2026-07-25" }, TODAY, null)
    ).toStrictEqual([
      { kind: "drifting", lastServedOn: "2026-07-25", typicalGapDays: 28 },
    ]);
  });

  it("does not call someone drifting when they are already scheduled", () => {
    expect(
      checkInReasons(
        rhythm({ lastServedOn: "2026-05-03", servedDays180: 5 }),
        TODAY,
        null
      )
    ).toStrictEqual([]);
  });

  it("leaves unanswered requests and people who never served to the other lists", () => {
    expect(
      checkInReasons(
        rhythm({ pendingUpcoming: 4, nextPendingOn: "2026-09-27" }),
        TODAY,
        null
      )
    ).toStrictEqual([]);
    expect(checkInReasons(rhythm(notServing), TODAY, null)).toStrictEqual([]);
  });

  it("flags a pattern of declines, not a single one", () => {
    expect(
      checkInReasons(rhythm({ declined180: 1, requests180: 2 }), TODAY, null)
    ).toStrictEqual([]);
    expect(
      checkInReasons(rhythm({ declined180: 3, requests180: 6 }), TODAY, null)
    ).toStrictEqual([{ kind: "declining", declined: 3, requests: 6 }]);
  });

  it("scales the heavy 30-day load with the team's pace, between weekly and weekly-plus", () => {
    expect(heavyThirtyDayLoad(3)).toBe(4);
    expect(heavyThirtyDayLoad(7)).toBe(5);
    expect(heavyThirtyDayLoad(12)).toBe(6);
    // A weekly team does not flag a weekly server.
    expect(
      checkInReasons(rhythm({ servedDays30: 5 }), TODAY, 12)
    ).toStrictEqual([]);
  });

  it("does not call weekly serving heavy when the team's pace is unknown", () => {
    expect(heavyThirtyDayLoad(null)).toBe(6);
    expect(
      checkInReasons(rhythm({ servedDays30: 5 }), TODAY, null)
    ).toStrictEqual([]);
    expect(
      checkInReasons(rhythm({ servedDays30: 6 }), TODAY, null)
    ).toStrictEqual([
      { kind: "overloaded", basis: "recent", days: 6, teamPace: null },
    ]);
  });

  it("flags heavy recent serving and serving at twice the team's pace", () => {
    expect(checkInReasons(rhythm({ servedDays30: 4 }), TODAY, 3)).toStrictEqual(
      [{ kind: "overloaded", basis: "recent", days: 4, teamPace: 3 }]
    );
    expect(checkInReasons(rhythm({ servedDays90: 9 }), TODAY, 4)).toStrictEqual(
      [{ kind: "overloaded", basis: "team-pace", days: 9, teamPace: 4 }]
    );
    expect(checkInReasons(rhythm({ servedDays90: 9 }), TODAY, 5)).toStrictEqual(
      []
    );
  });
});

describe(waitingReply, () => {
  it("waits on an unanswered request in the next seven days, today included", () => {
    expect(
      waitingReply(
        rhythm({ pendingUpcoming: 1, nextPendingOn: "2026-09-25" }),
        TODAY
      )
    ).toStrictEqual({ nextPendingOn: "2026-09-25", pending: 1 });
    expect(
      waitingReply(
        rhythm({ pendingUpcoming: 3, nextPendingOn: "2026-10-02" }),
        TODAY
      )
    ).toStrictEqual({ nextPendingOn: "2026-10-02", pending: 3 });
  });

  it("does not chase requests further out, however many are open", () => {
    expect(
      waitingReply(
        rhythm({ pendingUpcoming: 5, nextPendingOn: "2026-10-03" }),
        TODAY
      )
    ).toBeNull();
  });
});

describe(personSignals, () => {
  it("lists waiting, check-in, and due signals in the dashboard's order", () => {
    const signals = personSignals(
      rhythm({
        lastServedOn: "2026-06-28",
        nextServingOn: null,
        typicalGapDays: 14,
        servedDays180: 6,
        declined180: 2,
        requests180: 4,
        pendingUpcoming: 1,
        nextPendingOn: "2026-09-27",
      }),
      TODAY,
      null
    );

    expect(signals.map(({ kind }) => kind)).toStrictEqual([
      "waiting",
      "declining",
      "drifting",
      "due",
    ]);
  });

  it("shows someone who never served as not serving, in the roster too", () => {
    const [signal] = personSignals(rhythm(notServing), TODAY, null);

    expect(signal).toStrictEqual({
      kind: "due",
      daysSinceServed: null,
      typicalGapDays: null,
    });
    expect(
      signal === undefined ? null : describePersonSignal(signal)
    ).toStrictEqual({
      label: "Not serving",
      detail: "No serving in the last 6 months; nothing scheduled.",
    });
    expect(signal === undefined ? false : isRosterSignal(signal)).toBeTruthy();
    expect(
      isRosterSignal({ kind: "due", daysSinceServed: 50, typicalGapDays: 14 })
    ).toBeFalsy();
  });
});

describe(computeMemberPaces, () => {
  it("judges each person by the busiest pace among their own teams", () => {
    const weekly = ["Ana", "Ben", "Cam"].map((name) =>
      member(name, { servedDays90: 12 })
    );
    const monthly = ["Dee", "Eve", "Fay"].map((name) =>
      member(name, { servedDays90: 3 })
    );
    const both = member("Gus", { servedDays90: 9 });

    const paces = computeMemberPaces(
      [...weekly, ...monthly, both],
      [
        { personIds: [...weekly.map(({ id }) => id), both.id] },
        { personIds: [...monthly.map(({ id }) => id), both.id] },
        // Too few active people to have a pace.
        { personIds: ["ana", "missing"] },
      ]
    );

    expect(Object.fromEntries(paces)).toStrictEqual({
      ana: 12,
      ben: 12,
      cam: 12,
      dee: 3,
      eve: 3,
      fay: 3,
      // On both teams: the weekly team's pace, so weekly serving is not "heavy".
      gus: 12,
    });
  });
});

describe(computeTeamHealth, () => {
  it("lists who is due for a slot, most overdue for their rhythm first", () => {
    const members = [
      member("Scheduled"),
      member("Recent", { lastServedOn: "2026-09-06", nextServingOn: null }),
      member("Weekly", {
        lastServedOn: "2026-08-02",
        nextServingOn: null,
        typicalGapDays: 7,
      }),
      member("Monthly", {
        lastServedOn: "2026-08-09",
        nextServingOn: null,
        typicalGapDays: 30,
      }),
      member("Never", notServing),
    ];
    const health = computeTeamHealth(members, teamOf(members), TODAY);

    expect(
      health.dueForSlot.map(({ member: { name }, daysSinceServed }) => [
        name,
        daysSinceServed,
      ])
    ).toStrictEqual([
      ["Weekly", 54],
      ["Monthly", 47],
      ["Never", null],
    ]);
    // Not serving is a scheduling matter, not a check-in.
    expect(health.checkIns.map(({ member: { name } }) => name)).toStrictEqual(
      []
    );
  });

  it("splits unanswered requests into their own list, soonest first", () => {
    const members = [
      member("Later", { pendingUpcoming: 1, nextPendingOn: "2026-10-01" }),
      member("Soon", { pendingUpcoming: 2, nextPendingOn: "2026-09-26" }),
      member("Far", { pendingUpcoming: 3, nextPendingOn: "2026-11-01" }),
    ];
    const health = computeTeamHealth(members, teamOf(members), TODAY);

    expect(
      health.waitingOnReply.map(({ member: { name } }) => name)
    ).toStrictEqual(["Soon", "Later"]);
    expect(health.checkIns).toStrictEqual([]);
    expect(health.pendingCount).toBe(6);
  });

  it("calls a team stretched when a few people carry most of the serving", () => {
    const quiet = { servedDays90: 1, servedDays30: 0 };
    const members = [
      member("Ana", { servedDays90: 12, servedDays30: 3 }),
      member("Ben", quiet),
      member("Cam", quiet),
      member("Dee", quiet),
      member("Eve", quiet),
    ];
    const health = computeTeamHealth(members, teamOf(members), TODAY);

    expect(health).toMatchObject({
      memberCount: 5,
      activeCount: 5,
      topShare: 0.75,
      teamPace: 1,
      status: "stretched",
    });
    expect(health.checkIns.map(({ member: { name } }) => name)).toStrictEqual([
      "Ana",
    ]);
    expect(health.signalsById.get("ana")).toStrictEqual([
      { kind: "overloaded", basis: "team-pace", days: 12, teamPace: 1 },
    ]);
  });

  it("calls a team thin when fewer than half served in 90 days", () => {
    const idle = { servedDays90: 0, servedDays30: 0 };
    const members = [member("Ana"), member("Ben", idle), member("Cam", idle)];
    const health = computeTeamHealth(members, teamOf(members), TODAY);

    expect(health.status).toBe("thin");
  });
});

describe(describePersonSignal, () => {
  it("writes reasons a leader can act on", () => {
    expect(
      describePersonSignal({
        kind: "drifting",
        lastServedOn: "2026-07-12",
        typicalGapDays: 14,
      })
    ).toStrictEqual({
      label: "Drifting",
      detail: "Last served Jul 12, usually every 2 weeks; nothing scheduled.",
    });
    expect(
      describePersonSignal({
        kind: "waiting",
        nextPendingOn: "2026-09-27",
        pending: 2,
      })
    ).toStrictEqual({
      label: "No reply",
      detail: "Hasn't answered for Sun, Sep 27 (2 open).",
    });
    expect(describeCadence(29)).toBe("about monthly");
  });
});

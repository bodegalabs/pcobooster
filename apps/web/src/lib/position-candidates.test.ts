import type {
  PlanWindowHistoryBatch,
  PositionCandidates,
} from "@pcobooster/contracts/people-schemas";
import { describe, expect, it } from "vitest";

import {
  advancedBlockoutChecks,
  assembleCandidateList,
  expandWindowHistory,
  needsScheduleHistory,
  planCandidateDetailsBatches,
  windowHistoryAdvanced,
} from "@/lib/position-candidates";
import type { CandidateDetail } from "@/lib/position-candidates";

const DATE = "2026-09-27T17:00:00.000Z";

const candidate = (id: string, fullName: string) => ({
  id,
  firstName: fullName.split(" ")[0] ?? fullName,
  lastName: fullName.split(" ")[1] ?? "",
  fullName,
  photoUrl: null,
  photoThumbnailUrl: null,
  archived: false,
  selectedPlanRosterLabels: [],
  selectedPlanSlot: null,
});

const candidates: PositionCandidates = {
  generatedAt: DATE,
  timeZone: "America/Los_Angeles",
  match: { planId: "plan-1", teamId: "team-1", selectedPositionName: "Keys" },
  candidates: [
    candidate("p-busy", "Zed Busy"),
    candidate("p-free", "Amy Free"),
  ],
};

const windowCall = (loadedPlanCount: number): PlanWindowHistoryBatch => ({
  generatedAt: DATE,
  loadedPlanCount,
  plans: [
    {
      id: "plan-0",
      title: "Two weeks ago",
      sortDate: "2026-09-13T17:00:00.000Z",
      serviceTypeName: "Sunday",
    },
  ],
  planTimes: [],
  people: [
    {
      personId: "p-busy",
      rows: [
        {
          id: "pp-0",
          planId: "plan-0",
          teamId: "team-1",
          teamPositionName: "Keys",
          status: "C",
          createdAt: DATE,
          timeIds: [],
          serviceTimeIds: [],
          declineReason: null,
        },
      ],
    },
  ],
  deferredPlans: [],
  deferredServiceTypeIds: [],
  requestBudget: {
    limit: 36,
    planningCenterRequests: 3,
    planRangeRequests: 1,
    rosterRequests: 1,
  },
});

const detail = (personId: string, blocked: boolean): CandidateDetail => ({
  personId,
  isBlockedForDate: blocked,
});

describe(assembleCandidateList, () => {
  it("shows candidates in their own order without scores until every part arrives", () => {
    const list = assembleCandidateList({
      candidates,
      windowHistory: undefined,
      scheduleHistory: false,
      details: new Map([["p-busy", detail("p-busy", false)]]),
      date: DATE,
    });

    expect({
      complete: list.complete,
      progress: list.progress,
      people: list.people.map((person) => ({
        id: person.id,
        score: person.recommendationScore,
        availability: person.availability,
      })),
    }).toStrictEqual({
      complete: false,
      progress: { candidateCount: 2, detailedCount: 1, historyLoaded: false },
      people: [
        { id: "p-busy", score: undefined, availability: "available" },
        { id: "p-free", score: undefined, availability: "unknown" },
      ],
    });
  });

  it("scores and sorts once history and every candidate's availability arrived", () => {
    const list = assembleCandidateList({
      candidates,
      windowHistory: expandWindowHistory([windowCall(1)], "plan-1"),
      scheduleHistory: false,
      details: new Map([
        ["p-busy", detail("p-busy", false)],
        ["p-free", detail("p-free", false)],
      ]),
      date: DATE,
    });

    expect({
      complete: list.complete,
      order: list.people.map(({ id }) => id),
      busyServedRecently: list.people.find(({ id }) => id === "p-busy")
        ?.frequency?.recentServedDays,
    }).toStrictEqual({
      complete: true,
      order: ["p-free", "p-busy"],
      busyServedRecently: 1,
    });
  });
});

describe(needsScheduleHistory, () => {
  it("is needed only when no window call found a plan", () => {
    expect([
      needsScheduleHistory([windowCall(0)]),
      needsScheduleHistory([windowCall(0), windowCall(2)]),
    ]).toStrictEqual([true, false]);
  });
});

describe(planCandidateDetailsBatches, () => {
  it("cuts candidates into batches in list order", () => {
    expect(planCandidateDetailsBatches(candidates, 1)).toStrictEqual([
      ["p-busy"],
      ["p-free"],
    ]);
  });
});

describe(windowHistoryAdvanced, () => {
  const continuation = {
    plans: [
      { serviceTypeId: "st-1", planId: "plan-1", rosterRequests: 1 },
      { serviceTypeId: "st-1", planId: "plan-2", rosterRequests: 1 },
    ],
    serviceTypeIds: ["st-2"],
  };

  it("counts rosters read, plans that left the window, and newly listed service types", () => {
    expect([
      windowHistoryAdvanced(continuation, windowCall(1)),
      windowHistoryAdvanced(continuation, {
        ...windowCall(0),
        deferredPlans: [
          { serviceTypeId: "st-1", planId: "plan-2", rosterRequests: 1 },
        ],
        deferredServiceTypeIds: ["st-2"],
      }),
      windowHistoryAdvanced(continuation, {
        ...windowCall(0),
        deferredPlans: [
          ...continuation.plans,
          { serviceTypeId: "st-2", planId: "plan-3", rosterRequests: 1 },
        ],
        deferredServiceTypeIds: [],
      }),
    ]).toStrictEqual([true, true, true]);
  });

  it("reports a call that read nothing and listed nothing", () => {
    expect(
      windowHistoryAdvanced(continuation, {
        ...windowCall(0),
        deferredPlans: continuation.plans,
        deferredServiceTypeIds: continuation.serviceTypeIds,
      })
    ).toBeFalsy();
  });
});

describe(advancedBlockoutChecks, () => {
  const before = [
    { personId: "p-1", checkedBlockoutIds: ["b-1"], blocked: false },
  ];

  it("counts newly checked blockouts and newly found blocks", () => {
    expect([
      advancedBlockoutChecks(before, [
        { personId: "p-1", checkedBlockoutIds: ["b-1", "b-2"], blocked: false },
      ]),
      advancedBlockoutChecks(before, [
        { personId: "p-1", checkedBlockoutIds: ["b-1"], blocked: true },
      ]),
      advancedBlockoutChecks(
        [],
        [{ personId: "p-2", checkedBlockoutIds: ["b-9"], blocked: false }]
      ),
    ]).toStrictEqual([true, true, true]);
  });

  it("reports progress that did not move", () => {
    expect([
      advancedBlockoutChecks(before, before),
      advancedBlockoutChecks([], []),
    ]).toStrictEqual([false, false]);
  });
});

import type {
  PlanWindowHistoryBatch,
  PositionCandidates,
} from "@pcobooster/contracts/people-schemas";
import {
  assembleCandidateList,
  CANDIDATE_DETAILS_BATCH_CONCURRENCY,
  candidateDetailsAdvanced,
  expandWindowHistory,
  needsScheduleHistory,
  planCandidateDetailsBatches,
  prefetchCandidateDetailBatches,
  windowHistoryAdvanced,
} from "@pcobooster/planning-center-models/candidate-list";
import type {
  CandidateDetail,
  CandidateDetailsBatch,
  CandidateDetailsContinuation,
} from "@pcobooster/planning-center-models/candidate-list";
import { describe, expect, it, vi } from "vitest";

const DATE = "2026-09-27T17:00:00.000Z";

describe(prefetchCandidateDetailBatches, () => {
  it("bounds speculative calls and fetches every batch once", async () => {
    const batches = [["a"], ["b"], ["c"], ["d"], ["e"]];
    const requested: string[][] = [];
    const release = Promise.withResolvers<null>();
    let active = 0;
    let maximumActive = 0;
    const fetching = prefetchCandidateDetailBatches(
      batches,
      async (personIds) => {
        requested.push(personIds);
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await release.promise;
        active -= 1;
      }
    );
    try {
      await vi.waitFor(() => {
        expect(requested).toHaveLength(CANDIDATE_DETAILS_BATCH_CONCURRENCY);
      });
    } finally {
      release.resolve(null);
      await fetching;
    }
    expect(maximumActive).toBe(CANDIDATE_DETAILS_BATCH_CONCURRENCY);
    expect(requested).toStrictEqual(batches);
  });
});

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
  schedulingPreferences: null,
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
  deferredRanges: [],
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

const planRef = (planId: string, serviceTypeId = "st-1", rangeOffset = 0) => ({
  serviceTypeId,
  planId,
  rosterRequests: 1,
  rangeOffset,
});

describe(windowHistoryAdvanced, () => {
  const continuation = {
    plans: [planRef("plan-1"), planRef("plan-2")],
    ranges: [{ serviceTypeId: "st-2", offset: 100 }],
  };

  it("counts rosters read, plans that left the window, and range pages listed", () => {
    expect([
      windowHistoryAdvanced(continuation, windowCall(1)),
      windowHistoryAdvanced(continuation, {
        ...windowCall(0),
        deferredPlans: [planRef("plan-2")],
        deferredRanges: continuation.ranges,
      }),
      windowHistoryAdvanced(continuation, {
        ...windowCall(0),
        deferredPlans: [...continuation.plans, planRef("plan-3", "st-2", 100)],
        deferredRanges: [{ serviceTypeId: "st-2", offset: 200 }],
      }),
      windowHistoryAdvanced(continuation, {
        ...windowCall(0),
        deferredPlans: [],
        deferredRanges: [],
      }),
    ]).toStrictEqual([true, true, true, true]);
  });

  it("reports a call that read nothing and listed nothing", () => {
    expect(
      windowHistoryAdvanced(continuation, {
        ...windowCall(0),
        deferredPlans: continuation.plans,
        deferredRanges: continuation.ranges,
      })
    ).toBeFalsy();
  });
});

const progress = (datesOffset: number): CandidateDetailsContinuation => ({
  people: [
    {
      personId: "p-1",
      blocked: false,
      blockoutsOffset: null,
      pendingBlockouts: [{ blockoutId: "b-1", timeZone: "UTC", datesOffset }],
      rehearsalTimes: { plans: [], times: [] },
    },
  ],
});
const batch = (
  continuation: CandidateDetailsContinuation,
  people: CandidateDetailsBatch["people"] = []
): CandidateDetailsBatch => ({ people, continuation });

describe(candidateDetailsAdvanced, () => {
  it("counts a call that only moved a page cursor, or finished someone", () => {
    expect([
      candidateDetailsAdvanced(progress(100), batch(progress(200))),
      candidateDetailsAdvanced(undefined, batch(progress(0))),
      candidateDetailsAdvanced(
        progress(100),
        batch(progress(100), [detail("p-2", false)])
      ),
    ]).toStrictEqual([true, true, true]);
  });

  it("reports a call that handed back the continuation it was given", () => {
    expect(
      candidateDetailsAdvanced(progress(100), batch(progress(100)))
    ).toBeFalsy();
  });
});

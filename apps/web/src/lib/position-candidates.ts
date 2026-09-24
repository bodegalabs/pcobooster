import type {
  CandidateDetailsBatch,
  PlanWindowHistoryBatch,
  PositionCandidates,
} from "@pcobooster/contracts/people-schemas";
import { expandPlanWindowHistory } from "@pcobooster/planning-center-models/plan-window-history";
import {
  assemblePositionCandidates,
  EMPTY_CANDIDATE_HISTORY,
} from "@pcobooster/planning-center-models/position-candidates";
import type { CandidateHistory } from "@pcobooster/planning-center-models/position-candidates";
import type { PersonWithAvailability } from "@pcobooster/planning-center-models/types";

/**
 * Candidate detail calls in flight at once. Each costs about 20 Planning
 * Center requests cold, and the user's budget is 100 per 20 seconds.
 */
export const CANDIDATE_DETAILS_BATCH_CONCURRENCY = 2;

export type CandidateDetail = CandidateDetailsBatch["people"][number];

/** Candidate IDs in list order, cut into detail batches. */
export const planCandidateDetailsBatches = (
  candidates: PositionCandidates | undefined,
  batchSize: number
): string[][] => {
  const ids = candidates?.candidates.map(({ id }) => id) ?? [];
  const batches: string[][] = [];
  for (let start = 0; start < ids.length; start += batchSize) {
    batches.push(ids.slice(start, start + batchSize));
  }
  return batches;
};

/**
 * The window had no plans to take history from, so every candidate's history comes from their
 * own schedules instead. Unknown until every window call has arrived.
 */
export const needsScheduleHistory = (
  windowCalls: readonly PlanWindowHistoryBatch[] | undefined
): boolean =>
  windowCalls !== undefined &&
  windowCalls.every(({ loadedPlanCount }) => loadedPlanCount === 0);

type WindowPlanRef = PlanWindowHistoryBatch["deferredPlans"][number];

/**
 * Whether a follow-up window call got anywhere: it read a roster, dropped a plan that left the
 * window, or listed another service type's plans. A call that did none would repeat forever.
 */
export const windowHistoryAdvanced = (
  continuation: {
    readonly plans: readonly WindowPlanRef[];
    readonly serviceTypeIds: readonly string[];
  },
  batch: PlanWindowHistoryBatch
): boolean => {
  const stillDeferred = new Set(
    batch.deferredPlans.map(({ planId }) => planId)
  );
  return (
    batch.loadedPlanCount > 0 ||
    batch.deferredServiceTypeIds.length < continuation.serviceTypeIds.length ||
    continuation.plans.some(({ planId }) => !stillDeferred.has(planId))
  );
};

type BlockoutProgress = CandidateDetailsBatch["blockoutProgress"];

/** Whether a candidate details call checked another blockout or found a block. */
export const advancedBlockoutChecks = (
  before: BlockoutProgress,
  after: BlockoutProgress
): boolean => {
  const earlier = new Map(before.map((entry) => [entry.personId, entry]));
  return after.some(({ personId, checkedBlockoutIds, blocked }) => {
    const previous = earlier.get(personId);
    return (
      blocked !== (previous?.blocked ?? false) ||
      checkedBlockoutIds.length > (previous?.checkedBlockoutIds.length ?? 0)
    );
  });
};

export interface CandidateListProgress {
  candidateCount: number;
  /** Candidates whose availability (and history, when it is theirs) arrived. */
  detailedCount: number;
  historyLoaded: boolean;
}

export interface CandidateList {
  people: PersonWithAvailability[];
  /** Every part arrived: scores exist and people are sorted for selection. */
  complete: boolean;
  progress: CandidateListProgress;
}

/**
 * The candidate list as far as its parts have arrived. People without history or availability
 * yet have no score and `availability: "unknown"`.
 */
export const assembleCandidateList = ({
  candidates,
  windowHistory,
  scheduleHistory,
  details,
  date,
}: {
  candidates: PositionCandidates;
  /** Expanded window history; undefined while it loads or when it is not used. */
  windowHistory: ReadonlyMap<string, CandidateHistory> | undefined;
  /** History comes from `details` instead of the window. */
  scheduleHistory: boolean;
  details: ReadonlyMap<string, CandidateDetail>;
  date: string;
}): CandidateList => {
  const historyFor = (personId: string) => {
    if (scheduleHistory) {
      return details.get(personId)?.history;
    }
    return windowHistory === undefined
      ? undefined
      : (windowHistory.get(personId) ?? EMPTY_CANDIDATE_HISTORY);
  };
  const { people, complete } = assemblePositionCandidates({
    candidates: candidates.candidates,
    match: candidates.match,
    referenceDate: new Date(date),
    timeZone: candidates.timeZone,
    historyFor,
    blockedFor: (personId) => details.get(personId)?.isBlockedForDate,
  });
  return {
    people,
    complete,
    progress: {
      candidateCount: candidates.candidates.length,
      detailedCount: candidates.candidates.filter(({ id }) => {
        const detail = details.get(id);
        return (
          detail !== undefined &&
          (!scheduleHistory || detail.history !== undefined)
        );
      }).length,
      historyLoaded: scheduleHistory || windowHistory !== undefined,
    },
  };
};

/** Each person's window history, or undefined while it loads or when the window is empty. */
export const expandWindowHistory = (
  windowCalls: readonly PlanWindowHistoryBatch[] | undefined,
  planId: string
): Map<string, CandidateHistory> | undefined =>
  windowCalls === undefined || needsScheduleHistory(windowCalls)
    ? undefined
    : expandPlanWindowHistory(windowCalls, planId);

/** Details from every settled batch, keyed by person. */
export const collectCandidateDetails = (
  batches: readonly (readonly CandidateDetail[] | undefined)[]
): Map<string, CandidateDetail> => {
  const details = new Map<string, CandidateDetail>();
  for (const batch of batches) {
    for (const detail of batch ?? []) {
      details.set(detail.personId, detail);
    }
  }
  return details;
};

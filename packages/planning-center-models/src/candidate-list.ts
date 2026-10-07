import { expandPlanWindowHistory } from "@pcobooster/planning-center-models/plan-window-history";
import type { PlanWindowRosters } from "@pcobooster/planning-center-models/plan-window-history";
import {
  assemblePositionCandidates,
  EMPTY_CANDIDATE_HISTORY,
} from "@pcobooster/planning-center-models/position-candidates";
import type {
  CandidateHistory,
  PositionCandidate,
  SelectedPlanMatchContext,
} from "@pcobooster/planning-center-models/position-candidates";
import type { PersonWithAvailability } from "@pcobooster/planning-center-models/types";

/** Only the domain fields used to assemble progressive candidate reads. */
export interface CandidateDetailsBatch {
  people: {
    personId: string;
    isBlockedForDate: boolean;
    history?: CandidateHistory;
  }[];
  continuation: CandidateDetailsContinuation;
}

/**
 * Where a candidate details call stopped: each unfinished person's next blockout pages and the
 * rehearsal plan times read so far. Clients pass it back unchanged with `deferredPersonIds`.
 */
export interface CandidateDetailsContinuation {
  people: {
    personId: string;
    blocked: boolean;
    blockoutsOffset: number | null;
    pendingBlockouts: {
      blockoutId: string;
      timeZone: string | null;
      datesOffset: number;
    }[];
    rehearsalTimes: {
      plans: { planId: string; nextOffset: number | null }[];
      times: { id: string; timeType: string | null; startsAt: string | null }[];
    };
  }[];
}
export interface PlanWindowHistoryBatch extends PlanWindowRosters {
  loadedPlanCount: number;
  deferredPlans: {
    planId: string;
    serviceTypeId: string;
    rosterRequests: number;
  }[];
  deferredServiceTypeIds: string[];
}
export interface PositionCandidates {
  candidates: PositionCandidate[];
  match: SelectedPlanMatchContext;
  timeZone: string;
}

/**
 * Candidate detail calls in flight at once. Each costs about 20 Planning
 * Center requests cold, and the user's budget is 100 per 20 seconds.
 */
export const CANDIDATE_DETAILS_BATCH_CONCURRENCY = 2;

/** Speculative availability uses the same bounded batches as the visible candidate list. */
export const prefetchCandidateDetailBatches = async (
  batches: readonly string[][],
  fetchBatch: (personIds: string[]) => Promise<void>
): Promise<void> => {
  const current = batches.slice(0, CANDIDATE_DETAILS_BATCH_CONCURRENCY);
  await Promise.all(current.map(fetchBatch));
  const remaining = batches.slice(CANDIDATE_DETAILS_BATCH_CONCURRENCY);
  if (remaining.length > 0) {
    await prefetchCandidateDetailBatches(remaining, fetchBatch);
  }
};

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

/**
 * Whether a candidate details call finished someone or moved its continuation: read another
 * blockout, date, or plan-time page. A call that did neither would repeat forever.
 */
export const candidateDetailsAdvanced = (
  continuation: CandidateDetailsContinuation | undefined,
  batch: CandidateDetailsBatch
): boolean =>
  batch.people.length > 0 ||
  JSON.stringify(continuation) !== JSON.stringify(batch.continuation);

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
  slotTimePreferenceOptionId = null,
}: {
  candidates: PositionCandidates;
  /** Expanded window history; undefined while it loads or when it is not used. */
  windowHistory: ReadonlyMap<string, CandidateHistory> | undefined;
  /** History comes from `details` instead of the window. */
  scheduleHistory: boolean;
  details: ReadonlyMap<string, CandidateDetail>;
  date: string;
  /** The service time the selected slot is needed for, when Planning Center says. */
  slotTimePreferenceOptionId?: string | null;
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
    slotTimePreferenceOptionId,
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

import { getCandidateDetails } from "@pcobooster/api/modules/planning-center/get-candidate-details";
import type {
  CandidateDetail,
  CandidateDetailsBatch,
  CandidateDetailsDependencies,
} from "@pcobooster/api/modules/planning-center/get-candidate-details";
import { getPlanWindowHistory } from "@pcobooster/api/modules/planning-center/get-plan-window-history";
import type {
  PlanWindowHistoryBatch,
  PlanWindowHistoryDependencies,
  PlanWindowHistoryInput,
} from "@pcobooster/api/modules/planning-center/get-plan-window-history";
import { getPositionCandidates } from "@pcobooster/api/modules/planning-center/get-position-candidates";
import type { PositionCandidatesDependencies } from "@pcobooster/api/modules/planning-center/get-position-candidates";
import { PlanningCenterAccounting } from "@pcobooster/api/planning-center/accounting";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import { PlanningCenterRequestAccounting } from "@pcobooster/api/planning-center/request-accounting";
import { expandPlanWindowHistory } from "@pcobooster/planning-center-models/plan-window-history";
import {
  assemblePositionCandidates,
  EMPTY_CANDIDATE_HISTORY,
} from "@pcobooster/planning-center-models/position-candidates";
import type { PersonWithAvailability } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

/**
 * Loads a candidate list the way the browser does: candidates, every plan-window call, and
 * every candidate-details call (following continuations), assembled with the shared code.
 */

export type CandidateListDependencies = PositionCandidatesDependencies &
  PlanWindowHistoryDependencies &
  CandidateDetailsDependencies;

export interface CandidateListInput {
  readonly serviceTypeId: string;
  readonly positionId: string;
  readonly teamId?: string;
  readonly planId: string;
  readonly date: string;
}

/** Matches `PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE`. */
const BATCH_SIZE = 16;

/** Runs one call as if transport had already counted `spent` requests. */
const runWithSpent = async <Value>(
  program: Effect.Effect<Value, PlanningCenterError>,
  spent: number
): Promise<Value> => {
  const accounting = new PlanningCenterRequestAccounting();
  for (let index = 0; index < spent; index += 1) {
    accounting.recordRequest();
  }
  return await Effect.runPromise(
    program.pipe(Effect.provideService(PlanningCenterAccounting, accounting))
  );
};

interface Progress {
  calls: number;
}

const loadWindowHistory = async (
  dependencies: CandidateListDependencies,
  date: string,
  spent: number,
  progress: Progress,
  continuation?: PlanWindowHistoryInput["continuation"]
): Promise<PlanWindowHistoryBatch[]> => {
  const batch = await runWithSpent(
    getPlanWindowHistory({ date, continuation }, dependencies),
    spent
  );
  progress.calls += 1;
  if (
    batch.deferredPlans.length === 0 &&
    batch.deferredServiceTypeIds.length === 0
  ) {
    return [batch];
  }
  return [
    batch,
    ...(await loadWindowHistory(dependencies, date, spent, progress, {
      plans: batch.deferredPlans,
      serviceTypeIds: batch.deferredServiceTypeIds,
    })),
  ];
};

const loadDetails = async (
  dependencies: CandidateListDependencies,
  request: {
    personIds: string[];
    planId: string;
    date: string;
    scheduleHistory: boolean;
    blockoutProgress?: CandidateDetailsBatch["blockoutProgress"];
  },
  spent: number,
  progress: Progress
): Promise<CandidateDetail[]> => {
  if (request.personIds.length === 0) {
    return [];
  }
  const batch = await runWithSpent(
    getCandidateDetails(request, dependencies),
    spent
  );
  progress.calls += 1;
  if (batch.deferredPersonIds.length === 0) {
    return batch.people;
  }
  if (
    batch.people.length === 0 &&
    batch.blockoutProgress.length === 0 &&
    batch.deferredPersonIds.length >= request.personIds.length
  ) {
    throw new Error("Candidate details made no progress");
  }
  return [
    ...batch.people,
    ...(await loadDetails(
      dependencies,
      {
        ...request,
        personIds: batch.deferredPersonIds,
        blockoutProgress: batch.blockoutProgress,
      },
      spent,
      progress
    )),
  ];
};

export interface LoadedCandidateList {
  people: PersonWithAvailability[];
  complete: boolean;
  calls: number;
}

/** `spent`: requests counted before every call, to force small batches. */
export const loadPositionCandidatesProgressively = async (
  input: CandidateListInput,
  dependencies: CandidateListDependencies,
  { spent = 0 }: { spent?: number } = {}
): Promise<LoadedCandidateList> => {
  const progress: Progress = { calls: 1 };
  const [candidates, windowCalls] = await Promise.all([
    Effect.runPromise(getPositionCandidates(input, dependencies)),
    loadWindowHistory(dependencies, input.date, spent, progress),
  ]);
  const windowHistory = expandPlanWindowHistory(windowCalls, input.planId);
  const scheduleHistory = windowCalls.every(
    ({ loadedPlanCount }) => loadedPlanCount === 0
  );
  const ids = candidates.candidates.map(({ id }) => id);
  const batches: string[][] = [];
  for (let start = 0; start < ids.length; start += BATCH_SIZE) {
    batches.push(ids.slice(start, start + BATCH_SIZE));
  }
  const batchDetails = await Promise.all(
    batches.map(
      async (personIds) =>
        await loadDetails(
          dependencies,
          {
            personIds,
            planId: input.planId,
            date: input.date,
            scheduleHistory,
          },
          spent,
          progress
        )
    )
  );
  const details = new Map(
    batchDetails.flat().map((detail) => [detail.personId, detail])
  );
  const { people, complete } = assemblePositionCandidates({
    candidates: candidates.candidates,
    match: candidates.match,
    referenceDate: new Date(input.date),
    timeZone: candidates.timeZone,
    historyFor: (personId) =>
      scheduleHistory
        ? details.get(personId)?.history
        : (windowHistory.get(personId) ?? EMPTY_CANDIDATE_HISTORY),
    blockedFor: (personId) => details.get(personId)?.isBlockedForDate,
  });
  return { people, complete, calls: progress.calls };
};

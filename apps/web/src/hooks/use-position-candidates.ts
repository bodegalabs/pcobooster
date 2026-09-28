import { PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE } from "@pcobooster/contracts/people";
import type {
  CandidateDetailsBatch,
  PlanWindowHistoryBatch,
  PositionCandidates,
} from "@pcobooster/contracts/people-schemas";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  QueryClient,
  QueryFunctionContext,
  UseQueryResult,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { isQueryFresh } from "@/lib/intent-prefetch";
import {
  advancedBlockoutChecks,
  assembleCandidateList,
  CANDIDATE_DETAILS_BATCH_CONCURRENCY,
  collectCandidateDetails,
  expandWindowHistory,
  needsScheduleHistory,
  planCandidateDetailsBatches,
  windowHistoryAdvanced,
} from "@/lib/position-candidates";
import type {
  CandidateDetail,
  CandidateListProgress,
} from "@/lib/position-candidates";
import {
  readCachedCandidateAvailability,
  readCachedPlanWindowHistory,
  readCachedPositionCandidates,
  writeCachedCandidateAvailability,
  writeCachedPlanWindowHistory,
  writeCachedPositionCandidates,
} from "@/lib/position-candidates-cache";
import {
  hydrateQueryFromCache,
  useHydrateQueryFromCache,
} from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import { callForQuery, speculativeQuery } from "@/lib/request-priority";
import { orpc } from "@/orpc-client";

/**
 * The selected plan's roster rarely changes behind the scheduler's back, and this app's
 * schedule writes refresh it, so candidates, like the history and blockouts they are scored
 * with, stay fresh as long as the server keeps them.
 */
const CANDIDATE_LIST_STALE_TIME_MS = 5 * 60 * 1000;

/** A position on a plan: what the Assign view lists candidates for. */
export interface CandidateSlot {
  serviceTypeId: string;
  teamId: string | null;
  positionId: string;
  planId: string;
  /** The plan's sort instant as an ISO string. */
  dateKey: string;
  /** The service time the slot is needed for; ranks people who prefer other times lower. */
  timePreferenceOptionId?: string | null;
}

export const toPlanDateKey = (date: Date | string | null): string | null => {
  if (date === null || date === "") {
    return null;
  }
  const instant = date instanceof Date ? date : new Date(date);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
};

export const createPositionCandidatesQueryOptions = ({
  serviceTypeId,
  teamId,
  positionId,
  planId,
}: CandidateSlot) => ({
  queryKey: queryKeys.positionCandidates(
    serviceTypeId,
    teamId,
    positionId,
    planId
  ),
  queryFn: async (
    context: QueryFunctionContext
  ): Promise<PositionCandidates> => {
    const candidates = await callForQuery(
      context,
      async (options) =>
        await orpc.people.positionCandidates(
          {
            serviceTypeId,
            positionId,
            planId,
            teamId: isNonEmptyString(teamId) ? teamId : undefined,
          },
          options
        )
    );
    writeCachedPositionCandidates(
      serviceTypeId,
      teamId,
      positionId,
      planId,
      candidates
    );
    return candidates;
  },
  staleTime: CANDIDATE_LIST_STALE_TIME_MS,
});

type WindowContinuation = NonNullable<
  Parameters<typeof orpc.people.planWindowHistory>[0]
>["continuation"];

/**
 * Follows the window's continuation until every roster is read. Each call is its own Worker
 * invocation, so each stays within the per-call request budget, and each takes the query's
 * priority at the time it is sent.
 */
const fetchPlanWindowHistory = async (
  dateKey: string,
  context: QueryFunctionContext,
  continuation?: WindowContinuation
): Promise<PlanWindowHistoryBatch[]> => {
  const batch = await callForQuery(
    context,
    async (options) =>
      await orpc.people.planWindowHistory(
        { date: dateKey, continuation },
        options
      )
  );
  const { deferredPlans, deferredServiceTypeIds } = batch;
  if (deferredPlans.length === 0 && deferredServiceTypeIds.length === 0) {
    return [batch];
  }
  if (
    continuation !== undefined &&
    !windowHistoryAdvanced(continuation, batch)
  ) {
    throw new Error("Plan window history made no progress.");
  }
  return [
    batch,
    ...(await fetchPlanWindowHistory(dateKey, context, {
      plans: deferredPlans,
      serviceTypeIds: deferredServiceTypeIds,
    })),
  ];
};

/** History from the rosters around one plan date; every position and plan on it shares it. */
export const createPlanWindowHistoryQueryOptions = (dateKey: string) => ({
  queryKey: queryKeys.planWindowHistory(dateKey),
  queryFn: async (
    context: QueryFunctionContext
  ): Promise<PlanWindowHistoryBatch[]> => {
    const calls = await fetchPlanWindowHistory(dateKey, context);
    writeCachedPlanWindowHistory(dateKey, calls);
    return calls;
  },
  staleTime: CANDIDATE_LIST_STALE_TIME_MS,
});

interface CandidateDetailsRequest {
  personIds: readonly string[];
  planId: string;
  dateKey: string;
  scheduleHistory: boolean;
}

/**
 * Follows `deferredPersonIds` (with `blockoutProgress`) until the batch is complete. Every call
 * details someone or advances someone's blockout checks.
 */
const fetchCandidateDetails = async (
  { personIds, planId, dateKey, scheduleHistory }: CandidateDetailsRequest,
  context: QueryFunctionContext,
  blockoutProgress?: CandidateDetailsBatch["blockoutProgress"]
): Promise<CandidateDetail[]> => {
  const batch = await callForQuery(
    context,
    async (options) =>
      await orpc.people.candidateDetails(
        {
          personIds: [...personIds],
          planId,
          date: dateKey,
          scheduleHistory,
          blockoutProgress,
        },
        options
      )
  );
  const deferred = batch.deferredPersonIds;
  if (deferred.length === 0) {
    return batch.people;
  }
  if (
    batch.people.length === 0 &&
    !advancedBlockoutChecks(blockoutProgress ?? [], batch.blockoutProgress)
  ) {
    throw new Error("Candidate details made no progress.");
  }
  return [
    ...batch.people,
    ...(await fetchCandidateDetails(
      { personIds: deferred, planId, dateKey, scheduleHistory },
      context,
      batch.blockoutProgress
    )),
  ];
};

export const createCandidateDetailsQueryOptions = (
  request: CandidateDetailsRequest
) => ({
  // Blockouts depend only on the date; schedule history also on the plan it is matched to.
  queryKey: queryKeys.candidateDetails(
    request.dateKey,
    request.scheduleHistory ? request.planId : null,
    request.personIds
  ),
  queryFn: async (context: QueryFunctionContext) => {
    const details = await fetchCandidateDetails(request, context);
    if (!request.scheduleHistory) {
      writeCachedCandidateAvailability(request.dateKey, details);
    }
    return details;
  },
  staleTime: CANDIDATE_LIST_STALE_TIME_MS,
});

const detailBatchesFor = (candidates: PositionCandidates | undefined) =>
  planCandidateDetailsBatches(candidates, PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE);

/**
 * Loads a slot's whole candidate list ahead of a click: candidates, then the shared window
 * history and the candidates' details. Cached parts are not fetched again. Every call is
 * speculative until the slot's list is on screen.
 */
export const prefetchPositionCandidates = async (
  queryClient: QueryClient,
  slot: CandidateSlot
): Promise<void> => {
  const candidates = await queryClient.query(
    speculativeQuery(createPositionCandidatesQueryOptions(slot))
  );
  const detailsFor = async (scheduleHistory: boolean) => {
    await Promise.all(
      detailBatchesFor(candidates).map(
        async (personIds) =>
          await queryClient.query(
            speculativeQuery(
              createCandidateDetailsQueryOptions({
                personIds,
                planId: slot.planId,
                dateKey: slot.dateKey,
                scheduleHistory,
              })
            )
          )
      )
    );
  };
  const [windowCalls] = await Promise.all([
    queryClient.query(
      speculativeQuery(createPlanWindowHistoryQueryOptions(slot.dateKey))
    ),
    detailsFor(false),
  ]);
  if (needsScheduleHistory(windowCalls)) {
    await detailsFor(true);
  }
};

/** True when a slot's candidates and the window history are cached and fresh. */
export const isPositionCandidatesFresh = (
  queryClient: QueryClient,
  slot: CandidateSlot
): boolean =>
  isQueryFresh(
    queryClient,
    queryKeys.positionCandidates(
      slot.serviceTypeId,
      slot.teamId,
      slot.positionId,
      slot.planId
    ),
    CANDIDATE_LIST_STALE_TIME_MS
  ) &&
  isQueryFresh(
    queryClient,
    queryKeys.planWindowHistory(slot.dateKey),
    CANDIDATE_LIST_STALE_TIME_MS
  );

/** Settled: loaded or failed, and not refetching. */
const isSettled = (
  queryClient: QueryClient,
  queryKey: readonly unknown[]
): boolean => {
  const state = queryClient.getQueryState(queryKey);
  return (
    state !== undefined &&
    state.status !== "pending" &&
    state.fetchStatus !== "fetching"
  );
};

/** Detail batches as one value; TanStack keeps it stable while no batch changes. */
const combineDetailQueries = (
  results: readonly UseQueryResult<CandidateDetail[]>[]
) => ({
  details: collectCandidateDetails(results.map(({ data }) => data)),
  failedCount: results.filter(({ isError }) => isError).length,
  isFetching: results.some(({ isFetching }) => isFetching),
  retryFailed: () => {
    for (const result of results) {
      if (result.isError) {
        void result.refetch();
      }
    }
  },
});

/**
 * How long the list stays on its skeleton after the candidates arrive, waiting for scores.
 * The list sorts itself by score once history and availability land, so showing it sooner
 * means showing it in name order and reshuffling it under the pointer. Warm plans usually
 * score within this; a slow cold load shows the list in name order rather than keep waiting.
 */
const SCORE_HOLD_MS = 1500;

export interface PositionCandidateList {
  /** Candidates as far as their parts have arrived; undefined until candidates load. */
  people: ReturnType<typeof assembleCandidateList>["people"] | undefined;
  /** Scores exist and people are sorted; until then the list keeps a stable order. */
  complete: boolean;
  progress: CandidateListProgress | undefined;
  /** No candidates to show yet, or they are held briefly for their scores. */
  isLoading: boolean;
  /** Candidates are showing while history or availability still loads. */
  isEnriching: boolean;
  isFetching: boolean;
  failedPartCount: number;
  retryFailed: () => void;
}

/**
 * True while a slot's list waits (up to `SCORE_HOLD_MS`) for its scores. Once the slot's list
 * has shown, sorted or with a failed part, a Retry that puts a part back to pending keeps it on
 * screen instead of holding again.
 */
const useScoreHold = (
  holdKey: string | null,
  hasList: boolean,
  isEnriching: boolean
): boolean => {
  const [releasedHoldKey, setReleasedHoldKey] = useState<string | null>(null);
  if (hasList && !isEnriching && releasedHoldKey !== holdKey) {
    setReleasedHoldKey(holdKey);
  }
  useEffect(() => {
    // Releases the hold for this slot only if it was still waiting when the time ran out.
    const timer = setTimeout(() => {
      if (isEnriching) {
        setReleasedHoldKey(holdKey);
      }
    }, SCORE_HOLD_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [holdKey, isEnriching]);
  return isEnriching && releasedHoldKey !== holdKey;
};

/**
 * The Assign view's candidate list, loaded progressively: candidates first (about 3 Planning
 * Center requests), then the plan-window history and candidate details in parallel, each
 * split into calls that stay within the per-call budget. The list waits briefly for its scores
 * (`SCORE_HOLD_MS`); past that it renders in a stable order and fills in scores, labels, and
 * blocked state as the rest lands.
 */
export const usePositionCandidates = (slot: CandidateSlot | null) => {
  const queryClient = useQueryClient();
  const enabled = slot !== null;
  const candidatesOptions = createPositionCandidatesQueryOptions(
    slot ?? {
      serviceTypeId: "",
      teamId: null,
      positionId: "",
      planId: "",
      dateKey: "",
    }
  );
  const historyOptions = createPlanWindowHistoryQueryOptions(
    slot?.dateKey ?? ""
  );
  const readCandidatesCache = useCallback(
    () =>
      slot === null
        ? undefined
        : readCachedPositionCandidates(
            slot.serviceTypeId,
            slot.teamId,
            slot.positionId,
            slot.planId
          ),
    [slot]
  );
  const readHistoryCache = useCallback(
    () =>
      slot === null ? undefined : readCachedPlanWindowHistory(slot.dateKey),
    [slot]
  );
  useHydrateQueryFromCache(candidatesOptions.queryKey, readCandidatesCache);
  useHydrateQueryFromCache(historyOptions.queryKey, readHistoryCache);

  const candidatesQuery = useQuery({ ...candidatesOptions, enabled });
  const historyQuery = useQuery({ ...historyOptions, enabled });
  const candidates = candidatesQuery.data;
  const windowCalls = historyQuery.data;
  const scheduleHistory = needsScheduleHistory(windowCalls);

  const batches = useMemo(() => detailBatchesFor(candidates), [candidates]);
  const detailsOptions = useMemo(
    () =>
      slot === null
        ? []
        : batches.map((personIds) =>
            createCandidateDetailsQueryOptions({
              personIds,
              planId: slot.planId,
              dateKey: slot.dateKey,
              scheduleHistory,
            })
          ),
    [batches, scheduleHistory, slot]
  );
  // Saved availability seeds its queries before `useQueries` reads them; see
  // `useHydrateQueryFromCache`.
  if (slot !== null && !scheduleHistory) {
    for (const [index, personIds] of batches.entries()) {
      const options = detailsOptions[index];
      if (options !== undefined) {
        hydrateQueryFromCache(queryClient, options.queryKey, () =>
          readCachedCandidateAvailability(slot.dateKey, personIds)
        );
      }
    }
  }

  const detailQueries = useQueries({
    queries: detailsOptions.map((options, index) => {
      const gate = detailsOptions[index - CANDIDATE_DETAILS_BATCH_CONCURRENCY];
      return {
        ...options,
        // Start a batch once the one `concurrency` places ahead has settled.
        enabled: gate === undefined || isSettled(queryClient, gate.queryKey),
      };
    }),
    combine: combineDetailQueries,
  });
  const { details } = detailQueries;
  const windowHistory = useMemo(
    () =>
      slot === null ? undefined : expandWindowHistory(windowCalls, slot.planId),
    [slot, windowCalls]
  );
  const list = useMemo(
    () =>
      candidates === undefined || slot === null
        ? undefined
        : assembleCandidateList({
            candidates,
            windowHistory,
            scheduleHistory,
            details,
            date: slot.dateKey,
            slotTimePreferenceOptionId: slot.timePreferenceOptionId ?? null,
          }),
    [candidates, details, scheduleHistory, slot, windowHistory]
  );

  const historyFailed = historyQuery.isError;
  const { refetch: refetchHistory } = historyQuery;
  const { retryFailed: retryFailedDetails } = detailQueries;
  const retryFailed = useCallback(() => {
    if (historyFailed) {
      void refetchHistory();
    }
    retryFailedDetails();
  }, [historyFailed, refetchHistory, retryFailedDetails]);

  const complete = list?.complete ?? false;
  const failedPartCount = (historyFailed ? 1 : 0) + detailQueries.failedCount;
  const isEnriching = list !== undefined && !complete && failedPartCount === 0;
  const isHoldingForScores = useScoreHold(
    slot === null ? null : `${slot.planId}:${slot.teamId}:${slot.positionId}`,
    list !== undefined,
    isEnriching
  );
  return {
    people: list?.people,
    complete,
    progress: list?.progress,
    isLoading: candidatesQuery.isLoading || isHoldingForScores,
    isEnriching,
    isFetching:
      candidatesQuery.isFetching ||
      historyQuery.isFetching ||
      detailQueries.isFetching,
    failedPartCount,
    retryFailed,
  } satisfies PositionCandidateList;
};

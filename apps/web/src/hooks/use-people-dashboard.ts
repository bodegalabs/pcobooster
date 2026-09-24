import { PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE } from "@pcobooster/contracts/people";
import type {
  PeopleDashboardActivity,
  PeopleDashboardRoster,
} from "@pcobooster/contracts/people-schemas";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient, QueryFunctionContext } from "@tanstack/react-query";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";

import {
  assemblePeopleDashboard,
  PEOPLE_DASHBOARD_BATCH_CONCURRENCY,
  PEOPLE_DASHBOARD_SAMPLE_SIZE,
  planPeopleDashboardBatches,
} from "@/lib/people-dashboard";
import type { PeopleDashboardData } from "@/lib/people-dashboard";
import {
  readCachedPeopleDashboardActivity,
  readCachedPeopleDashboardRoster,
  writeCachedPeopleDashboardActivity,
  writeCachedPeopleDashboardRoster,
} from "@/lib/people-dashboard-cache";
import {
  hydrateQueryFromCache,
  useHydrateQueryFromCache,
} from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import { orpc } from "@/orpc-client";

const ROSTER_STALE_TIME_MS = 5 * 60 * 1000;
const ACTIVITY_STALE_TIME_MS = 2 * 60 * 1000;

const fetchRoster = async ({
  signal,
}: QueryFunctionContext): Promise<PeopleDashboardRoster> => {
  const roster = await orpc.people.dashboardRoster(undefined, { signal });
  writeCachedPeopleDashboardRoster(roster);
  return roster;
};

/**
 * Follows `deferredPersonIds` until the batch is complete. Each call is its
 * own Worker invocation, so each stays within the per-call request budget.
 */
const fetchActivity = async (
  personIds: readonly string[],
  signal: AbortSignal
): Promise<PeopleDashboardActivity[]> => {
  const batch = await orpc.people.dashboardActivity(
    { personIds: [...personIds] },
    { signal }
  );
  const deferred = batch.deferredPersonIds;
  if (deferred.length === 0) {
    return batch.people;
  }
  if (deferred.length >= personIds.length) {
    throw new Error("People dashboard activity made no progress.");
  }
  return [...batch.people, ...(await fetchActivity(deferred, signal))];
};

/** Settled: loaded or failed, and not refetching. */
const isSettled = (queryClient: QueryClient, personIds: readonly string[]) => {
  const state = queryClient.getQueryState(
    queryKeys.peopleDashboardActivity(personIds)
  );
  return (
    state !== undefined &&
    state.status !== "pending" &&
    state.fetchStatus !== "fetching"
  );
};

/** The dashboard as far as the query cache has it, for person-page placeholders. */
export const readPeopleDashboardFromQueryCache = (
  queryClient: QueryClient
): PeopleDashboardData | undefined => {
  const roster = queryClient.getQueryData<PeopleDashboardRoster>(
    queryKeys.peopleDashboardRoster()
  );
  if (!roster) {
    return undefined;
  }
  const activities = queryClient
    .getQueriesData<PeopleDashboardActivity[]>({
      queryKey: ["people-dashboard-activity"],
    })
    .flatMap(([, data]) => data ?? []);
  return assemblePeopleDashboard(roster, activities, activities.length);
};

/**
 * Loads the roster first, then serving activity in small batches, and
 * assembles whatever has arrived so the page fills in progressively.
 */
export const usePeopleDashboard = () => {
  const queryClient = useQueryClient();
  const [targetPeopleCount, setTargetPeopleCount] = useState(
    PEOPLE_DASHBOARD_SAMPLE_SIZE
  );
  const rosterKey = queryKeys.peopleDashboardRoster();
  useHydrateQueryFromCache(rosterKey, readCachedPeopleDashboardRoster);
  const rosterQuery = useQuery({
    queryKey: rosterKey,
    queryFn: fetchRoster,
    staleTime: ROSTER_STALE_TIME_MS,
  });
  const roster = rosterQuery.data;

  const batches = useMemo(
    () =>
      planPeopleDashboardBatches(
        roster,
        targetPeopleCount,
        PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE
      ),
    [roster, targetPeopleCount]
  );
  // Layout effect so saved activity lands before the first paint.
  useLayoutEffect(() => {
    for (const personIds of batches) {
      hydrateQueryFromCache(
        queryClient,
        queryKeys.peopleDashboardActivity(personIds),
        () => readCachedPeopleDashboardActivity(personIds)
      );
    }
  }, [batches, queryClient]);

  const batchQueries = useQueries({
    queries: batches.map((personIds, index) => {
      const gate = batches[index - PEOPLE_DASHBOARD_BATCH_CONCURRENCY];
      return {
        queryKey: queryKeys.peopleDashboardActivity(personIds),
        queryFn: async ({ signal }: QueryFunctionContext) => {
          const people = await fetchActivity(personIds, signal);
          writeCachedPeopleDashboardActivity(people);
          return people;
        },
        staleTime: ACTIVITY_STALE_TIME_MS,
        // Start a batch once the one `concurrency` places ahead has settled.
        enabled: gate === undefined || isSettled(queryClient, gate),
      };
    }),
  });

  const activities = useMemo(
    () => batchQueries.flatMap((query) => query.data ?? []),
    [batchQueries]
  );
  const requestedPeopleCount = batches.reduce(
    (total, personIds) => total + personIds.length,
    0
  );
  const dashboard = useMemo(
    () =>
      roster
        ? assemblePeopleDashboard(roster, activities, requestedPeopleCount)
        : undefined,
    [activities, requestedPeopleCount, roster]
  );

  const failedBatches = batchQueries.filter((query) => query.isError);
  // Pending covers batches waiting their turn as well as ones in flight.
  const isLoadingActivity = batchQueries.some((query) => query.isPending);
  const hasPeople = (dashboard?.people.length ?? 0) > 0;
  const loadMore = useCallback(() => {
    setTargetPeopleCount((count) => count + PEOPLE_DASHBOARD_SAMPLE_SIZE);
  }, []);
  const retryFailed = useCallback(() => {
    for (const query of failedBatches) {
      void query.refetch();
    }
  }, [failedBatches]);

  return {
    dashboard,
    isLoading:
      !hasPeople &&
      (rosterQuery.isPending ||
        (isLoadingActivity && failedBatches.length === 0)),
    isError: rosterQuery.isError && !roster,
    isFetching:
      rosterQuery.isFetching || batchQueries.some((query) => query.isFetching),
    isLoadingActivity,
    failedBatchCount: failedBatches.length,
    retryFailed,
    canLoadMore:
      roster !== undefined &&
      !isLoadingActivity &&
      requestedPeopleCount < roster.people.length,
    loadMore,
  };
};

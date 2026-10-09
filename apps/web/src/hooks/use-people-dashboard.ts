import type {
  PeopleDashboardActivity,
  PeopleDashboardRoster,
} from "@pcobooster/contracts/http/people-schemas";
import { PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE } from "@pcobooster/contracts/people";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient, QueryFunctionContext } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { useSettledValue } from "@/hooks/use-settled-value";
import {
  assemblePeopleDashboard,
  chunkPersonIds,
  defaultPeopleDashboardScope,
  initialScopeLoadCount,
  matchesPeopleQuery,
  normalizePeopleQuery,
  orderActivityBatches,
  PEOPLE_DASHBOARD_BATCH_CONCURRENCY,
  PEOPLE_DASHBOARD_SAMPLE_SIZE,
  planPeopleDashboardBatches,
  resolveScopePersonIds,
  unrequestedMatchIds,
} from "@/lib/people-dashboard";
import type {
  PeopleDashboardData,
  PeopleDashboardScope,
} from "@/lib/people-dashboard";
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
import { productClient } from "@/product-client";

const ROSTER_STALE_TIME_MS = 5 * 60 * 1000;
const ACTIVITY_STALE_TIME_MS = 2 * 60 * 1000;
/** A search loads its unloaded matches once typing pauses this long. */
const SEARCH_LOAD_DELAY_MS = 400;
const NO_BATCHES: readonly string[][] = [];

const fetchRoster = async ({
  signal,
}: QueryFunctionContext): Promise<PeopleDashboardRoster> => {
  const roster = await productClient.run(
    (api) => api.people.dashboardRoster(),
    {
      signal,
    }
  );
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
  const batch = await productClient.run(
    (api) =>
      api.people.dashboardActivity({ query: { personIds: [...personIds] } }),
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

const activityState = (
  queryClient: QueryClient,
  personIds: readonly string[]
) => queryClient.getQueryState(queryKeys.peopleDashboardActivity(personIds));

/** Settled: loaded or failed, and not refetching. */
const isSettled = (queryClient: QueryClient, personIds: readonly string[]) => {
  const state = activityState(queryClient, personIds);
  return (
    state !== undefined &&
    state.status !== "pending" &&
    state.fetchStatus !== "fetching"
  );
};

/** Answered once, or fetching now. */
const hasStarted = (queryClient: QueryClient, personIds: readonly string[]) => {
  const state = activityState(queryClient, personIds);
  return (
    state !== undefined &&
    (state.status !== "pending" || state.fetchStatus === "fetching")
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
  return assemblePeopleDashboard(roster, activities, {
    scopePersonIds: roster.people.map((person) => person.id),
    samplePeopleCount: roster.people.length,
    loadingPersonIds: new Set(),
  });
};

interface SearchLoad {
  scope: PeopleDashboardScope;
  /** The settled query these batches were planned for. */
  query: string;
  /** Activity calls for search matches outside the sample, in the order they were asked. */
  batches: readonly string[][];
}

/**
 * Loads the roster first, then serving activity for the scope's first people in small batches,
 * and assembles the dashboard from whatever has answered so far. A search matches the whole
 * scope; its unloaded matches load one batch at a time. With no `scopeChoice`, a leader sees the
 * teams they lead.
 */
export const usePeopleDashboard = ({
  scopeChoice,
  searchQuery,
}: {
  scopeChoice: PeopleDashboardScope | null;
  searchQuery: string;
}) => {
  const queryClient = useQueryClient();
  const rosterKey = queryKeys.peopleDashboardRoster();
  useHydrateQueryFromCache(rosterKey, readCachedPeopleDashboardRoster);
  const rosterQuery = useQuery({
    queryKey: rosterKey,
    queryFn: fetchRoster,
    staleTime: ROSTER_STALE_TIME_MS,
  });
  const roster = rosterQuery.data;
  const scope =
    scopeChoice ?? (roster ? defaultPeopleDashboardScope(roster) : "all");
  const scopePersonIds = useMemo(
    () => (roster ? resolveScopePersonIds(roster, scope) : []),
    [roster, scope]
  );
  // "Load more" belongs to the scope it was asked in.
  const [extraPeople, setExtraPeople] = useState({ scope, count: 0 });
  const samplePeopleCount = Math.min(
    scopePersonIds.length,
    initialScopeLoadCount(scope, scopePersonIds.length) +
      (extraPeople.scope === scope ? extraPeople.count : 0)
  );
  const sampleBatches = useMemo(
    () =>
      planPeopleDashboardBatches(
        scopePersonIds,
        samplePeopleCount,
        PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE
      ),
    [scopePersonIds, samplePeopleCount]
  );

  // Search matches outside the sample load one call's worth at a time, once typing pauses.
  const normalizedQuery = normalizePeopleQuery(searchQuery);
  const settledQuery = useSettledValue(normalizedQuery, SEARCH_LOAD_DELAY_MS);
  const [searchLoad, setSearchLoad] = useState<SearchLoad>({
    scope,
    query: "",
    batches: NO_BATCHES,
  });
  const searchBatches =
    searchLoad.scope === scope ? searchLoad.batches : NO_BATCHES;
  const requestedIds = useMemo(
    () => new Set([...sampleBatches.flat(), ...searchBatches.flat()]),
    [sampleBatches, searchBatches]
  );

  // Saved activity seeds its queries before `useQueries` reads them; see
  // `useHydrateQueryFromCache`.
  for (const personIds of [...sampleBatches, ...searchBatches]) {
    hydrateQueryFromCache(
      queryClient,
      queryKeys.peopleDashboardActivity(personIds),
      () => readCachedPeopleDashboardActivity(personIds)
    );
  }
  const batches = orderActivityBatches(sampleBatches, searchBatches, (ids) =>
    hasStarted(queryClient, ids)
  );
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
  // Failed batches show their people as not loaded (with a retry), not as loading.
  const failedIdsKey = batches
    .flatMap((personIds, index) =>
      batchQueries[index]?.isError ? personIds : []
    )
    .join(",");
  const loadingIds = useMemo(() => {
    const failedIds = new Set(failedIdsKey.split(","));
    return new Set(
      [...requestedIds].filter((personId) => !failedIds.has(personId))
    );
  }, [failedIdsKey, requestedIds]);
  const dashboard = useMemo(
    () =>
      roster
        ? assemblePeopleDashboard(roster, activities, {
            scopePersonIds,
            samplePeopleCount,
            loadingPersonIds: loadingIds,
          })
        : undefined,
    [activities, loadingIds, roster, samplePeopleCount, scopePersonIds]
  );

  // A settled search asks for its unloaded matches; adjusting state during render keeps the
  // request in the same render the query settles in.
  const searchIsCurrent =
    searchLoad.scope === scope && searchLoad.query === settledQuery;
  if (dashboard !== undefined && !searchIsCurrent) {
    const next = unrequestedMatchIds(
      dashboard.scopeRows,
      settledQuery,
      requestedIds
    ).slice(0, PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE);
    setSearchLoad({
      scope,
      query: settledQuery,
      batches: next.length > 0 ? [...searchBatches, next] : searchBatches,
    });
  }

  const searchRows = useMemo(
    () =>
      dashboard === undefined || normalizedQuery === ""
        ? []
        : dashboard.scopeRows.filter((row) =>
            matchesPeopleQuery(row, normalizedQuery)
          ),
    [dashboard, normalizedQuery]
  );
  // Counted once typing settles, after the search has asked for its first matches.
  const unrequestedMatchCount =
    dashboard === undefined || settledQuery !== normalizedQuery
      ? 0
      : unrequestedMatchIds(searchRows, normalizedQuery, requestedIds).length;
  const loadMoreMatches = useCallback(() => {
    if (dashboard === undefined) {
      return;
    }
    const [next] = chunkPersonIds(
      unrequestedMatchIds(searchRows, normalizedQuery, requestedIds),
      PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE
    );
    if (next === undefined) {
      return;
    }
    setSearchLoad({
      scope,
      query: settledQuery,
      batches: [...searchBatches, next],
    });
  }, [
    dashboard,
    normalizedQuery,
    requestedIds,
    scope,
    searchBatches,
    searchRows,
    settledQuery,
  ]);

  const failedBatches = batchQueries.filter((query) => query.isError);
  // Pending covers batches waiting their turn as well as ones in flight.
  const isLoadingActivity = batchQueries.some((query) => query.isPending);
  const isLoadingSample = sampleBatches.some(
    (personIds) => !isSettled(queryClient, personIds)
  );
  const loadMore = useCallback(() => {
    setExtraPeople((current) => ({
      scope,
      count:
        (current.scope === scope ? current.count : 0) +
        PEOPLE_DASHBOARD_SAMPLE_SIZE,
    }));
  }, [scope]);
  const retryFailed = useCallback(() => {
    for (const query of failedBatches) {
      void query.refetch();
    }
  }, [failedBatches]);
  const retryRoster = useCallback(() => {
    void rosterQuery.refetch();
  }, [rosterQuery]);

  return {
    scope,
    dashboard,
    isRosterLoading: rosterQuery.isPending,
    isRosterError: rosterQuery.isError && !roster,
    isRetryingRoster: rosterQuery.isFetching,
    retryRoster,
    isFetching:
      rosterQuery.isFetching || batchQueries.some((query) => query.isFetching),
    isLoadingActivity,
    failedBatchCount: failedBatches.length,
    retryFailed,
    canLoadMore:
      roster !== undefined &&
      !isLoadingSample &&
      samplePeopleCount < scopePersonIds.length,
    loadMore,
    /** Scope rows matching the search, in roster order; empty without a search. */
    searchRows,
    /** Matches nobody has asked activity for yet. */
    unrequestedMatchCount,
    loadMoreMatches,
  };
};

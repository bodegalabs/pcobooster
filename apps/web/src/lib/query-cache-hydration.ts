import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

interface ClientCacheEntry<TData> {
  data: TData;
  savedAt: number;
}

/**
 * Seeds a query that holds no data yet from browser storage. Storage is read only then, so
 * calling this on every render costs one cache lookup once the query has data.
 */
export const hydrateQueryFromCache = <TData>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  readCache: () => ClientCacheEntry<TData> | undefined
): void => {
  // Persistence initializes a cold query; live data owns freshness after that.
  // Rehydrating newer storage timestamps creates a write/restore feedback loop.
  if (queryClient.getQueryState<TData>(queryKey)?.data !== undefined) {
    return;
  }

  const cached = readCache();
  if (!cached) {
    return;
  }

  queryClient.setQueryData<TData>(queryKey, cached.data, {
    updatedAt: cached.savedAt,
  });
};

/**
 * Seeds the query during render, before the caller's `useQuery`, so saved data is in the
 * first render's result. An effect runs after that render: the page would paint (and fade
 * in from) a skeleton frame for data the browser already has. Seeding only a query without
 * data keeps repeated renders idempotent, and Query delivers the change to other observers
 * after render, never during it.
 */
export const useHydrateQueryFromCache = <TData>(
  queryKey: QueryKey,
  readCache: () => ClientCacheEntry<TData> | undefined
) => {
  const queryClient = useQueryClient();
  hydrateQueryFromCache(queryClient, queryKey, readCache);
};

import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { useEffect } from "react";

interface ClientCacheEntry<TData> {
  data: TData;
  savedAt: number;
}

export const hydrateQueryFromCache = <TData>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  readCache: () => ClientCacheEntry<TData> | undefined
): void => {
  const cached = readCache();
  if (!cached) {
    return;
  }

  const state = queryClient.getQueryState<TData>(queryKey);
  // Persistence initializes a cold query; live data owns freshness after that.
  // Rehydrating newer storage timestamps creates a write/restore feedback loop.
  if (state?.data !== undefined) {
    return;
  }

  queryClient.setQueryData<TData>(queryKey, cached.data, {
    updatedAt: cached.savedAt,
  });
};

export const useHydrateQueryFromCache = <TData>(
  queryKey: QueryKey,
  readCache: () => ClientCacheEntry<TData> | undefined
) => {
  const queryClient = useQueryClient();
  useEffect(() => {
    hydrateQueryFromCache(queryClient, queryKey, readCache);
  }, [queryClient, queryKey, readCache]);
};

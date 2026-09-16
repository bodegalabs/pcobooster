import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect } from "react";

type ClientCacheEntry<TData> = {
  data: TData;
  savedAt: number;
};

export function useHydrateQueryFromCache<TData>(
  queryKey: QueryKey,
  readCache: () => ClientCacheEntry<TData> | undefined
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const cached = readCache();
    if (!cached) return;

    const state = queryClient.getQueryState<TData>(queryKey);
    if (state?.data !== undefined && state.dataUpdatedAt >= cached.savedAt)
      return;

    queryClient.setQueryData<TData>(queryKey, cached.data, {
      updatedAt: cached.savedAt,
    });
  }, [queryClient, queryKey, readCache]);
}

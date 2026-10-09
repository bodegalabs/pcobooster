import type { ServiceType } from "@pcobooster/planning-center-models/types";
import { useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import {
  hydrateQueryFromCache,
  useHydrateQueryFromCache,
} from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import {
  readCachedServiceTypesEntry,
  writeCachedServiceTypes,
} from "@/lib/schedule-catalog-cache";
import { productClient } from "@/product-client";

const serviceTypesQueryOptions = {
  queryKey: queryKeys.serviceTypes(),
  queryFn: async ({ signal }: { signal: AbortSignal }) =>
    await productClient.run((api) => api.catalog.serviceTypes(), { signal }),
  // 10 minutes
  staleTime: 10 * 60 * 1000,
};

/** Refreshes a stale list behind the read; the list's own query reports its failures. */
const refreshQuietly = async (refresh: () => Promise<void>): Promise<void> => {
  try {
    await refresh();
  } catch {
    // The service types query surfaces its own failure where the list is shown.
  }
};

/**
 * The active service types for reads that need their IDs. A saved list is used at once, even
 * when stale, so those reads never wait on it (a stale one refreshes behind them for next time);
 * only a browser with no list loads one first.
 */
export const loadServiceTypes = async (
  queryClient: QueryClient
): Promise<ServiceType[]> => {
  const { queryKey } = serviceTypesQueryOptions;
  hydrateQueryFromCache(queryClient, queryKey, readCachedServiceTypesEntry);
  const saved = queryClient.getQueryData<ServiceType[]>(queryKey);
  if (saved === undefined) {
    return await queryClient.query(serviceTypesQueryOptions);
  }
  void refreshQuietly(async () => {
    await queryClient.query(serviceTypesQueryOptions);
  });
  return saved;
};

export const useServiceTypes = () => {
  useHydrateQueryFromCache(
    serviceTypesQueryOptions.queryKey,
    readCachedServiceTypesEntry
  );

  const query = useQuery<ServiceType[]>(serviceTypesQueryOptions);

  useEffect(() => {
    if (!query.data) {
      return;
    }
    writeCachedServiceTypes(query.data);
  }, [query.data]);

  return query;
};

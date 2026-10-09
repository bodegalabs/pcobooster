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

/**
 * The active service types for reads that need their IDs. A saved list is used as is, even
 * when stale, so those reads never wait on it; only a browser with no list loads one.
 */
export const loadServiceTypes = async (
  queryClient: QueryClient
): Promise<ServiceType[]> => {
  const { queryKey } = serviceTypesQueryOptions;
  hydrateQueryFromCache(queryClient, queryKey, readCachedServiceTypesEntry);
  return (
    queryClient.getQueryData<ServiceType[]>(queryKey) ??
    (await queryClient.query(serviceTypesQueryOptions))
  );
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

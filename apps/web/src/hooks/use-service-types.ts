import { useQuery } from "@tanstack/react-query";
import type { ServiceType } from "@worship-admin/planning-center-models/types";
import { useCallback, useEffect } from "react";

import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import {
  readCachedServiceTypesEntry,
  writeCachedServiceTypes,
} from "@/lib/schedule-catalog-cache";
import { orpc } from "@/orpc-client";

export const useServiceTypes = () => {
  const queryKey = queryKeys.serviceTypes();
  const readCachedServiceTypes = useCallback(
    () => readCachedServiceTypesEntry(),
    []
  );
  useHydrateQueryFromCache(queryKey, readCachedServiceTypes);

  const query = useQuery<ServiceType[]>({
    queryKey,
    queryFn: async ({ signal }) =>
      await orpc.catalog.serviceTypes({}, { signal }),
    // 10 minutes
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (!query.data) {
      return;
    }
    writeCachedServiceTypes(query.data);
  }, [query.data]);

  return query;
};

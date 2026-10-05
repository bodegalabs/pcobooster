import { queryKeys } from "@pcobooster/client/query-keys";
import type { ServiceType } from "@pcobooster/planning-center-models/types";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import {
  readCachedServiceTypesEntry,
  writeCachedServiceTypes,
} from "@/lib/schedule-catalog-cache";
import { rpc } from "@/rpc-client";

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
      await rpc("catalog.serviceTypes", {}, { signal }),
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

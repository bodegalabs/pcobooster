import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import { serviceTypeSchema } from "@/lib/api-schemas";
import { getJson } from "@/lib/http/client";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import {
  readCachedServiceTypesEntry,
  writeCachedServiceTypes,
} from "@/lib/schedule-catalog-cache";
import type { ServiceType } from "@/lib/types";

export const useServiceTypes = () => {
  const queryKey = queryKeys.serviceTypes();
  const readCachedServiceTypes = useCallback(
    () => readCachedServiceTypesEntry(),
    []
  );
  useHydrateQueryFromCache(queryKey, readCachedServiceTypes);

  const query = useQuery<ServiceType[]>({
    queryKey,
    queryFn: async () =>
      await getJson("/api/service-types", serviceTypeSchema.array()),
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

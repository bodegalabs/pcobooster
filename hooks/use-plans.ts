import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import { getJson } from "@/lib/http/client";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import {
  readCachedPlansEntry,
  writeCachedPlans,
} from "@/lib/schedule-catalog-cache";
import type { Plan } from "@/lib/types";

export function usePlans(serviceTypeId: string | null) {
  const queryKey = queryKeys.plans(serviceTypeId);
  const readCachedPlans = useCallback(
    () => readCachedPlansEntry(serviceTypeId),
    [serviceTypeId]
  );
  useHydrateQueryFromCache(queryKey, readCachedPlans);

  const query = useQuery<Plan[]>({
    queryKey,
    queryFn: async () => {
      if (!serviceTypeId) {
        return [];
      }
      return getJson<Plan[]>(`/api/plans?service_type_id=${serviceTypeId}`);
    },
    enabled: !!serviceTypeId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  useEffect(() => {
    if (!query.data || !serviceTypeId) return;
    writeCachedPlans(serviceTypeId, query.data);
  }, [query.data, serviceTypeId]);

  return query;
}

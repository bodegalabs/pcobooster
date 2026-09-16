import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { postJson } from "@/lib/http/client";
import {
  readCachedMyScheduledPlans,
  writeCachedMyScheduledPlans,
  type MyScheduledPlansData,
} from "@/lib/my-scheduled-plans-cache";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";

export function useMyScheduledPlans(planIds: string[]) {
  const normalizedPlanIds = useMemo(
    () => [...new Set(planIds)].toSorted((a, b) => a.localeCompare(b)),
    [planIds]
  );
  const planIdsKey = normalizedPlanIds.join(",");
  const queryKey = queryKeys.myScheduledPlans(planIdsKey);
  const readCachedPlans = useCallback(
    () => readCachedMyScheduledPlans(planIdsKey),
    [planIdsKey]
  );
  useHydrateQueryFromCache(queryKey, readCachedPlans);

  return useQuery<MyScheduledPlansData>({
    queryKey,
    queryFn: async () => {
      if (normalizedPlanIds.length === 0) {
        return { planIds: [] };
      }

      const scheduledPlans = await postJson<MyScheduledPlansData>(
        "/api/my-scheduled-plans",
        {
          planIds: normalizedPlanIds,
        }
      );
      writeCachedMyScheduledPlans(planIdsKey, scheduledPlans);
      return scheduledPlans;
    },
    enabled: normalizedPlanIds.length > 0,
    placeholderData: (previousPlans) => previousPlans,
    staleTime: 60 * 1000,
  });
}

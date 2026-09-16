import { useQuery } from "@tanstack/react-query";

import { getJson } from "@/lib/http/client";
import {
  hydratePlanTimes,
  type SerializedPlanTime,
} from "@/lib/plan-time-client";
import { queryKeys } from "@/lib/query-keys";
import type { PlanTime } from "@/lib/types";

const PLAN_TIMES_STALE_TIME_MS = 60 * 1000;

function buildPlanTimesUrl(serviceTypeId: string, planId: string): string {
  const params = new URLSearchParams({
    service_type_id: serviceTypeId,
  });
  return `/api/plans/${encodeURIComponent(planId)}/times?${params.toString()}`;
}

export function createPlanTimesQueryOptions(
  serviceTypeId: string | null,
  planId: string | null
) {
  return {
    queryKey: queryKeys.planTimes(serviceTypeId, planId),
    queryFn: async () => {
      if (!serviceTypeId || !planId) return [];

      const planTimes = await getJson<SerializedPlanTime[]>(
        buildPlanTimesUrl(serviceTypeId, planId)
      );
      return hydratePlanTimes(planTimes);
    },
    staleTime: PLAN_TIMES_STALE_TIME_MS,
  };
}

export function usePlanTimes(
  serviceTypeId: string | null,
  planId: string | null
) {
  return useQuery<PlanTime[]>({
    ...createPlanTimesQueryOptions(serviceTypeId, planId),
    enabled: !!serviceTypeId && !!planId,
    placeholderData: (previousTimes) => previousTimes,
  });
}

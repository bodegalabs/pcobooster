import { useQuery } from "@tanstack/react-query";

import { serializedPlanTimeSchema } from "@/lib/api-schemas";
import { getJson } from "@/lib/http/client";
import { isNonEmptyString } from "@/lib/json";
import { hydratePlanTimes } from "@/lib/plan-time-client";
import { queryKeys } from "@/lib/query-keys";
import type { PlanTime } from "@/lib/types";

const PLAN_TIMES_STALE_TIME_MS = 60 * 1000;

const buildPlanTimesUrl = (serviceTypeId: string, planId: string): string => {
  const params = new URLSearchParams({
    service_type_id: serviceTypeId,
  });
  return `/api/plans/${encodeURIComponent(planId)}/times?${params.toString()}`;
};

export const createPlanTimesQueryOptions = (
  serviceTypeId: string | null,
  planId: string | null
) => ({
  queryKey: queryKeys.planTimes(serviceTypeId, planId),
  queryFn: async () => {
    if (!isNonEmptyString(serviceTypeId) || !isNonEmptyString(planId)) {
      return [];
    }

    const planTimes = await getJson(
      buildPlanTimesUrl(serviceTypeId, planId),
      serializedPlanTimeSchema.array()
    );
    return hydratePlanTimes(planTimes);
  },
  staleTime: PLAN_TIMES_STALE_TIME_MS,
});

export const usePlanTimes = (
  serviceTypeId: string | null,
  planId: string | null
) =>
  useQuery<PlanTime[]>({
    ...createPlanTimesQueryOptions(serviceTypeId, planId),
    enabled: isNonEmptyString(serviceTypeId) && isNonEmptyString(planId),
  });

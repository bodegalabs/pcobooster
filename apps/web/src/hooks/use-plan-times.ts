import { callForQuery } from "@pcobooster/client/query";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type { PlanTime } from "@pcobooster/planning-center-models/types";
import { useQuery } from "@tanstack/react-query";
import type { QueryFunctionContext } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { productClient } from "@/product-client";

const PLAN_TIMES_STALE_TIME_MS = 60 * 1000;

export const createPlanTimesQueryOptions = (
  serviceTypeId: string | null,
  planId: string | null
) => ({
  queryKey: queryKeys.planTimes(serviceTypeId, planId),
  queryFn: async (context: QueryFunctionContext) => {
    if (!isNonEmptyString(serviceTypeId) || !isNonEmptyString(planId)) {
      return [];
    }

    return await callForQuery(
      context,
      async (options) =>
        await productClient.call(
          "planTimes.list",
          { serviceTypeId, planId },
          options
        )
    );
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

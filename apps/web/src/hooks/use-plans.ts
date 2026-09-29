import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type { Plan } from "@pcobooster/planning-center-models/types";
import { useQuery } from "@tanstack/react-query";
import type { QueryFunctionContext } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import { callForQuery } from "@/lib/request-priority";
import {
  readCachedPlansEntry,
  writeCachedPlans,
} from "@/lib/schedule-catalog-cache";
import { orpc } from "@/orpc-client";

export const usePlans = (serviceTypeId: string | null) => {
  const queryKey = queryKeys.plans(serviceTypeId);
  const readCachedPlans = useCallback(
    () => readCachedPlansEntry(serviceTypeId),
    [serviceTypeId]
  );
  useHydrateQueryFromCache(queryKey, readCachedPlans);

  const query = useQuery<Plan[]>({
    queryKey,
    queryFn: async ({ signal }) => {
      if (!isNonEmptyString(serviceTypeId)) {
        return [];
      }
      return await orpc.catalog.plans({ serviceTypeId }, { signal });
    },
    enabled: isNonEmptyString(serviceTypeId),
    // 5 minutes
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!query.data || !isNonEmptyString(serviceTypeId)) {
      return;
    }
    writeCachedPlans(serviceTypeId, query.data);
  }, [query.data, serviceTypeId]);

  return query;
};

/** Plans listed on each side of the open plan in the plan header; matches the API's limit. */
export const ADJACENT_PLANS_LIMIT = 4;

const PLAN_DETAILS_STALE_TIME_MS = 5 * 60 * 1000;

/** One plan's details, for plans outside the upcoming list (past plans, far-off ones). */
export const usePlanDetails = (
  serviceTypeId: string,
  planId: string,
  enabled: boolean
) =>
  useQuery<Plan | null>({
    queryKey: queryKeys.planDetails(serviceTypeId, planId),
    queryFn: async (context) =>
      await callForQuery(
        context,
        async (options) =>
          await orpc.catalog.plan({ serviceTypeId, planId }, options)
      ),
    enabled,
    staleTime: PLAN_DETAILS_STALE_TIME_MS,
  });

/** The nearest plans before or after one plan, nearest first. */
export const createAdjacentPlansQueryOptions = (
  serviceTypeId: string,
  planId: string,
  direction: "previous" | "next"
) => ({
  queryKey: queryKeys.adjacentPlans(serviceTypeId, planId, direction),
  queryFn: async (context: QueryFunctionContext): Promise<Plan[]> =>
    await callForQuery(
      context,
      async (options) =>
        await orpc.catalog.adjacentPlans(
          { serviceTypeId, planId, direction },
          options
        )
    ),
  staleTime: PLAN_DETAILS_STALE_TIME_MS,
});

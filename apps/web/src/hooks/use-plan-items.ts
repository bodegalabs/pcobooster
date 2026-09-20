import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { serializedPlanItemSchema } from "@/lib/api-schemas";
import { getJson } from "@/lib/http/client";
import { isNonEmptyString } from "@/lib/json";
import { hydratePlanItems } from "@/lib/plan-item-client";
import {
  readCachedPlanItems,
  writeCachedPlanItems,
} from "@/lib/plan-items-cache";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import type { PlanItem } from "@/lib/types";

const PLAN_ITEMS_STALE_TIME_MS = 60 * 1000;

const buildPlanItemsUrl = (serviceTypeId: string, planId: string): string => {
  const params = new URLSearchParams({
    service_type_id: serviceTypeId,
    plan_id: planId,
  });
  return `/api/plan-items?${params.toString()}`;
};

export const createPlanItemsQueryOptions = (
  serviceTypeId: string | null,
  planId: string | null
) => ({
  queryKey: queryKeys.planItems(serviceTypeId, planId),
  queryFn: async () => {
    if (!isNonEmptyString(serviceTypeId) || !isNonEmptyString(planId)) {
      return [];
    }

    const items = await getJson(
      buildPlanItemsUrl(serviceTypeId, planId),
      serializedPlanItemSchema.array()
    );
    const hydratedItems = hydratePlanItems(items);
    writeCachedPlanItems(serviceTypeId, planId, hydratedItems);
    return hydratedItems;
  },
  staleTime: PLAN_ITEMS_STALE_TIME_MS,
});

export const usePlanItems = (
  serviceTypeId: string | null,
  planId: string | null
) => {
  const queryKey = queryKeys.planItems(serviceTypeId, planId);
  const readCachedItems = useCallback(
    () => readCachedPlanItems(serviceTypeId, planId),
    [planId, serviceTypeId]
  );
  useHydrateQueryFromCache(queryKey, readCachedItems);

  return useQuery<PlanItem[]>({
    ...createPlanItemsQueryOptions(serviceTypeId, planId),
    queryKey,
    enabled: isNonEmptyString(serviceTypeId) && isNonEmptyString(planId),
    placeholderData: (previousItems) => previousItems,
  });
};

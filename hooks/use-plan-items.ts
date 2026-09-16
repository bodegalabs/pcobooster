import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { getJson } from "@/lib/http/client";
import {
  hydratePlanItems,
  type SerializedPlanItem,
} from "@/lib/plan-item-client";
import {
  readCachedPlanItems,
  writeCachedPlanItems,
} from "@/lib/plan-items-cache";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import type { PlanItem } from "@/lib/types";

const PLAN_ITEMS_STALE_TIME_MS = 60 * 1000;

function buildPlanItemsUrl(serviceTypeId: string, planId: string): string {
  const params = new URLSearchParams({
    service_type_id: serviceTypeId,
    plan_id: planId,
  });
  return `/api/plan-items?${params.toString()}`;
}

export function createPlanItemsQueryOptions(
  serviceTypeId: string | null,
  planId: string | null
) {
  return {
    queryKey: queryKeys.planItems(serviceTypeId, planId),
    queryFn: async () => {
      if (!serviceTypeId || !planId) return [];

      const items = await getJson<SerializedPlanItem[]>(
        buildPlanItemsUrl(serviceTypeId, planId)
      );
      const hydratedItems = hydratePlanItems(items);
      writeCachedPlanItems(serviceTypeId, planId, hydratedItems);
      return hydratedItems;
    },
    staleTime: PLAN_ITEMS_STALE_TIME_MS,
  };
}

export function usePlanItems(
  serviceTypeId: string | null,
  planId: string | null
) {
  const queryKey = queryKeys.planItems(serviceTypeId, planId);
  const readCachedItems = useCallback(
    () => readCachedPlanItems(serviceTypeId, planId),
    [planId, serviceTypeId]
  );
  useHydrateQueryFromCache(queryKey, readCachedItems);

  return useQuery<PlanItem[]>({
    ...createPlanItemsQueryOptions(serviceTypeId, planId),
    queryKey,
    enabled: !!serviceTypeId && !!planId,
    placeholderData: (previousItems) => previousItems,
  });
}

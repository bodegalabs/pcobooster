import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type { Plan } from "@pcobooster/planning-center-models/types";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
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

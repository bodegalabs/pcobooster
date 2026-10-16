import { callForQuery } from "@pcobooster/client/query";
import type { MyScheduledPlansData } from "@pcobooster/contracts/http/people-schemas";
import { useQuery } from "@tanstack/react-query";

import {
  readCachedMyScheduledPlans,
  writeCachedMyScheduledPlans,
} from "@/lib/my-scheduled-plans-cache";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import { productClient } from "@/product-client";

const queryKey = queryKeys.myScheduledPlans();

/** Upcoming plans the signed-in person is scheduled on, independent of which plans are loaded. */
export const useMyScheduledPlans = () => {
  useHydrateQueryFromCache(queryKey, readCachedMyScheduledPlans);

  return useQuery<MyScheduledPlansData>({
    queryKey,
    queryFn: async (context) => {
      const scheduledPlans = await callForQuery(context, productClient, (api) =>
        api.people.myScheduledPlans()
      );
      writeCachedMyScheduledPlans(scheduledPlans);
      return scheduledPlans;
    },
    staleTime: 60 * 1000,
  });
};

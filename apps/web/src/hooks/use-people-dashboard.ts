import type {
  PeopleDashboardData,
  PeopleDashboardRange,
} from "@pcobooster/contracts/people-schemas";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import {
  readCachedPeopleDashboard,
  writeCachedPeopleDashboard,
} from "@/lib/people-dashboard-cache";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import { orpc } from "@/orpc-client";

export const usePeopleDashboard = (range: PeopleDashboardRange) => {
  const queryKey = queryKeys.peopleDashboard(range);
  const readCachedDashboard = useCallback(
    () => readCachedPeopleDashboard(range),
    [range]
  );
  useHydrateQueryFromCache(queryKey, readCachedDashboard);

  const query = useQuery<PeopleDashboardData>({
    queryKey,
    queryFn: async ({ signal }) =>
      await orpc.people.dashboard({ range }, { signal }),
    staleTime: 2 * 60 * 1000,
    placeholderData: (previousDashboard) => previousDashboard,
  });

  useEffect(() => {
    if (!query.data) {
      return;
    }
    writeCachedPeopleDashboard(query.data);
  }, [query.data]);

  return query;
};

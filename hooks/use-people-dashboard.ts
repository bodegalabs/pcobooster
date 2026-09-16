import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import { getJson } from "@/lib/http/client";
import {
  readCachedPeopleDashboard,
  writeCachedPeopleDashboard,
} from "@/lib/people-dashboard-cache";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import type {
  PeopleDashboardData,
  PeopleDashboardRange,
} from "@/lib/use-cases/planning-center/people-dashboard-types";

export function usePeopleDashboard(range: PeopleDashboardRange) {
  const queryKey = queryKeys.peopleDashboard(range);
  const readCachedDashboard = useCallback(
    () => readCachedPeopleDashboard(range),
    [range]
  );
  useHydrateQueryFromCache(queryKey, readCachedDashboard);

  const query = useQuery<PeopleDashboardData>({
    queryKey,
    queryFn: () =>
      getJson<PeopleDashboardData>(`/api/people/dashboard?range=${range}`),
    staleTime: 2 * 60 * 1000,
    placeholderData: (previousDashboard) => previousDashboard,
  });

  useEffect(() => {
    if (!query.data) return;
    writeCachedPeopleDashboard(query.data);
  }, [query.data]);

  return query;
}

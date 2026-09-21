import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryFunctionContext } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  readCachedPeopleDashboardPerson,
  writeCachedPeopleDashboardPerson,
} from "@/lib/people-dashboard-cache";
import { getCachedPeopleDashboardPersonDetail } from "@/lib/people-dashboard-person-placeholder";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import type {
  PeopleDashboardData,
  PeopleDashboardPersonDetail,
} from "@/lib/use-cases/planning-center/people-dashboard-types";
import { orpc } from "@/orpc-client";

export const createPeopleDashboardPersonQueryOptions = (
  personId: string,
  month: string | null
) => ({
  queryKey: queryKeys.peopleDashboardPerson(personId, month),
  queryFn: async ({ signal }: QueryFunctionContext) => {
    const detail = await orpc.people.dashboardPerson(
      { personId, month: month !== null && month !== "" ? month : undefined },
      { signal }
    );
    writeCachedPeopleDashboardPerson(personId, month, detail);
    return detail;
  },
  staleTime: 2 * 60 * 1000,
});

export const usePeopleDashboardPerson = (
  personId: string,
  month: string | null
) => {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.peopleDashboardPerson(personId, month);
  const readCachedPerson = useCallback(
    () => readCachedPeopleDashboardPerson(personId, month),
    [month, personId]
  );
  useHydrateQueryFromCache(queryKey, readCachedPerson);

  return useQuery<PeopleDashboardPersonDetail>({
    ...createPeopleDashboardPersonQueryOptions(personId, month),
    queryKey,
    placeholderData: () =>
      getCachedPeopleDashboardPersonDetail(
        queryClient
          .getQueriesData<PeopleDashboardData>({
            queryKey: ["people-dashboard"],
          })
          .map(([, dashboard]) => dashboard),
        personId,
        month
      ),
  });
};

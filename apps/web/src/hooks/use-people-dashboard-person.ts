import type {
  PeopleDashboardData,
  PeopleDashboardPersonDetail,
} from "@pcobooster/contracts/people-schemas";
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
    // Seed from the roster when it covers this month. Otherwise keep this
    // person on screen (dimmed) so paging months never blanks the page.
    placeholderData: (previousDetail) => {
      const dashboards = queryClient
        .getQueriesData<PeopleDashboardData>({
          queryKey: ["people-dashboard"],
        })
        .map(([, dashboard]) => dashboard);
      return (
        getCachedPeopleDashboardPersonDetail(dashboards, personId, month) ??
        (previousDetail?.person.id === personId ? previousDetail : undefined) ??
        getCachedPeopleDashboardPersonDetail(dashboards, personId, null)
      );
    },
  });
};

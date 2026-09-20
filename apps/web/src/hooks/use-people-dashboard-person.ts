import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { peopleDashboardPersonDetailSchema } from "@/lib/api-schemas";
import { getJson } from "@/lib/http/client";
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

export const createPeopleDashboardPersonQueryOptions = (
  personId: string,
  month: string | null
) => ({
  queryKey: queryKeys.peopleDashboardPerson(personId, month),
  queryFn: async () => {
    const params =
      month !== null && month !== ""
        ? `?month=${encodeURIComponent(month)}`
        : "";
    const detail = await getJson(
      `/api/people/dashboard/${personId}${params}`,
      peopleDashboardPersonDetailSchema
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

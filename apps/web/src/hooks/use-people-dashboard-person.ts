import { callForQuery } from "@pcobooster/client/query";
import type {
  PeopleDashboardPersonDetail,
  PeopleDashboardRoster,
  PeopleDashboardRosterPerson,
} from "@pcobooster/contracts/http/people-schemas";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient, QueryFunctionContext } from "@tanstack/react-query";
import { useCallback, useMemo, useSyncExternalStore } from "react";

import { readPeopleDashboardFromQueryCache } from "@/hooks/use-people-dashboard";
import {
  readCachedPeopleDashboardPerson,
  writeCachedPeopleDashboardPerson,
} from "@/lib/people-dashboard-cache";
import { getCachedPeopleDashboardPersonDetail } from "@/lib/people-dashboard-person-placeholder";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import { computeMemberPaces } from "@/lib/team-health";
import { productClient } from "@/product-client";

/**
 * Follows the detail's `continuation` until every rehearsal time is read. Each call is its own
 * Worker invocation within the per-call request budget; the last answer is the whole detail.
 */
const fetchPeopleDashboardPerson = async (
  personId: string,
  month: string | null,
  context: QueryFunctionContext,
  continuation?: PeopleDashboardPersonDetail["continuation"]
): Promise<PeopleDashboardPersonDetail> => {
  const detail = await callForQuery(context, productClient, (api) =>
    api.people.dashboardPerson({
      params: { personId },
      payload: {
        month: month !== null && month !== "" ? month : undefined,
        continuation: continuation ?? undefined,
      },
    })
  );
  if (detail.continuation === null) {
    return detail;
  }
  if (JSON.stringify(continuation) === JSON.stringify(detail.continuation)) {
    throw new Error("Person detail made no progress.");
  }
  return await fetchPeopleDashboardPerson(
    personId,
    month,
    context,
    detail.continuation
  );
};

export const createPeopleDashboardPersonQueryOptions = (
  personId: string,
  month: string | null
) => ({
  queryKey: queryKeys.peopleDashboardPerson(personId, month),
  queryFn: async (context: QueryFunctionContext) => {
    const detail = await fetchPeopleDashboardPerson(personId, month, context);
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
      const dashboards = [readPeopleDashboardFromQueryCache(queryClient)];
      return (
        getCachedPeopleDashboardPersonDetail(dashboards, personId, month) ??
        (previousDetail?.person.id === personId ? previousDetail : undefined) ??
        getCachedPeopleDashboardPersonDetail(dashboards, personId, null)
      );
    },
  });
};

export interface PersonDashboardContext {
  /** The person as the dashboard roster lists them, with their team memberships. */
  rosterPerson: PeopleDashboardRosterPerson | null;
  /** Their teams' pace, the same the dashboard judges a heavy load against. */
  teamPace: number | null;
}

/**
 * What the dashboard already knows about a person, read from the query cache without loading
 * anything: the person page shows the same teams and judges the same heavy load.
 */
export const usePersonDashboardContext = (
  personId: string
): PersonDashboardContext => {
  const queryClient = useQueryClient();
  return useMemo(() => {
    const dashboard = readPeopleDashboardFromQueryCache(queryClient);
    if (dashboard === undefined) {
      return { rosterPerson: null, teamPace: null };
    }
    return {
      rosterPerson:
        dashboard.scopeRows.find((row) => row.person.id === personId)?.person ??
        null,
      teamPace:
        computeMemberPaces(dashboard.members, dashboard.teams).get(personId) ??
        null,
    };
  }, [personId, queryClient]);
};

/** The person's name from any person detail or the roster already in the query cache. */
const readCachedPersonName = (
  queryClient: QueryClient,
  personId: string
): string | null => {
  const detailName = queryClient
    .getQueriesData<PeopleDashboardPersonDetail>({
      queryKey: ["people-dashboard-person", personId],
    })
    .find(([, data]) => data !== undefined)?.[1]?.person.name;
  if (detailName !== undefined) {
    return detailName;
  }
  return (
    queryClient
      .getQueryData<PeopleDashboardRoster>(queryKeys.peopleDashboardRoster())
      ?.people.find((person) => person.id === personId)?.name ?? null
  );
};

const noName = () => null;

/** A person's name for breadcrumbs, once a person detail or the roster has it. */
export const usePersonName = (personId: string | null): string | null => {
  const queryClient = useQueryClient();
  const subscribe = useCallback(
    (onChange: () => void) => queryClient.getQueryCache().subscribe(onChange),
    [queryClient]
  );
  const read = useCallback(
    () =>
      personId === null ? null : readCachedPersonName(queryClient, personId),
    [personId, queryClient]
  );
  return useSyncExternalStore(subscribe, read, noName);
};

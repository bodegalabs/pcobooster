import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { getJson } from "@/lib/http/client";
import { readCachedPeople, writeCachedPeople } from "@/lib/people-cache";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import type { PersonWithAvailability } from "@/lib/types";

function normalizePeopleDateKey(date: Date | string | null): string | null {
  if (!date) return null;
  return typeof date === "string" ? date : date.toISOString();
}

function normalizePeopleDate(date: Date | string | null): Date | null {
  if (!date) return null;
  return typeof date === "string" ? new Date(date) : date;
}

export function createPeopleQueryOptions(
  serviceTypeId: string | null,
  teamId: string | null,
  positionId: string | null,
  planId: string | null = null,
  date: Date | string | null = null
) {
  const dateKey = normalizePeopleDateKey(date);
  const dateObj = normalizePeopleDate(date);

  return {
    queryKey: queryKeys.people(
      serviceTypeId,
      teamId,
      positionId,
      planId,
      dateKey
    ),
    queryFn: async () => {
      if (!positionId || !serviceTypeId) {
        return [];
      }

      const params = new URLSearchParams({
        service_type_id: serviceTypeId,
        position_id: positionId,
      });

      if (teamId) {
        params.append("team_id", teamId);
      }

      if (planId) {
        params.append("plan_id", planId);
      }

      if (dateObj && !isNaN(dateObj.getTime())) {
        params.append("date", dateObj.toISOString());
      }

      const people = await getJson<PersonWithAvailability[]>(
        `/api/people?${params.toString()}`
      );
      writeCachedPeople(
        serviceTypeId,
        teamId,
        positionId,
        planId,
        dateKey,
        people
      );
      return people;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  };
}

export function usePeople(
  serviceTypeId: string | null,
  teamId: string | null,
  positionId: string | null,
  planId: string | null = null,
  date: Date | string | null = null
) {
  const dateKey = normalizePeopleDateKey(date);
  const queryKey = queryKeys.people(
    serviceTypeId,
    teamId,
    positionId,
    planId,
    dateKey
  );
  const readCachedPeopleForQuery = useCallback(
    () => readCachedPeople(serviceTypeId, teamId, positionId, planId, dateKey),
    [dateKey, planId, positionId, serviceTypeId, teamId]
  );
  useHydrateQueryFromCache(queryKey, readCachedPeopleForQuery);

  return useQuery<PersonWithAvailability[]>({
    ...createPeopleQueryOptions(
      serviceTypeId,
      teamId,
      positionId,
      planId,
      date
    ),
    queryKey,
    enabled: !!positionId && !!serviceTypeId,
    placeholderData: (previousPeople) => previousPeople,
  });
}

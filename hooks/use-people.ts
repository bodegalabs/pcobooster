import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { personWithAvailabilitySchema } from "@/lib/api-schemas";
import { getJson } from "@/lib/http/client";
import { isNonEmptyString } from "@/lib/json";
import { readCachedPeople, writeCachedPeople } from "@/lib/people-cache";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import type { PersonWithAvailability } from "@/lib/types";

const normalizePeopleDateKey = (date: Date | string | null): string | null => {
  if (date === null || date === "") {
    return null;
  }
  return date instanceof Date ? date.toISOString() : date;
};

const normalizePeopleDate = (date: Date | string | null): Date | null => {
  if (date === null || date === "") {
    return null;
  }
  return date instanceof Date ? date : new Date(date);
};

export const createPeopleQueryOptions = (
  serviceTypeId: string | null,
  teamId: string | null,
  positionId: string | null,
  planId: string | null = null,
  date: Date | string | null = null
) => {
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
      if (!isNonEmptyString(positionId) || !isNonEmptyString(serviceTypeId)) {
        return [];
      }

      const params = new URLSearchParams({
        service_type_id: serviceTypeId,
        position_id: positionId,
      });

      if (isNonEmptyString(teamId)) {
        params.append("team_id", teamId);
      }

      if (isNonEmptyString(planId)) {
        params.append("plan_id", planId);
      }

      if (dateObj && !Number.isNaN(dateObj.getTime())) {
        params.append("date", dateObj.toISOString());
      }

      const people = await getJson(
        `/api/people?${params.toString()}`,
        personWithAvailabilitySchema.array()
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
    // 5 minutes
    staleTime: 5 * 60 * 1000,
  };
};

export const usePeople = (
  serviceTypeId: string | null,
  teamId: string | null,
  positionId: string | null,
  planId: string | null = null,
  date: Date | string | null = null
) => {
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
    enabled: isNonEmptyString(positionId) && isNonEmptyString(serviceTypeId),
    placeholderData: (previousPeople) => previousPeople,
  });
};

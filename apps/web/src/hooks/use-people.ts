import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type { PersonWithAvailability } from "@pcobooster/planning-center-models/types";
import { useQuery } from "@tanstack/react-query";
import type { QueryFunctionContext } from "@tanstack/react-query";
import { useCallback } from "react";

import { readCachedPeople, writeCachedPeople } from "@/lib/people-cache";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import { orpc } from "@/orpc-client";

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
    queryFn: async ({ signal }: QueryFunctionContext) => {
      if (!isNonEmptyString(positionId) || !isNonEmptyString(serviceTypeId)) {
        return [];
      }

      const people = await orpc.people.list(
        {
          serviceTypeId,
          positionId,
          teamId: isNonEmptyString(teamId) ? teamId : undefined,
          planId: isNonEmptyString(planId) ? planId : undefined,
          date:
            dateObj && !Number.isNaN(dateObj.getTime())
              ? dateObj.toISOString()
              : undefined,
        },
        { signal }
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
  });
};

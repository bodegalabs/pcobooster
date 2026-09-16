import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { teamPositionGroupSchema } from "@/lib/api-schemas";
import { getJson } from "@/lib/http/client";
import { isNonEmptyString } from "@/lib/json";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import {
  readCachedTeamPositions,
  writeCachedTeamPositions,
} from "@/lib/team-positions-cache";
import type { TeamPositionGroup } from "@/lib/types";

const TEAM_POSITIONS_STALE_TIME_MS = 10 * 60 * 1000;

const buildTeamPositionsUrl = (
  serviceTypeId: string,
  planId: string,
  seriesId: string | null
): string => {
  const params = new URLSearchParams({
    service_type_id: serviceTypeId,
    plan_id: planId,
  });
  if (isNonEmptyString(seriesId)) {
    params.set("series_id", seriesId);
  }
  return `/api/team-positions?${params.toString()}`;
};

export const createTeamPositionsQueryOptions = (
  serviceTypeId: string | null,
  planId: string | null,
  seriesId: string | null
) => ({
  queryKey: queryKeys.teamPositions(serviceTypeId, planId, seriesId),
  queryFn: async () => {
    if (!isNonEmptyString(serviceTypeId) || !isNonEmptyString(planId)) {
      return [];
    }
    const groups = await getJson(
      buildTeamPositionsUrl(serviceTypeId, planId, seriesId),
      teamPositionGroupSchema.array()
    );
    writeCachedTeamPositions(serviceTypeId, planId, seriesId, groups);
    return groups;
  },
  staleTime: TEAM_POSITIONS_STALE_TIME_MS,
});

export const useTeamPositions = (
  serviceTypeId: string | null,
  planId: string | null,
  seriesId: string | null
) => {
  const queryKey = queryKeys.teamPositions(serviceTypeId, planId, seriesId);
  const readCachedGroups = useCallback(
    () => readCachedTeamPositions(serviceTypeId, planId, seriesId),
    [planId, seriesId, serviceTypeId]
  );
  useHydrateQueryFromCache(queryKey, readCachedGroups);

  return useQuery<TeamPositionGroup[]>({
    ...createTeamPositionsQueryOptions(serviceTypeId, planId, seriesId),
    queryKey,
    enabled: isNonEmptyString(serviceTypeId) && isNonEmptyString(planId),
    placeholderData: (previousGroups) => previousGroups,
  });
};

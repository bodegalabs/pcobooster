import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { getJson } from "@/lib/http/client";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import {
  readCachedTeamPositions,
  writeCachedTeamPositions,
} from "@/lib/team-positions-cache";
import type { TeamPositionGroup } from "@/lib/types";

const TEAM_POSITIONS_STALE_TIME_MS = 10 * 60 * 1000;

function buildTeamPositionsUrl(
  serviceTypeId: string,
  planId: string,
  seriesId: string | null
): string {
  const params = new URLSearchParams({
    service_type_id: serviceTypeId,
    plan_id: planId,
  });
  if (seriesId) {
    params.set("series_id", seriesId);
  }
  return `/api/team-positions?${params.toString()}`;
}

export function createTeamPositionsQueryOptions(
  serviceTypeId: string | null,
  planId: string | null,
  seriesId: string | null
) {
  return {
    queryKey: queryKeys.teamPositions(serviceTypeId, planId, seriesId),
    queryFn: async () => {
      if (!serviceTypeId || !planId) {
        return [];
      }
      const groups = await getJson<TeamPositionGroup[]>(
        buildTeamPositionsUrl(serviceTypeId, planId, seriesId)
      );
      writeCachedTeamPositions(serviceTypeId, planId, seriesId, groups);
      return groups;
    },
    staleTime: TEAM_POSITIONS_STALE_TIME_MS,
  };
}

export function useTeamPositions(
  serviceTypeId: string | null,
  planId: string | null,
  seriesId: string | null
) {
  const queryKey = queryKeys.teamPositions(serviceTypeId, planId, seriesId);
  const readCachedGroups = useCallback(
    () => readCachedTeamPositions(serviceTypeId, planId, seriesId),
    [planId, seriesId, serviceTypeId]
  );
  useHydrateQueryFromCache(queryKey, readCachedGroups);

  return useQuery<TeamPositionGroup[]>({
    ...createTeamPositionsQueryOptions(serviceTypeId, planId, seriesId),
    queryKey,
    enabled: !!serviceTypeId && !!planId,
    placeholderData: (previousGroups) => previousGroups,
  });
}

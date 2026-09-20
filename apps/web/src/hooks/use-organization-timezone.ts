"use client";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { organizationTimeZoneSchema } from "@/lib/api-schemas";
import { getJson } from "@/lib/http/client";
import {
  readCachedOrganizationTimeZone,
  writeCachedOrganizationTimeZone,
} from "@/lib/organization-time-zone-cache";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";

/** Client hook for the Services org `time_zone` (via `/api/planning-center/organization`). */
export const useOrganizationTimeZone = (): string => {
  const queryKey = queryKeys.organizationTimeZone();
  const readCachedTimeZone = useCallback(() => {
    const cachedTimeZone = readCachedOrganizationTimeZone();
    return cachedTimeZone
      ? {
          data: { timeZone: cachedTimeZone.timeZone },
          savedAt: cachedTimeZone.savedAt,
        }
      : undefined;
  }, []);
  useHydrateQueryFromCache(queryKey, readCachedTimeZone);

  const { data } = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await getJson(
        "/api/planning-center/organization",
        organizationTimeZoneSchema
      );
      writeCachedOrganizationTimeZone(response.timeZone);
      return response;
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });

  const tz = data?.timeZone?.trim();
  if (tz !== undefined && tz !== "") {
    return tz;
  }

  return (
    process.env.NEXT_PUBLIC_PLANNING_CENTER_TIME_ZONE?.trim() ??
    "America/Los_Angeles"
  );
};

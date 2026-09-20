"use client";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  readCachedOrganizationTimeZone,
  writeCachedOrganizationTimeZone,
} from "@/lib/organization-time-zone-cache";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import { orpc } from "@/orpc-client";

/** Client hook for the Planning Center Services organization time zone via oRPC. */
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
    queryFn: async ({ signal }) => {
      const response = await orpc.catalog.organization({}, { signal });
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

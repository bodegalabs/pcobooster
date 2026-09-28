import type { FeatureStatus } from "@pcobooster/contracts/features";
import { queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";

import { queryKeys } from "@/lib/query-keys";
import type { FeatureName } from "@/lib/query-keys";

/** Flag changes reach open tabs within this window (Flagship itself propagates in 30 s). */
const FEATURE_STALE_TIME_MS = 5 * 60 * 1000;

/** The API's answer for one flag for this visitor, cached per browser tab. */
export const createFeatureQueryOptions = (
  feature: FeatureName,
  fetchFeature: () => Promise<FeatureStatus>
) =>
  queryOptions({
    queryKey: queryKeys.feature(feature),
    queryFn: async () => await fetchFeature(),
    staleTime: FEATURE_STALE_TIME_MS,
  });

/** Refreshes a stale answer for the next visit; a no-op while the answer is fresh. */
const refreshFeature = async (
  queryClient: QueryClient,
  options: ReturnType<typeof createFeatureQueryOptions>
): Promise<void> => {
  try {
    await queryClient.query(options);
  } catch {
    // The cached answer stays; the next visit asks again.
  }
};

/**
 * Throws not found unless the flag is on. Any cached answer decides at once, so opening the
 * page never waits on the flag; a stale one is refreshed in the background for the next visit.
 */
export const requireFeature = async (
  queryClient: QueryClient,
  options: ReturnType<typeof createFeatureQueryOptions>
): Promise<void> => {
  const { enabled } = await queryClient.query({
    ...options,
    staleTime: "static",
  });
  void refreshFeature(queryClient, options);
  if (!enabled) {
    notFound({ throw: true });
  }
};

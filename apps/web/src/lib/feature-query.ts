import type {
  EnabledFeatures,
  FeatureFlagName,
} from "@pcobooster/contracts/features";
import { queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";

import { queryKeys } from "@/lib/query-keys";

/** Flag changes reach open tabs within this window (Flagship itself propagates in 30 s). */
const FEATURE_STALE_TIME_MS = 5 * 60 * 1000;

/** The API's answer for every flag for this visitor, cached per browser tab. */
export const createFeaturesQueryOptions = (
  fetchFeatures: () => Promise<EnabledFeatures>
) =>
  queryOptions({
    queryKey: queryKeys.features(),
    queryFn: async () => await fetchFeatures(),
    staleTime: FEATURE_STALE_TIME_MS,
  });

export type FeaturesQueryOptions = ReturnType<
  typeof createFeaturesQueryOptions
>;

/** Refreshes a stale answer for the next visit; a no-op while the answer is fresh. */
const refreshFeatures = async (
  queryClient: QueryClient,
  options: FeaturesQueryOptions
): Promise<void> => {
  try {
    await queryClient.query(options);
  } catch {
    // The cached answer stays; the next visit asks again.
  }
};

/**
 * Throws not found unless the flag is on. Any cached answer decides at once, so opening the
 * page never waits on the flags; a stale one is refreshed in the background for the next visit.
 */
export const requireFeature = async (
  queryClient: QueryClient,
  options: FeaturesQueryOptions,
  flag: FeatureFlagName
): Promise<void> => {
  const features = await queryClient.query({
    ...options,
    staleTime: "static",
  });
  void refreshFeatures(queryClient, options);
  if (!features[flag]) {
    notFound({ throw: true });
  }
};

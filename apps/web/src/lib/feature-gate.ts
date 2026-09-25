import type { FeatureStatus } from "@pcobooster/contracts/features";
import { queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";

/** Flag changes reach open tabs within this window (Flagship itself propagates in 30 s). */
const FEATURE_STALE_TIME_MS = 5 * 60 * 1000;

/** An API feature flag answer for this visitor, cached per browser tab. */
export const createFeatureQueryOptions = (
  queryKey: readonly [string],
  fetchFeature: () => Promise<FeatureStatus>
) =>
  queryOptions({
    queryKey,
    queryFn: async () => await fetchFeature(),
    staleTime: FEATURE_STALE_TIME_MS,
  });

/** Throws not found unless the flag is on, reusing a fresh cached answer. */
export const requireFeature = async (
  queryClient: QueryClient,
  options: ReturnType<typeof createFeatureQueryOptions>
): Promise<void> => {
  const { enabled } = await queryClient.query(options);
  if (!enabled) {
    notFound({ throw: true });
  }
};

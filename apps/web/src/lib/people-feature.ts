import type { FeatureStatus } from "@pcobooster/contracts/features";
import { queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";

import { queryKeys } from "@/lib/query-keys";

/** Flag changes reach open tabs within this window (Flagship itself propagates in 30 s). */
const PEOPLE_FEATURE_STALE_TIME_MS = 5 * 60 * 1000;

/** The API's `people` flag answer for this visitor, cached per browser tab. */
export const createPeopleFeatureQueryOptions = (
  fetchPeopleFeature: () => Promise<FeatureStatus>
) =>
  queryOptions({
    queryKey: queryKeys.peopleFeature(),
    queryFn: async () => await fetchPeopleFeature(),
    staleTime: PEOPLE_FEATURE_STALE_TIME_MS,
  });

/** Throws not found unless the flag is on, reusing a fresh cached answer. */
export const requirePeopleFeature = async (
  queryClient: QueryClient,
  options: ReturnType<typeof createPeopleFeatureQueryOptions>
): Promise<void> => {
  const { enabled } = await queryClient.query(options);
  if (!enabled) {
    notFound({ throw: true });
  }
};

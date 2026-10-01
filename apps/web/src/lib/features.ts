import type { FeatureFlagName } from "@pcobooster/contracts/features";
import type { QueryClient } from "@tanstack/react-query";

import {
  createFeaturesQueryOptions,
  requireFeature,
} from "@/lib/feature-query";
import { getEnabledFeatures } from "@/server/features.functions";

/**
 * The API's answer for every flag. The app layout loads it on the server, so the navigation
 * renders with it and never flashes a flagged link.
 */
export const featuresQueryOptions = createFeaturesQueryOptions(
  async () => await getEnabledFeatures()
);

/** A route's `beforeLoad` that renders not found unless the flag is on for this visitor. */
export const featureGuard =
  (flag: FeatureFlagName) =>
  async ({
    context,
  }: {
    context: { queryClient: QueryClient };
  }): Promise<void> => {
    await requireFeature(context.queryClient, featuresQueryOptions, flag);
  };

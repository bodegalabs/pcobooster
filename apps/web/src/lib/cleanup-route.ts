import type { QueryClient } from "@tanstack/react-query";

import { createFeatureQueryOptions, requireFeature } from "@/lib/feature-gate";
import { queryKeys } from "@/lib/query-keys";
import { getCleanupFeature } from "@/server/features.functions";

/** The API's `cleanup` flag answer, loaded with the app layout like People's. */
export const cleanupFeatureQueryOptions = createFeatureQueryOptions(
  queryKeys.cleanupFeature(),
  async () => await getCleanupFeature()
);

/** The cleanup page 404s unless the API's `cleanup` flag is on for this visitor. */
export const assertCleanupPageEnabled = async ({
  context,
}: {
  context: { queryClient: QueryClient };
}): Promise<void> => {
  await requireFeature(context.queryClient, cleanupFeatureQueryOptions);
};

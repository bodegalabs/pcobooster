import type { FeatureFlagName } from "@pcobooster/contracts/features";
import { useQuery } from "@tanstack/react-query";

import { featuresQueryOptions } from "@/lib/features";

/** Whether a flag is on for this visitor; off until the API answers. */
export const useFeatureEnabled = (flag: FeatureFlagName): boolean =>
  useQuery({ ...featuresQueryOptions, select: (features) => features[flag] })
    .data ?? false;

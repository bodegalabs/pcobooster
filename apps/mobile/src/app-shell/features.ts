import { useQuery } from "@tanstack/react-query";

import { sharedReads, useProductClient } from "./queries";

export interface AppFeatures {
  readonly people: boolean;
  readonly chordCharts: boolean;
  /** Flags have not answered yet for this account. */
  readonly isPending: boolean;
}

/** The account's feature flags (`features.status`); off until they answer. */
export const useFeatures = (): AppFeatures => {
  const features = useQuery(sharedReads.features(useProductClient()));
  return {
    people: features.data?.people ?? false,
    chordCharts: features.data?.chordCharts ?? false,
    isPending: features.isPending,
  };
};

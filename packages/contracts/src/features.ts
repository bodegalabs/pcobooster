import { oc } from "@orpc/contract";
import { applicationErrorMap } from "@pcobooster/contracts/errors";
import { z } from "zod";

/**
 * Every feature flag by name. The API's registry (`packages/api/src/config/feature-flags.ts`)
 * must define exactly these, so the browser, the API, and Flagship cannot disagree.
 */
export const featureFlagNames = ["people", "chordCharts"] as const;

export const featureFlagNameSchema = z.enum(featureFlagNames);

/** Whether each flag is on for this visitor; every flag is present. */
export const enabledFeaturesSchema = z.record(
  featureFlagNameSchema,
  z.boolean()
);

const featureProcedure = oc.errors({
  INTERNAL_SERVER_ERROR: applicationErrorMap.INTERNAL_SERVER_ERROR,
});

export const featuresContract = {
  status: featureProcedure
    .route({
      method: "GET",
      path: "/features",
      summary: "Check which feature flags are on for this visitor",
    })
    .output(enabledFeaturesSchema),
};

export type FeatureFlagName = z.output<typeof featureFlagNameSchema>;
export type EnabledFeatures = z.output<typeof enabledFeaturesSchema>;

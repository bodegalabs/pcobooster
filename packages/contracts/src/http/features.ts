import type { FeatureFlagName } from "@pcobooster/contracts/features";
/** Which feature flags are on for this visitor. */
import { read } from "@pcobooster/contracts/http/endpoint";
import { plainGroup } from "@pcobooster/contracts/http/group";
import { Schema } from "effect";

/**
 * Whether each flag is on for this visitor; every flag is present, as zod's exhaustive
 * `z.record(z.enum(featureFlagNames), z.boolean())` requires.
 */
export const enabledFeaturesSchema = Schema.Struct({
  people: Schema.Boolean,
  chordCharts: Schema.Boolean,
} satisfies Record<FeatureFlagName, typeof Schema.Boolean>);

export const features = plainGroup(
  "features",
  read("features.status", "/features", {
    params: {},
    query: {},
    success: enabledFeaturesSchema,
  })
);

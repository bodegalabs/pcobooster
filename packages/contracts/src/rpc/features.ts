/** Feature flag procedures over Effect RPC. Ported from the zod schemas in `../features.ts`. */
import type { FeatureFlagName } from "@pcobooster/contracts/features";
import { plainGroup } from "@pcobooster/contracts/rpc/group";
import { read } from "@pcobooster/contracts/rpc/procedure";
import { Schema } from "effect";

/**
 * Whether each flag is on for this visitor; every flag is present, as zod's exhaustive
 * `z.record(z.enum(featureFlagNames), z.boolean())` requires.
 */
export const enabledFeaturesSchema = Schema.Struct({
  people: Schema.Boolean,
  chordCharts: Schema.Boolean,
} satisfies Record<FeatureFlagName, typeof Schema.Boolean>);

/** Takes no input. */
export const featuresStatus = read("features.status", {
  payload: Schema.Void,
  success: enabledFeaturesSchema,
});

export const featuresProcedures = [featuresStatus] as const;
export const featuresRpc = plainGroup(...featuresProcedures);

import { RpcError } from "@pcobooster/contracts/errors";
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

/**
 * Every feature flag by name. The API's registry (`packages/api/src/config/feature-flags.ts`)
 * must define exactly these, so the browser, the API, and Flagship cannot disagree.
 */
export const featureFlagNames = ["people", "chordCharts"] as const;

export const featureFlagNameSchema = Schema.Literals(featureFlagNames);

/** Whether each flag is on for this visitor; every flag is present. */
export const enabledFeaturesSchema = Schema.Record(
  Schema.String,
  Schema.Boolean
)
  .check(Schema.isPropertyNames(featureFlagNameSchema))
  .pipe(Schema.decodeTo(Schema.Record(featureFlagNameSchema, Schema.Boolean)));

export const featuresRpc = RpcGroup.make(
  Rpc.make("features.status", {
    payload: Schema.Struct({}),
    success: enabledFeaturesSchema,
    error: RpcError,
  })
);

export type FeatureFlagName = typeof featureFlagNameSchema.Type;

export type EnabledFeatures = typeof enabledFeaturesSchema.Type;

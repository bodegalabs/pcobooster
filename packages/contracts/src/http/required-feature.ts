import type { FeatureFlagName } from "@pcobooster/contracts/features";
import { Context } from "effect";

/**
 * The feature flag an endpoint belongs to, set by `read`/`write`'s `feature` option. The server
 * answers `NotFound` while the flag is off for the caller, as if the endpoint did not exist.
 */
export class RequiredFeature extends Context.Service<
  RequiredFeature,
  FeatureFlagName
>()("@pcobooster/contracts/RequiredFeature") {}

/** The feature flag an endpoint was declared with, if any. */
export const requiredFeatureOf = (endpoint: {
  readonly annotations: Context.Context<never>;
}): FeatureFlagName | undefined =>
  Context.getOrUndefined(endpoint.annotations, RequiredFeature);

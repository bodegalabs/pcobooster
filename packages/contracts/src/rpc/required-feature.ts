import type { FeatureFlagName } from "@pcobooster/contracts/features";
import { Context } from "effect";
import type { Rpc } from "effect/unstable/rpc";

/**
 * The feature flag a procedure belongs to, set by `read`/`write`'s `feature` option. The server
 * answers `NotFound` while the flag is off for the caller, as if the procedure did not exist.
 */
export class RequiredFeature extends Context.Service<
  RequiredFeature,
  FeatureFlagName
>()("@pcobooster/contracts/RequiredFeature") {}

/** The feature flag a procedure was declared with, if any. */
export const requiredFeatureOf = (
  rpc: Pick<Rpc.AnyWithProps, "annotations">
): FeatureFlagName | undefined =>
  Context.getOrUndefined(rpc.annotations, RequiredFeature);

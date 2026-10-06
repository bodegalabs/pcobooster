import { requireFeatureFlag } from "@pcobooster/api/application/feature-flags";
import { PlanningCenterAccess } from "@pcobooster/api/application/planning-center-access";
import type { FeatureFlagName } from "@pcobooster/contracts/features";
import { Effect } from "effect";

/**
 * oRPC only: runs `program` once the caller's flag is on, as its programs did before Effect RPC
 * read `RequiredFeature` from the contract. Goes when oRPC does.
 */
export const requireFeature = <Value, Failure, Requirements>(
  name: FeatureFlagName,
  program: Effect.Effect<Value, Failure, Requirements>
) =>
  PlanningCenterAccess.pipe(
    Effect.flatMap((access) => requireFeatureFlag(access, name)),
    Effect.andThen(program)
  );

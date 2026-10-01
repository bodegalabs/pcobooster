import { NotFound } from "@pcobooster/api/application/errors/not-found";
import type {
  PlanningCenterRequestAccess,
  RequestAuthentication,
} from "@pcobooster/api/application/planning-center-access";
import type { FeatureFlagName } from "@pcobooster/api/config/feature-flags";
import { anonymousFeatureFlagSubject } from "@pcobooster/api/modules/feature-flags/feature-flags";
import type { FeatureFlagSubject } from "@pcobooster/api/modules/feature-flags/feature-flags";
import { Server } from "@pcobooster/api/server";
import { Effect } from "effect";

/** A demo visitor is anonymous; a signed-in user carries their selected account. */
export const featureFlagSubjectFor = (
  authentication: RequestAuthentication
): FeatureFlagSubject =>
  authentication.kind === "demo"
    ? anonymousFeatureFlagSubject
    : {
        userId: authentication.userId,
        planningCenterAccountId: authentication.accountId,
      };

/**
 * Fails with `NotFound` unless the flag is on for this caller, so a flagged-off feature's
 * procedures look like they don't exist.
 */
export const requireFeatureFlag = (
  access: PlanningCenterRequestAccess,
  name: FeatureFlagName,
  missing: { readonly message: string; readonly resource: string }
): Effect.Effect<void, NotFound, Server> =>
  Effect.gen(function* checkFeatureFlag() {
    const { featureFlags } = yield* Server;
    const enabled = yield* featureFlags.isEnabled(
      name,
      featureFlagSubjectFor(access.authentication)
    );
    if (!enabled) {
      yield* Effect.fail(new NotFound(missing));
    }
  });

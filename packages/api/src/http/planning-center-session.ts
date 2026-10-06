import { requireFeatureFlag } from "@pcobooster/api/application/feature-flags";
import {
  provideAccess,
  resolvePlanningCenterAccess,
} from "@pcobooster/api/application/planning-center-access";
import type { PlanningCenterAccessDependencies } from "@pcobooster/api/application/planning-center-access";
import { PlanningCenterSession } from "@pcobooster/contracts/http/planning-center-session";
import { requiredFeatureOf } from "@pcobooster/contracts/http/required-feature";
import { Effect, Layer } from "effect";

/**
 * Per call: resolves the caller's access (demo, then cookie or bearer session, then
 * the account), answers `NotFound` when the endpoint's `RequiredFeature` is off for that caller,
 * runs the endpoint with every Planning Center capability bound to that one credential, and
 * settles the shared read caches when it ends, however it ends.
 *
 * `dependencies` replaces how access is resolved; the Worker passes none.
 */
export const PlanningCenterSessionLive = (
  dependencies?: PlanningCenterAccessDependencies
): Layer.Layer<PlanningCenterSession> =>
  Layer.succeed(PlanningCenterSession)((httpEffect, { endpoint }) => {
    const feature = requiredFeatureOf(endpoint);
    return Effect.acquireUseRelease(
      resolvePlanningCenterAccess(dependencies),
      (access) =>
        provideAccess(
          feature === undefined
            ? httpEffect
            : Effect.andThen(requireFeatureFlag(access, feature), httpEffect),
          access
        ),
      // Shared read-cache writes must finish inside the request that started them.
      (access) => access.services.settleReadCaches
    );
  });

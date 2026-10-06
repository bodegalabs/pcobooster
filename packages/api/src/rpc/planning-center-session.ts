import { requireFeatureFlag } from "@pcobooster/api/application/feature-flags";
import {
  provideAccess,
  resolvePlanningCenterAccess,
} from "@pcobooster/api/application/planning-center-access";
import type { PlanningCenterAccessDependencies } from "@pcobooster/api/application/planning-center-access";
import { PlanningCenterSession } from "@pcobooster/contracts/rpc/planning-center-session";
import { requiredFeatureOf } from "@pcobooster/contracts/rpc/required-feature";
import { Effect, Layer } from "effect";

/**
 * Per procedure: resolves the caller's access (demo, then cookie or bearer session, then the
 * account), answers `NotFound` when the procedure's `RequiredFeature` is off for that caller,
 * runs the procedure with every Planning Center capability bound to that one credential, and
 * settles the shared read caches when it ends, however it ends. One credential serves the whole
 * procedure, so a prepared write's prepare and commit act as the same account.
 *
 * `dependencies` replaces how access is resolved; the Worker passes none.
 */
export const PlanningCenterSessionLive = (
  dependencies?: PlanningCenterAccessDependencies
): Layer.Layer<PlanningCenterSession> =>
  Layer.succeed(PlanningCenterSession)((effect, { rpc }) => {
    const feature = requiredFeatureOf(rpc);
    return Effect.acquireUseRelease(
      resolvePlanningCenterAccess(dependencies),
      (access) =>
        provideAccess(
          feature === undefined
            ? effect
            : Effect.andThen(requireFeatureFlag(access, feature), effect),
          access
        ),
      // Shared read-cache writes must finish inside the request that started them.
      (access) => access.services.settleReadCaches
    );
  });

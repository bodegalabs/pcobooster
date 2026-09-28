import type { RequestContext } from "@pcobooster/api/application/context";
import type { ApplicationFault } from "@pcobooster/api/application/errors";
import {
  PlanningCenterAccess,
  withPlanningCenterFaults,
} from "@pcobooster/api/application/planning-center-access";
import { getAccessSnapshot } from "@pcobooster/api/modules/planning-center/get-access-snapshot";
import type { PlanningCenterAccessSnapshot } from "@pcobooster/planning-center-models/access";
import { Effect } from "effect";

/** The signed-in person's Planning Center permissions, for showing what they can use. */
export const getPlanningCenterAccessSnapshot: Effect.Effect<
  PlanningCenterAccessSnapshot,
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> = Effect.gen(function* readAccessSnapshot() {
  const access = yield* PlanningCenterAccess;
  return yield* withPlanningCenterFaults(
    getAccessSnapshot({
      accessService: access.services.access,
      catalogService: access.services.catalog,
    })
  );
});

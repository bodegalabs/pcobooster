import type { ApplicationFault } from "@pcobooster/api/application/errors";
import { withPlanningCenterFaults } from "@pcobooster/api/application/planning-center-access";
import { PlanningCenterCatalog } from "@pcobooster/api/application/planning-center/catalog";
import { PlanningCenterProductAccess } from "@pcobooster/api/application/planning-center/product-access";
import { getAccessSnapshot } from "@pcobooster/api/modules/planning-center/get-access-snapshot";
import type { PlanningCenterAccessSnapshot } from "@pcobooster/planning-center-models/access";
import { Effect } from "effect";

/** The signed-in person's Planning Center permissions, for showing what they can use. */
export const getPlanningCenterAccessSnapshot: Effect.Effect<
  PlanningCenterAccessSnapshot,
  ApplicationFault,
  PlanningCenterCatalog | PlanningCenterProductAccess
> = Effect.gen(function* readAccessSnapshot() {
  const catalogService = yield* PlanningCenterCatalog;
  const productAccess = yield* PlanningCenterProductAccess;
  return yield* withPlanningCenterFaults(
    getAccessSnapshot({
      accessService: productAccess,
      catalogService,
    })
  );
});

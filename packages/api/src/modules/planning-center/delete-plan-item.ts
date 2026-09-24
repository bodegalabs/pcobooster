import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterPlanItemsService } from "@pcobooster/api/planning-center/services/plan-items-service";
import type { Effect } from "effect";

export interface DeletePlanItemDependencies {
  planItemsService: Pick<PlanningCenterPlanItemsService, "deletePlanItem">;
}

export const deletePlanItem = (
  serviceTypeId: string,
  planId: string,
  itemId: string,
  dependencies: DeletePlanItemDependencies
): Effect.Effect<void, PlanningCenterError> =>
  dependencies.planItemsService.deletePlanItem(serviceTypeId, planId, itemId);

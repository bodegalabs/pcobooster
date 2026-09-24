import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterPlanItemsService } from "@pcobooster/api/planning-center/services/plan-items-service";
import type { Effect } from "effect";

export interface ReorderPlanItemsDependencies {
  planItemsService: Pick<PlanningCenterPlanItemsService, "reorderPlanItems">;
}

export const reorderPlanItems = (
  serviceTypeId: string,
  planId: string,
  sequence: string[],
  dependencies: ReorderPlanItemsDependencies
): Effect.Effect<void, PlanningCenterError> =>
  dependencies.planItemsService.reorderPlanItems(
    serviceTypeId,
    planId,
    sequence
  );

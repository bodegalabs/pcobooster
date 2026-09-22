import type { PlanningCenterPlanItemsService } from "@pcobooster/api/planning-center/services/plan-items-service";

export interface ReorderPlanItemsDependencies {
  planItemsService: Pick<PlanningCenterPlanItemsService, "reorderPlanItems">;
}

export const reorderPlanItems = async (
  serviceTypeId: string,
  planId: string,
  sequence: string[],
  dependencies: ReorderPlanItemsDependencies
): Promise<void> => {
  await dependencies.planItemsService.reorderPlanItems(
    serviceTypeId,
    planId,
    sequence
  );
};

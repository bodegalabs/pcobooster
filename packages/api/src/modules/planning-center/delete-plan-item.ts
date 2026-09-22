import type { PlanningCenterPlanItemsService } from "@pcobooster/api/planning-center/services/plan-items-service";

export interface DeletePlanItemDependencies {
  planItemsService: Pick<PlanningCenterPlanItemsService, "deletePlanItem">;
}

export const deletePlanItem = async (
  serviceTypeId: string,
  planId: string,
  itemId: string,
  dependencies: DeletePlanItemDependencies
): Promise<void> => {
  await dependencies.planItemsService.deletePlanItem(
    serviceTypeId,
    planId,
    itemId
  );
};

import { planningCenterPlanItemsService } from "@worship-admin/api/planning-center/services/plan-items-service";

export const deletePlanItem = async (
  serviceTypeId: string,
  planId: string,
  itemId: string
): Promise<void> => {
  await planningCenterPlanItemsService.deletePlanItem(
    serviceTypeId,
    planId,
    itemId
  );
};

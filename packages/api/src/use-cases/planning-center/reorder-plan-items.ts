import { planningCenterPlanItemsService } from "@worship-admin/api/planning-center/services/plan-items-service";

export const reorderPlanItems = async (
  serviceTypeId: string,
  planId: string,
  sequence: string[]
): Promise<void> => {
  await planningCenterPlanItemsService.reorderPlanItems(
    serviceTypeId,
    planId,
    sequence
  );
};

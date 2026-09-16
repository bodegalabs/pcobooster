import { planningCenterPlanItemsService } from "@/lib/planning-center/services/plan-items-service";

export async function deletePlanItem(
  serviceTypeId: string,
  planId: string,
  itemId: string
): Promise<void> {
  await planningCenterPlanItemsService.deletePlanItem(
    serviceTypeId,
    planId,
    itemId
  );
}

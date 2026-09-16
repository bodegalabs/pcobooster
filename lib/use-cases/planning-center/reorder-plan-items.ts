import { planningCenterPlanItemsService } from "@/lib/planning-center/services/plan-items-service";

export async function reorderPlanItems(
  serviceTypeId: string,
  planId: string,
  sequence: string[]
): Promise<void> {
  await planningCenterPlanItemsService.reorderPlanItems(
    serviceTypeId,
    planId,
    sequence
  );
}

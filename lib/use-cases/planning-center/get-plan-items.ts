import { planningCenterPlanItemsService } from "@/lib/planning-center/services/plan-items-service";
import type { PlanItem } from "@/lib/types";
import { normalizePlanItem } from "@/lib/use-cases/planning-center/plan-items-shared";

export async function getPlanItems(
  serviceTypeId: string,
  planId: string
): Promise<PlanItem[]> {
  const response = await planningCenterPlanItemsService.getPlanItems(
    serviceTypeId,
    planId
  );

  return response.data
    .map((item) => normalizePlanItem(item, response.included))
    .toSorted((a, b) => a.sequence - b.sequence);
}

import { planningCenterPlanItemsService } from "@worship-admin/api/planning-center/services/plan-items-service";
import type { PlanningCenterPlanItemsService } from "@worship-admin/api/planning-center/services/plan-items-service";
import type { PlanItem } from "@worship-admin/api/types";
import { normalizePlanItem } from "@worship-admin/api/use-cases/planning-center/plan-items-shared";

export interface PlanItemsReader {
  getPlanItems: PlanningCenterPlanItemsService["getPlanItems"];
}

export const getPlanItems = async (
  serviceTypeId: string,
  planId: string,
  planItemsReader: PlanItemsReader = planningCenterPlanItemsService
): Promise<PlanItem[]> => {
  const response = await planItemsReader.getPlanItems(serviceTypeId, planId);

  return response.data
    .map((item) => normalizePlanItem(item, response.included))
    .toSorted((a, b) => a.sequence - b.sequence);
};

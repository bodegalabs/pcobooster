import { normalizePlanItem } from "@worship-admin/api/modules/planning-center/plan-items-shared";
import type { PlanningCenterPlanItemsService } from "@worship-admin/api/planning-center/services/plan-items-service";
import type { PlanItem } from "@worship-admin/planning-center-models/types";

export interface PlanItemsReader {
  getPlanItems: PlanningCenterPlanItemsService["getPlanItems"];
}

export const getPlanItems = async (
  serviceTypeId: string,
  planId: string,
  planItemsReader: PlanItemsReader,
  signal?: AbortSignal
): Promise<PlanItem[]> => {
  const response = await planItemsReader.getPlanItems(
    serviceTypeId,
    planId,
    signal
  );

  return response.data
    .map((item) => normalizePlanItem(item, response.included))
    .toSorted((a, b) => a.sequence - b.sequence);
};

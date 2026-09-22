import { normalizePlanItem } from "@pcobooster/api/modules/planning-center/plan-items-shared";
import type { PlanningCenterPlanItemsService } from "@pcobooster/api/planning-center/services/plan-items-service";
import type { PlanItem } from "@pcobooster/planning-center-models/types";

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

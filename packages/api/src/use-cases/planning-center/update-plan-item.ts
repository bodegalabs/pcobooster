import { planningCenterPlanItemsService } from "@worship-admin/api/planning-center/services/plan-items-service";
import type {
  PlanItem,
  PlanItemServicePosition,
} from "@worship-admin/api/types";
import {
  buildPlanItemAttributes,
  resolvePlanItemSongDefaults,
} from "@worship-admin/api/use-cases/planning-center/plan-item-payload";
import { normalizePlanItem } from "@worship-admin/api/use-cases/planning-center/plan-items-shared";

export interface UpdatePlanItemInput {
  serviceTypeId: string;
  planId: string;
  itemId: string;
  title?: string;
  servicePosition?: PlanItemServicePosition;
  length?: number | null;
  description?: string;
  htmlDetails?: string;
  songId?: string;
  arrangementId?: string;
  keyId?: string;
  selectedLayoutId?: string;
  customArrangementSequence?: string[];
}

export const updatePlanItem = async (
  input: UpdatePlanItemInput
): Promise<PlanItem> => {
  const resolvedInput = await resolvePlanItemSongDefaults(input);

  const response = await planningCenterPlanItemsService.updatePlanItem(
    input.serviceTypeId,
    input.planId,
    input.itemId,
    buildPlanItemAttributes(resolvedInput)
  );

  return normalizePlanItem(response.data, response.included);
};

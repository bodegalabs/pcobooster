import { planningCenterPlanItemsService } from "@/lib/planning-center/services/plan-items-service";
import type {
  PlanItem,
  PlanItemServicePosition,
  PlanItemType,
} from "@/lib/types";
import {
  buildPlanItemAttributes,
  resolvePlanItemSongDefaults,
} from "@/lib/use-cases/planning-center/plan-item-payload";
import { normalizePlanItem } from "@/lib/use-cases/planning-center/plan-items-shared";

export interface CreatePlanItemInput {
  serviceTypeId: string;
  planId: string;
  title?: string;
  itemType?: PlanItemType;
  servicePosition?: PlanItemServicePosition;
  length?: number | null;
  description?: string;
  htmlDetails?: string;
  songId?: string;
  arrangementId?: string | null;
  keyId?: string | null;
  selectedLayoutId?: string | null;
  customArrangementSequence?: string[];
}

export const createPlanItem = async (
  input: CreatePlanItemInput
): Promise<PlanItem> => {
  const resolvedInput = await resolvePlanItemSongDefaults({
    ...input,
    itemType:
      input.itemType === "header" || input.itemType === "item"
        ? input.itemType
        : undefined,
  });
  const attributes = buildPlanItemAttributes(resolvedInput, {
    defaultServicePosition: "during",
  });

  const response = await planningCenterPlanItemsService.createPlanItem(
    input.serviceTypeId,
    input.planId,
    attributes
  );

  return normalizePlanItem(response.data, response.included);
};

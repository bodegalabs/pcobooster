import {
  buildPlanItemAttributes,
  resolvePlanItemSongDefaults,
} from "@worship-admin/api/modules/planning-center/plan-item-payload";
import type { LoadSongOptions } from "@worship-admin/api/modules/planning-center/plan-item-payload";
import { normalizePlanItem } from "@worship-admin/api/modules/planning-center/plan-items-shared";
import type { PlanningCenterPlanItemsService } from "@worship-admin/api/planning-center/services/plan-items-service";
import type { JsonObject } from "@worship-admin/planning-center-models/json";
import type {
  PlanItem,
  PlanItemServicePosition,
} from "@worship-admin/planning-center-models/types";

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

export interface PreparedUpdatePlanItem {
  readonly serviceTypeId: string;
  readonly planId: string;
  readonly itemId: string;
  readonly attributes: JsonObject;
}

export const prepareUpdatePlanItem = async (
  input: UpdatePlanItemInput,
  loadSongOptions: LoadSongOptions
): Promise<PreparedUpdatePlanItem> => {
  const resolvedInput = await resolvePlanItemSongDefaults(
    input,
    loadSongOptions
  );
  return {
    serviceTypeId: input.serviceTypeId,
    planId: input.planId,
    itemId: input.itemId,
    attributes: buildPlanItemAttributes(resolvedInput),
  };
};

export const commitUpdatePlanItem = async (
  prepared: PreparedUpdatePlanItem,
  planItemsService: Pick<PlanningCenterPlanItemsService, "updatePlanItem">
): Promise<PlanItem> => {
  const response = await planItemsService.updatePlanItem(
    prepared.serviceTypeId,
    prepared.planId,
    prepared.itemId,
    prepared.attributes
  );

  return normalizePlanItem(response.data, response.included);
};

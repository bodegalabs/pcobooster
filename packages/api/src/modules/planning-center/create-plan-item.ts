import {
  buildPlanItemAttributes,
  resolvePlanItemSongDefaults,
} from "@pcobooster/api/modules/planning-center/plan-item-payload";
import type { LoadSongOptions } from "@pcobooster/api/modules/planning-center/plan-item-payload";
import { normalizePlanItem } from "@pcobooster/api/modules/planning-center/plan-items-shared";
import type { PlanningCenterPlanItemsService } from "@pcobooster/api/planning-center/services/plan-items-service";
import type { JsonObject } from "@pcobooster/planning-center-models/json";
import type {
  PlanItem,
  PlanItemServicePosition,
  PlanItemType,
} from "@pcobooster/planning-center-models/types";

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

export interface PreparedCreatePlanItem {
  readonly serviceTypeId: string;
  readonly planId: string;
  readonly attributes: JsonObject;
}

export const prepareCreatePlanItem = async (
  input: CreatePlanItemInput,
  loadSongOptions: LoadSongOptions
): Promise<PreparedCreatePlanItem> => {
  const resolvedInput = await resolvePlanItemSongDefaults(
    {
      ...input,
      itemType:
        input.itemType === "header" || input.itemType === "item"
          ? input.itemType
          : undefined,
    },
    loadSongOptions
  );
  return {
    serviceTypeId: input.serviceTypeId,
    planId: input.planId,
    attributes: buildPlanItemAttributes(resolvedInput, {
      defaultServicePosition: "during",
    }),
  };
};

export const commitCreatePlanItem = async (
  prepared: PreparedCreatePlanItem,
  planItemsService: Pick<PlanningCenterPlanItemsService, "createPlanItem">
): Promise<PlanItem> => {
  const response = await planItemsService.createPlanItem(
    prepared.serviceTypeId,
    prepared.planId,
    prepared.attributes
  );

  return normalizePlanItem(response.data, response.included);
};

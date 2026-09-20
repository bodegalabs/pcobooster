import { planningCenterPlanItemsService } from "@worship-admin/api/planning-center/services/plan-items-service";
import type { PlanningCenterPlanItemsService } from "@worship-admin/api/planning-center/services/plan-items-service";
import type {
  PlanItem,
  PlanItemServicePosition,
  PlanItemType,
} from "@worship-admin/api/types";
import { getSongOptions } from "@worship-admin/api/use-cases/planning-center/get-song-options";
import {
  buildPlanItemAttributes,
  resolvePlanItemSongDefaults,
} from "@worship-admin/api/use-cases/planning-center/plan-item-payload";
import { normalizePlanItem } from "@worship-admin/api/use-cases/planning-center/plan-items-shared";

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

export interface CreatePlanItemDependencies {
  planItemsService: Pick<PlanningCenterPlanItemsService, "createPlanItem">;
  loadSongOptions: typeof getSongOptions;
}

const defaultDependencies: CreatePlanItemDependencies = {
  planItemsService: planningCenterPlanItemsService,
  loadSongOptions: getSongOptions,
};

export const createPlanItem = async (
  input: CreatePlanItemInput,
  dependencies: CreatePlanItemDependencies = defaultDependencies
): Promise<PlanItem> => {
  const resolvedInput = await resolvePlanItemSongDefaults(
    {
      ...input,
      itemType:
        input.itemType === "header" || input.itemType === "item"
          ? input.itemType
          : undefined,
    },
    dependencies.loadSongOptions
  );
  const attributes = buildPlanItemAttributes(resolvedInput, {
    defaultServicePosition: "during",
  });

  const response = await dependencies.planItemsService.createPlanItem(
    input.serviceTypeId,
    input.planId,
    attributes
  );

  return normalizePlanItem(response.data, response.included);
};

import {
  buildPlanItemAttributes,
  resolvePlanItemSongDefaults,
} from "@pcobooster/api/modules/planning-center/plan-item-payload";
import type { LoadSongOptions } from "@pcobooster/api/modules/planning-center/plan-item-payload";
import { normalizePlanItem } from "@pcobooster/api/modules/planning-center/plan-items-shared";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterPlanItemsService } from "@pcobooster/api/planning-center/services/plan-items-service";
import type { JsonObject } from "@pcobooster/planning-center-models/json";
import type {
  PlanItem,
  PlanItemServicePosition,
  PlanItemType,
} from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

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

export const prepareCreatePlanItem = (
  input: CreatePlanItemInput,
  loadSongOptions: LoadSongOptions
): Effect.Effect<PreparedCreatePlanItem, PlanningCenterError> =>
  Effect.map(
    resolvePlanItemSongDefaults(
      {
        ...input,
        itemType:
          input.itemType === "header" || input.itemType === "item"
            ? input.itemType
            : undefined,
      },
      loadSongOptions
    ),
    (resolvedInput) => ({
      serviceTypeId: input.serviceTypeId,
      planId: input.planId,
      attributes: buildPlanItemAttributes(resolvedInput, {
        defaultServicePosition: "during",
      }),
    })
  );

export const commitCreatePlanItem = (
  prepared: PreparedCreatePlanItem,
  planItemsService: Pick<PlanningCenterPlanItemsService, "createPlanItem">
): Effect.Effect<PlanItem, PlanningCenterError> =>
  Effect.map(
    planItemsService.createPlanItem(
      prepared.serviceTypeId,
      prepared.planId,
      prepared.attributes
    ),
    (response) => normalizePlanItem(response.data, response.included)
  );

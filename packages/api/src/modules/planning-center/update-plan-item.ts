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
} from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

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

export const prepareUpdatePlanItem = (
  input: UpdatePlanItemInput,
  loadSongOptions: LoadSongOptions
): Effect.Effect<PreparedUpdatePlanItem, PlanningCenterError> =>
  Effect.map(
    resolvePlanItemSongDefaults(input, loadSongOptions),
    (resolvedInput) => ({
      serviceTypeId: input.serviceTypeId,
      planId: input.planId,
      itemId: input.itemId,
      attributes: buildPlanItemAttributes(resolvedInput),
    })
  );

export const commitUpdatePlanItem = (
  prepared: PreparedUpdatePlanItem,
  planItemsService: Pick<PlanningCenterPlanItemsService, "updatePlanItem">
): Effect.Effect<PlanItem, PlanningCenterError> =>
  Effect.map(
    planItemsService.updatePlanItem(
      prepared.serviceTypeId,
      prepared.planId,
      prepared.itemId,
      prepared.attributes
    ),
    (response) => normalizePlanItem(response.data, response.included)
  );

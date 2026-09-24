import { normalizePlanItem } from "@pcobooster/api/modules/planning-center/plan-items-shared";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterPlanItemsService } from "@pcobooster/api/planning-center/services/plan-items-service";
import type { PlanItem } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

export interface PlanItemsReader {
  getPlanItems: PlanningCenterPlanItemsService["getPlanItems"];
}

export const getPlanItems = (
  serviceTypeId: string,
  planId: string,
  planItemsReader: PlanItemsReader
): Effect.Effect<PlanItem[], PlanningCenterError> =>
  Effect.map(planItemsReader.getPlanItems(serviceTypeId, planId), (response) =>
    response.data
      .map((item) => normalizePlanItem(item, response.included))
      .toSorted((a, b) => a.sequence - b.sequence)
  );

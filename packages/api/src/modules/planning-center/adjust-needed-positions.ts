import { buildSlotKey } from "@pcobooster/api/modules/planning-center/plan-scheduling-context";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import { isNumber, isString } from "@pcobooster/planning-center-models/json";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

export interface NeededPositionsDependencies {
  catalogService: Pick<
    PlanningCenterCatalogService,
    | "invalidateNeededPositionsCache"
    | "getServiceTypePlanNeededPositionsWithTeams"
    | "updateServiceTypePlanNeededPositionQuantity"
    | "deleteServiceTypePlanNeededPosition"
  >;
}

export interface AdjustNeededPositionsInput {
  serviceTypeId: string;
  planId: string;
  teamId: string;
  positionName: string;
  change: "add" | "remove";
}

const quantityOf = (record: PCResource): number => {
  const { quantity } = record.attributes;
  return isNumber(quantity) ? quantity : 0;
};

const teamIdOf = (record: PCResource): string | null => {
  const team = record.relationships?.team?.data;
  return team && !Array.isArray(team) ? team.id : null;
};

/**
 * Adds or removes one open slot for a position. Planning Center keeps open slots as
 * needed-position records (one per time or time preference), so this changes the first
 * record when adding and the last when removing, deleting a record whose last slot goes.
 * A position without a record is left alone: the public API creates records only by
 * quantity and time, not for a named position.
 */
export const adjustNeededPositions = (
  input: AdjustNeededPositionsInput,
  dependencies: NeededPositionsDependencies
): Effect.Effect<{ openCount: number }, PlanningCenterError> =>
  Effect.gen(function* adjustOpenSlots() {
    const { catalogService } = dependencies;
    const { serviceTypeId, planId } = input;
    // Read fresh: a cached count could have been changed in Planning Center since.
    catalogService.invalidateNeededPositionsCache(serviceTypeId, planId);
    const { data } =
      yield* catalogService.getServiceTypePlanNeededPositionsWithTeams(
        serviceTypeId,
        planId
      );
    const slotKey = buildSlotKey(input.teamId, input.positionName);
    const records = data.filter((record) => {
      const teamId = teamIdOf(record);
      const name = record.attributes.team_position_name;
      return (
        quantityOf(record) > 0 &&
        teamId !== null &&
        isString(name) &&
        buildSlotKey(teamId, name) === slotKey
      );
    });
    const openCount = records.reduce(
      (sum, record) => sum + quantityOf(record),
      0
    );

    const target = input.change === "add" ? records[0] : records.at(-1);
    if (target === undefined) {
      return { openCount };
    }
    const nextQuantity = quantityOf(target) + (input.change === "add" ? 1 : -1);
    yield* nextQuantity > 0
      ? catalogService.updateServiceTypePlanNeededPositionQuantity(
          serviceTypeId,
          planId,
          target.id,
          nextQuantity
        )
      : catalogService.deleteServiceTypePlanNeededPosition(
          serviceTypeId,
          planId,
          target.id
        );
    return { openCount: openCount + (input.change === "add" ? 1 : -1) };
  });

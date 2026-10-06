import {
  teamPositionGroupSchema,
  teamPositionsInputSchema,
} from "@pcobooster/contracts/http/catalog";
import { neededPositionsAdjustInputSchema } from "@pcobooster/contracts/http/needed-positions";
import {
  scheduleRemoveInputSchema,
  scheduleUpdateStatusInputSchema,
} from "@pcobooster/contracts/http/schedule";
import type { TeamPositionGroup } from "@pcobooster/planning-center-models/types";
import { Schema } from "effect";
import type { Json } from "effect/Schema";

import type { PersonStatus } from "../features/plan/roster";
import {
  adjustOpenSlots,
  editRosterPerson,
  openSlots,
} from "../features/plan/roster";

const fixtureStatuses = {
  C: "confirmed",
  U: "pending",
  D: "declined",
} as const;

const decodeGroups = Schema.decodeUnknownSync(
  Schema.mutable(Schema.Array(teamPositionGroupSchema))
);
const encodeJson = Schema.decodeUnknownSync(Schema.Json);

const keyFor = (serviceTypeId: string, planId: string): string =>
  `${serviceTypeId}:${planId}`;

/** Per-client fixture state: writes survive refetches, and never leave the device. */
export const makeFixtureRoster = () => {
  const rosters = new Map<string, TeamPositionGroup[]>();
  return (tag: string, payload: Json, fixture: Json): Json => {
    if (tag === "catalog.teamPositions") {
      const input = Schema.decodeUnknownSync(teamPositionsInputSchema)(payload);
      const key = keyFor(input.serviceTypeId, input.planId);
      const groups = rosters.get(key) ?? decodeGroups(fixture);
      rosters.set(key, groups);
      return encodeJson(groups);
    }
    if (tag === "neededPositions.adjust") {
      const input = Schema.decodeUnknownSync(neededPositionsAdjustInputSchema)(
        payload
      );
      const key = keyFor(input.serviceTypeId, input.planId);
      const groups = rosters.get(key) ?? [];
      const position = groups
        .find((group) => group.teamId === input.teamId)
        ?.positions.find((candidate) => candidate.name === input.positionName);
      if (position === undefined) {
        return fixture;
      }
      const changed = adjustOpenSlots(
        groups,
        input.teamId,
        position.id,
        input.change
      );
      rosters.set(key, changed);
      return {
        openCount: openSlots(
          changed
            .find((group) => group.teamId === input.teamId)
            ?.positions.find((candidate) => candidate.id === position.id) ??
            position
        ),
      };
    }
    if (tag === "schedule.updateStatus" || tag === "schedule.remove") {
      const input = Schema.decodeUnknownSync(scheduleRemoveInputSchema)(
        payload
      );
      const status =
        tag === "schedule.remove"
          ? "remove"
          : Schema.decodeUnknownSync(scheduleUpdateStatusInputSchema)(payload)
              .status;
      const mapped: PersonStatus | "remove" =
        status === "remove" ? "remove" : fixtureStatuses[status];
      for (const [key, groups] of rosters) {
        if (
          input.planId !== undefined &&
          input.serviceTypeId !== undefined &&
          key !== keyFor(input.serviceTypeId, input.planId)
        ) {
          continue;
        }
        rosters.set(key, editRosterPerson(groups, input.planPersonId, mapped));
      }
    }
    return fixture;
  };
};

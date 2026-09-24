import { ensureRequestIsOpen } from "@pcobooster/api/application/context";
import type { ApplicationFault } from "@pcobooster/api/application/errors";
import { AlreadyScheduled } from "@pcobooster/api/application/errors/already-scheduled";
import { PositionMismatch } from "@pcobooster/api/application/errors/position-mismatch";
import {
  PlanningCenterAccess,
  planningCenterFault,
  withPlanningCenterFaults,
} from "@pcobooster/api/application/planning-center-access";
import { invalidateCandidateHistoryForPerson } from "@pcobooster/api/modules/planning-center/get-people-for-position";
import {
  matchesScheduleTarget,
  resolveScheduleTarget,
} from "@pcobooster/api/modules/planning-center/schedule-person";
import type {
  ScheduleAssignInput,
  ScheduleRemoveInput,
  ScheduleUpdateStatusInput,
} from "@pcobooster/contracts/schedule";
import { isString } from "@pcobooster/planning-center-models/json";
import { Effect } from "effect";

import type { RequestContext } from "./context";

export interface ScheduleApplicationDependencies {
  readonly invalidateHistory: typeof invalidateCandidateHistoryForPerson;
}

export interface ScheduleAssignmentPreparation {
  readonly target: {
    readonly teamName: string;
    readonly positionName: string;
  };
}

const defaultDependencies: ScheduleApplicationDependencies = {
  invalidateHistory: invalidateCandidateHistoryForPerson,
};

/** Read-only validation remains in the request's interruptible phase. */
export const prepareScheduledPerson = (
  input: ScheduleAssignInput,
  _dependencies: ScheduleApplicationDependencies = defaultDependencies
): Effect.Effect<
  ScheduleAssignmentPreparation,
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* preparePerson() {
    const access = yield* PlanningCenterAccess;
    const normalizedInput = { ...input, oneOff: input.oneOff ?? false };
    const target = yield* resolveScheduleTarget(normalizedInput, {
      catalog: access.services.catalog,
      people: access.services.people,
    });
    return { target };
  }).pipe(withPlanningCenterFaults);

/**
 * This phase begins at the provider-write boundary. The transport executes it
 * without request-driven interruption so the audit observes its actual result.
 */
export const commitScheduledPerson = (
  input: ScheduleAssignInput,
  preparation: ScheduleAssignmentPreparation,
  dependencies: ScheduleApplicationDependencies = defaultDependencies
): Effect.Effect<
  { readonly success: true; readonly data: { readonly id: string } },
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* commitPerson() {
    const access = yield* PlanningCenterAccess;
    yield* ensureRequestIsOpen;
    // The scheduling transport does not interrupt this provider mutation,
    // so its outcome is audited accurately.
    const created = yield* access.services.people
      .createPlanPerson(
        input.serviceTypeId,
        input.personId,
        input.planId,
        input.teamId,
        preparation.target.positionName
      )
      .pipe(
        Effect.catch((error) => {
          if (
            error.message.includes(
              "has already been scheduled for this position"
            )
          ) {
            access.services.people.invalidateScheduleReadCaches(input);
            dependencies.invalidateHistory(input.personId, access.cacheScope);
            return Effect.fail(
              new AlreadyScheduled({
                message:
                  "Person is already scheduled for this selected plan/team/position",
                details: access.presentation ? undefined : error.message,
              })
            );
          }
          return Effect.fail(planningCenterFault(error));
        })
      );

    access.services.people.invalidateScheduleReadCaches(input);
    dependencies.invalidateHistory(input.personId, access.cacheScope);
    const name = created.attributes.team_position_name;
    const createdPositionName = isString(name) ? name : "";

    if (!matchesScheduleTarget(preparation.target, createdPositionName)) {
      return yield* Effect.fail(
        new PositionMismatch({
          message:
            "PlanPerson was created but did not match selected team/position. Please check split-team/time settings in Planning Center.",
          details: {
            selected: {
              teamId: input.teamId,
              teamName: preparation.target.teamName,
              positionId: input.positionId,
              positionName: preparation.target.positionName,
            },
            created: {
              planPersonId: created.id,
              teamPositionName: createdPositionName,
            },
          },
        })
      );
    }

    return { success: true as const, data: { id: created.id } };
  });

export const removeScheduledPerson = (
  input: ScheduleRemoveInput,
  dependencies: ScheduleApplicationDependencies = defaultDependencies
): Effect.Effect<
  { readonly success: true },
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* removePerson() {
    const access = yield* PlanningCenterAccess;
    yield* ensureRequestIsOpen;
    yield* access.services.people.deletePlanPerson(input.planPersonId, input);
    if (input.personId !== undefined) {
      dependencies.invalidateHistory(input.personId, access.cacheScope);
    }
    return { success: true as const };
  }).pipe(withPlanningCenterFaults);

export const updateScheduledPersonStatus = (
  input: ScheduleUpdateStatusInput,
  dependencies: ScheduleApplicationDependencies = defaultDependencies
): Effect.Effect<
  { readonly success: true },
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* updateStatus() {
    const access = yield* PlanningCenterAccess;
    yield* ensureRequestIsOpen;
    yield* access.services.people.updatePlanPersonStatus(
      input.planPersonId,
      input.status,
      input
    );
    if (input.personId !== undefined) {
      dependencies.invalidateHistory(input.personId, access.cacheScope);
    }
    return { success: true as const };
  }).pipe(withPlanningCenterFaults);

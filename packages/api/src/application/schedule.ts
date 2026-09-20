import type { ApplicationFault } from "@worship-admin/api/application/errors";
import { AlreadyScheduled } from "@worship-admin/api/application/errors/already-scheduled";
import { PositionMismatch } from "@worship-admin/api/application/errors/position-mismatch";
import {
  PlanningCenterAccess,
  toApplicationFault,
  tryPlanningCenter,
} from "@worship-admin/api/application/planning-center-access";
import { isString } from "@worship-admin/api/json";
import { isPresentationMode } from "@worship-admin/api/presentation-mode";
import { invalidateCandidateHistoryForPerson } from "@worship-admin/api/use-cases/planning-center/get-people-for-position";
import {
  matchesScheduleTarget,
  resolveScheduleTarget,
} from "@worship-admin/api/use-cases/planning-center/schedule-person";
import type {
  ScheduleAssignInput,
  ScheduleRemoveInput,
  ScheduleUpdateStatusInput,
} from "@worship-admin/contracts/schedule";
import { Effect } from "effect";

import { RequestContext } from "./context";

export interface ScheduleApplicationDependencies {
  readonly invalidateHistory: typeof invalidateCandidateHistoryForPerson;
  readonly presentationMode: () => boolean;
}

export interface ScheduleAssignmentPreparation {
  readonly target: {
    readonly teamName: string;
    readonly positionName: string;
  };
}

const defaultDependencies: ScheduleApplicationDependencies = {
  invalidateHistory: invalidateCandidateHistoryForPerson,
  presentationMode: isPresentationMode,
};

/**
 * A disconnect during preflight must never turn into a delayed provider
 * mutation. The scheduling transport keeps execution alive long enough to
 * audit this interruption, while this boundary prevents a subsequent write.
 */
const ensureRequestIsOpen: Effect.Effect<void, never, RequestContext> =
  Effect.gen(function* ensureRequestIsOpen() {
    const { signal } = yield* RequestContext;
    if (signal.aborted) {
      yield* Effect.interrupt;
    }
  });

/** Read-only validation remains in the request's interruptible phase. */
export const prepareScheduledPerson = (
  input: ScheduleAssignInput,
  _dependencies: ScheduleApplicationDependencies = defaultDependencies
): Effect.Effect<
  ScheduleAssignmentPreparation,
  ApplicationFault,
  PlanningCenterAccess
> =>
  Effect.gen(function* preparePerson() {
    const access = yield* PlanningCenterAccess;
    const normalizedInput = { ...input, oneOff: input.oneOff ?? false };
    const target = yield* tryPlanningCenter(
      async () =>
        await resolveScheduleTarget(normalizedInput, {
          catalog: access.services.catalog,
          people: access.services.people,
          invalidate: (personId) => {
            void personId;
          },
        })
    );
    return { target };
  });

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
    const created = yield* Effect.tryPromise({
      // This call starts the provider mutation synchronously. The scheduling
      // transport does not interrupt it, so its outcome is audited accurately.
      try: async () =>
        await access.services.people.createPlanPerson(
          input.serviceTypeId,
          input.personId,
          input.planId,
          input.teamId,
          preparation.target.positionName
        ),
      catch: (error) => {
        const cause = error instanceof Error ? error : new Error(String(error));
        if (
          cause.message.includes("has already been scheduled for this position")
        ) {
          access.services.people.invalidateScheduleReadCaches(input);
          dependencies.invalidateHistory(input.personId, access.cacheScope);
          return new AlreadyScheduled({
            message:
              "Person is already scheduled for this selected plan/team/position",
            details: dependencies.presentationMode()
              ? undefined
              : cause.message,
          });
        }
        return toApplicationFault(cause);
      },
    });

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
    yield* tryPlanningCenter(async () => {
      await access.services.people.deletePlanPerson(input.planPersonId, input);
      if (input.personId !== undefined) {
        dependencies.invalidateHistory(input.personId, access.cacheScope);
      }
    });
    return { success: true as const };
  });

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
    yield* tryPlanningCenter(async () => {
      await access.services.people.updatePlanPersonStatus(
        input.planPersonId,
        input.status,
        input
      );
      if (input.personId !== undefined) {
        dependencies.invalidateHistory(input.personId, access.cacheScope);
      }
    });
    return { success: true as const };
  });

/**
 * The D1 audit of schedule writes. A handler combinator, not middleware, because it needs each
 * procedure's own input and answer. The row names the request's own method and path
 * (`PATCH /api/v1/plan-people/<id>`).
 */
import { RequestContext } from "@pcobooster/api/application/context";
import type { RequestContextValue } from "@pcobooster/api/application/context";
import { PlanningCenterAccess } from "@pcobooster/api/application/planning-center-access";
import type { AccountAuthentication } from "@pcobooster/api/application/planning-center-access";
import {
  getActivityRequestContext,
  recordActivityEvent,
} from "@pcobooster/api/db/activity-events";
import type { ActivityEventInput } from "@pcobooster/api/db/activity-events";
import { causeError, procedureOutcome } from "@pcobooster/api/http/outcome";
import { moduleLog } from "@pcobooster/api/logging";
import { Server } from "@pcobooster/api/server";
import { scheduleAssignOutputSchema } from "@pcobooster/contracts/http/schedule";
import type { JsonObject } from "@pcobooster/planning-center-models/json";
import { Effect, Exit, Option, Schema } from "effect";

const scheduleLog = moduleLog("schedule");

export type ScheduleOperation = "assign" | "remove" | "updateStatus";

const eventTypes = {
  assign: "schedule_attempt",
  remove: "schedule_remove",
  updateStatus: "schedule_status_change",
} as const satisfies Record<ScheduleOperation, string>;

/** The input fields any schedule write may carry; each operation's payload is one of these. */
export interface ScheduleActivityFields {
  readonly planPersonId?: string;
  readonly personId?: string;
  readonly serviceTypeId?: string;
  readonly planId?: string;
  readonly teamId?: string;
  readonly positionId?: string;
  readonly status?: "C" | "U" | "D";
  readonly oneOff?: boolean;
}

export interface ScheduleAttempt {
  readonly operation: ScheduleOperation;
  readonly input: ScheduleActivityFields;
  readonly exit: Exit.Exit<unknown, unknown>;
}

export interface ScheduleAuditDependencies {
  /** Writes one activity row; D1 through the request's server by default. */
  readonly recordActivity?: (event: ActivityEventInput) => Promise<void>;
}

const decodeAssignOutput = Schema.decodeUnknownOption(
  scheduleAssignOutputSchema
);

/** The audit row's metadata: the target, the status, and what an assignment made. */
const activityMetadata = ({
  operation,
  input,
  exit,
}: ScheduleAttempt): JsonObject => {
  const metadata: JsonObject = {};
  if (input.planPersonId !== undefined) {
    metadata.planPersonId = input.planPersonId;
    metadata.personId = input.personId ?? null;
    metadata.serviceTypeId = input.serviceTypeId ?? null;
    metadata.planId = input.planId ?? null;
  }
  if (input.status !== undefined) {
    metadata.status = input.status;
  }
  if (operation === "assign" && Exit.isSuccess(exit)) {
    const output = decodeAssignOutput(exit.value);
    if (Option.isSome(output)) {
      metadata.planPersonId = output.value.data.id;
    }
    metadata.oneOff = input.oneOff ?? false;
  }
  const outcome = procedureOutcome(exit);
  if (outcome.kind === "fault" && outcome.fault._tag === "PositionMismatch") {
    const { selected, created } = outcome.fault.details;
    metadata.selectedTeamName = selected.teamName;
    metadata.selectedPositionName = selected.positionName;
    metadata.createdTeamPositionName = created.teamPositionName;
    metadata.planPersonId = created.planPersonId;
  }
  return metadata;
};

/**
 * The D1 row for one attempt. Status and code come from `procedureOutcome`, so an interrupted
 * prepare records 499 and a defect 500, as the procedure's outcome line does.
 */
export const scheduleActivityEvent = (
  attempt: ScheduleAttempt,
  authentication: AccountAuthentication,
  request: RequestContextValue
): ActivityEventInput => {
  const outcome = procedureOutcome(attempt.exit);
  const { input } = attempt;
  return {
    ...getActivityRequestContext(request.request),
    requestId: request.requestId,
    eventType: eventTypes[attempt.operation],
    actorUserId: authentication.userId,
    actorAccountId: authentication.accountId,
    success: outcome.kind === "success",
    statusCode: outcome.status,
    errorCode: outcome.code,
    serviceTypeId: input.serviceTypeId ?? null,
    personId: input.personId ?? null,
    planId: input.planId ?? null,
    teamId: input.teamId ?? null,
    positionId: input.positionId ?? null,
    metadata: activityMetadata(attempt),
  };
};

/**
 * Runs `program`, then records its outcome in D1 before the procedure answers. Demo visitors are
 * anonymous and cannot write, so they are skipped. A failed D1 write is logged and never changes
 * the result. Inside a `write` procedure this runs uninterruptibly, so the row always matches
 * what Planning Center did.
 */
export const auditSchedule = <Value, Failure, Services>(
  operation: ScheduleOperation,
  input: ScheduleActivityFields,
  program: Effect.Effect<Value, Failure, Services>,
  dependencies: ScheduleAuditDependencies = {}
): Effect.Effect<
  Value,
  Failure,
  Services | PlanningCenterAccess | RequestContext | Server
> =>
  Effect.gen(function* auditedScheduleWrite() {
    const { authentication } = yield* PlanningCenterAccess;
    const request = yield* RequestContext;
    const server = yield* Server;
    const recordActivity =
      dependencies.recordActivity ??
      (async (event: ActivityEventInput) => {
        await recordActivityEvent(server, event);
      });
    return yield* Effect.onExit(program, (exit) => {
      if (authentication.kind === "demo") {
        return Effect.void;
      }
      const event = scheduleActivityEvent(
        { operation, input, exit },
        authentication,
        request
      );
      return Effect.tryPromise({
        try: async () => {
          await recordActivity(event);
        },
        catch: (error) =>
          error instanceof Error ? error : new Error(String(error)),
      }).pipe(
        Effect.catchCause((cause) =>
          scheduleLog.warn("Failed to record scheduling activity event", {
            requestId: request.requestId,
            method: request.method,
            path: event.path,
            error: causeError(cause).message,
          })
        )
      );
    });
  });

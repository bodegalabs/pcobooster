/**
 * The D1 audit of schedule writes over Effect RPC: the port of the oRPC transport's audited
 * middleware and `schedule-activity.ts`. A handler combinator, not middleware, because it needs
 * each procedure's exact payload and success types.
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
import { moduleLog } from "@pcobooster/api/logging";
import { causeError, procedureOutcome } from "@pcobooster/api/rpc/outcome";
import { Server } from "@pcobooster/api/server";
import type {
  ScheduleAssignInput,
  ScheduleAssignOutput,
} from "@pcobooster/contracts/rpc/schedule";
import type { JsonObject } from "@pcobooster/planning-center-models/json";
import { Effect, Exit } from "effect";

const scheduleLog = moduleLog("schedule");

export interface ScheduleAuditDependencies {
  /** Writes one activity row; D1 through the request's server by default. */
  readonly recordActivity?: (event: ActivityEventInput) => Promise<void>;
}

export interface ScheduleAssignAudit {
  readonly input: ScheduleAssignInput;
  readonly exit: Exit.Exit<ScheduleAssignOutput, unknown>;
}

const assignMetadata = ({ input, exit }: ScheduleAssignAudit): JsonObject => {
  const metadata: JsonObject = { oneOff: input.oneOff };
  if (Exit.isSuccess(exit)) {
    metadata.planPersonId = exit.value.data.id;
    return metadata;
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
 * prepare records 499 and a defect 500, as on main.
 */
export const scheduleActivityEvent = (
  audit: ScheduleAssignAudit,
  authentication: AccountAuthentication,
  request: RequestContextValue
): ActivityEventInput => {
  const outcome = procedureOutcome(audit.exit);
  const { input } = audit;
  return {
    ...getActivityRequestContext(request.request),
    requestId: request.requestId,
    eventType: "schedule_attempt",
    actorUserId: authentication.userId,
    actorAccountId: authentication.accountId,
    success: outcome.kind === "success",
    statusCode: outcome.status,
    errorCode: outcome.code,
    serviceTypeId: input.serviceTypeId,
    personId: input.personId,
    planId: input.planId,
    teamId: input.teamId,
    positionId: input.positionId,
    metadata: assignMetadata(audit),
  };
};

/**
 * Runs `program`, then records its outcome in D1 before the procedure answers. Demo visitors are
 * anonymous and cannot write, so they are skipped. A failed D1 write is logged and never changes
 * the result. Inside a `write` procedure this runs uninterruptibly, so the row always matches
 * what Planning Center did.
 */
export const auditScheduleAssign = <Failure, Services>(
  input: ScheduleAssignInput,
  program: Effect.Effect<ScheduleAssignOutput, Failure, Services>,
  dependencies: ScheduleAuditDependencies = {}
): Effect.Effect<
  ScheduleAssignOutput,
  Failure,
  Services | PlanningCenterAccess | RequestContext | Server
> =>
  Effect.gen(function* auditedAssign() {
    const { authentication } = yield* PlanningCenterAccess;
    const request = yield* RequestContext;
    const server = yield* Server;
    return yield* Effect.onExit(program, (exit) => {
      if (authentication.kind === "demo") {
        return Effect.void;
      }
      const event = scheduleActivityEvent(
        { input, exit },
        authentication,
        request
      );
      const recordActivity =
        dependencies.recordActivity ??
        (async (row: ActivityEventInput) => {
          await recordActivityEvent(server, row);
        });
      return Effect.tryPromise(async () => {
        await recordActivity(event);
      }).pipe(
        Effect.catchCause((cause) =>
          scheduleLog.warn("Failed to record scheduling activity event", {
            requestId: request.requestId,
            error: causeError(cause).message,
          })
        )
      );
    });
  });

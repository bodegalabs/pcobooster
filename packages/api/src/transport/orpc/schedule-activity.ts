import { ORPCError } from "@orpc/server";
import type { RequestAuthentication } from "@pcobooster/api/application/planning-center-access";
import { getActivityRequestContext } from "@pcobooster/api/db/activity-events";
import type { ActivityEventInput } from "@pcobooster/api/db/activity-events";
import type { RpcContext } from "@pcobooster/api/transport/orpc/context";
import {
  scheduleAssignInputSchema,
  scheduleAssignOutputSchema,
  schedulePositionMismatchErrorDataSchema,
  scheduleRemoveInputSchema,
  scheduleUpdateStatusInputSchema,
} from "@pcobooster/contracts/schedule";
import type { JsonObject } from "@pcobooster/planning-center-models/json";

export type ScheduleOperation = "assign" | "remove" | "updateStatus";

const inputSchemas = {
  assign: scheduleAssignInputSchema,
  remove: scheduleRemoveInputSchema,
  updateStatus: scheduleUpdateStatusInputSchema,
};

const eventTypes = {
  assign: "schedule_attempt",
  remove: "schedule_remove",
  updateStatus: "schedule_status_change",
} as const;

interface ActivityFields {
  readonly planPersonId?: string;
  readonly personId?: string;
  readonly serviceTypeId?: string;
  readonly planId?: string;
  readonly teamId?: string;
  readonly positionId?: string;
  readonly status?: "C" | "U" | "D";
  readonly oneOff?: boolean;
}

type ActivityResult =
  | { success: true; output: unknown }
  | { success: false; error: unknown };

const activityMetadata = (
  operation: ScheduleOperation,
  fields: ActivityFields,
  result: ActivityResult,
  error: ORPCError<string, unknown> | null
): JsonObject => {
  const metadata: JsonObject = {};
  if (fields.planPersonId !== undefined) {
    metadata.planPersonId = fields.planPersonId;
    metadata.personId = fields.personId ?? null;
    metadata.serviceTypeId = fields.serviceTypeId ?? null;
    metadata.planId = fields.planId ?? null;
  }
  if (fields.status !== undefined) {
    metadata.status = fields.status;
  }
  if (operation === "assign" && result.success) {
    const output = scheduleAssignOutputSchema.safeParse(result.output);
    if (output.success) {
      metadata.planPersonId = output.data.data.id;
    }
    metadata.oneOff = fields.oneOff ?? false;
  }
  if (error?.code === "POSITION_MISMATCH") {
    const mismatch = schedulePositionMismatchErrorDataSchema.safeParse(
      error.data
    );
    if (mismatch.success) {
      metadata.selectedTeamName = mismatch.data.details.selected.teamName;
      metadata.selectedPositionName =
        mismatch.data.details.selected.positionName;
      metadata.createdTeamPositionName =
        mismatch.data.details.created.teamPositionName;
      metadata.planPersonId = mismatch.data.details.created.planPersonId;
    }
  }
  return metadata;
};

export const scheduleActivityEvent = ({
  operation,
  input,
  authentication,
  context,
  result,
}: {
  operation: ScheduleOperation;
  input: unknown;
  authentication: RequestAuthentication;
  context: RpcContext;
  result: ActivityResult;
}): ActivityEventInput => {
  const parsedInput = inputSchemas[operation].safeParse(input);
  const fields: ActivityFields = parsedInput.success ? parsedInput.data : {};
  const error: ORPCError<string, unknown> | null =
    !result.success && result.error instanceof ORPCError ? result.error : null;

  return {
    ...getActivityRequestContext(context.request),
    requestId: context.requestId,
    eventType: eventTypes[operation],
    actorUserId: authentication.userId,
    actorAccountId: authentication.accountId,
    success: result.success,
    statusCode: result.success ? 200 : (error?.status ?? 500),
    errorCode: result.success ? null : (error?.code ?? "INTERNAL_SERVER_ERROR"),
    serviceTypeId: fields.serviceTypeId ?? null,
    personId: fields.personId ?? null,
    planId: fields.planId ?? null,
    teamId: fields.teamId ?? null,
    positionId: fields.positionId ?? null,
    metadata: activityMetadata(operation, fields, result, error),
  };
};

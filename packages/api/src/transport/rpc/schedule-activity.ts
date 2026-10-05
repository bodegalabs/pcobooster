import type { AccountAuthentication } from "@pcobooster/api/application/planning-center-access";
import { getActivityRequestContext } from "@pcobooster/api/db/activity-events";
import type { ActivityEventInput } from "@pcobooster/api/db/activity-events";
import type { RpcContext } from "@pcobooster/api/transport/rpc/context";
import { RpcError } from "@pcobooster/contracts/errors";
import {
  scheduleAssignInputSchema,
  scheduleAssignOutputSchema,
  schedulePositionMismatchErrorDataSchema,
  scheduleRemoveInputSchema,
  scheduleUpdateStatusInputSchema,
} from "@pcobooster/contracts/schedule";
import type { JsonObject } from "@pcobooster/planning-center-models/json";
import { Option, Schema } from "effect";

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
  error: RpcError | null
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
    const output = Schema.decodeUnknownOption(scheduleAssignOutputSchema)(
      result.output
    );
    if (Option.isSome(output)) {
      metadata.planPersonId = output.value.data.id;
    }
    metadata.oneOff = fields.oneOff ?? false;
  }
  if (error?.code === "POSITION_MISMATCH") {
    const mismatch = Schema.decodeUnknownOption(
      schedulePositionMismatchErrorDataSchema
    )(error.data);
    if (Option.isSome(mismatch)) {
      metadata.selectedTeamName = mismatch.value.details.selected.teamName;
      metadata.selectedPositionName =
        mismatch.value.details.selected.positionName;
      metadata.createdTeamPositionName =
        mismatch.value.details.created.teamPositionName;
      metadata.planPersonId = mismatch.value.details.created.planPersonId;
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
  authentication: AccountAuthentication;
  context: RpcContext;
  result: ActivityResult;
}): ActivityEventInput => {
  let fields: ActivityFields;
  if (operation === "assign") {
    fields = Option.getOrElse(
      Schema.decodeUnknownOption(inputSchemas.assign)(input),
      () => ({})
    );
  } else if (operation === "remove") {
    fields = Option.getOrElse(
      Schema.decodeUnknownOption(inputSchemas.remove)(input),
      () => ({})
    );
  } else {
    fields = Option.getOrElse(
      Schema.decodeUnknownOption(inputSchemas.updateStatus)(input),
      () => ({})
    );
  }

  const error: RpcError | null =
    !result.success && result.error instanceof RpcError ? result.error : null;

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

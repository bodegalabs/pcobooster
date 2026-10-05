import { RpcError } from "@pcobooster/contracts/errors";
import type {
  scheduleAlreadyScheduledErrorDataSchema,
  schedulePositionMismatchErrorDataSchema,
} from "@pcobooster/contracts/errors";
import { Schema, Struct, Effect } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

export {
  scheduleAlreadyScheduledErrorDataSchema,
  schedulePositionMismatchErrorDataSchema,
} from "@pcobooster/contracts/errors";
const requiredId = Schema.Trim.check(Schema.isMinLength(1));

const optionalId = Schema.optional(requiredId);

export const scheduleAssignInputSchema = Schema.Struct({
  serviceTypeId: requiredId,
  personId: requiredId,
  planId: requiredId,
  teamId: requiredId,
  positionId: requiredId,
  teamName: Schema.optional(requiredId),
  positionName: Schema.optional(requiredId),
  oneOff: Schema.Boolean.pipe(
    Schema.withDecodingDefault(Effect.succeed(false))
  ),
}).mapFields(Struct.map(Schema.mutableKey));

export const scheduleRemoveInputSchema = Schema.Struct({
  planPersonId: requiredId,
  serviceTypeId: optionalId,
  personId: optionalId,
  planId: optionalId,
}).mapFields(Struct.map(Schema.mutableKey));

export const scheduleUpdateStatusInputSchema = Schema.Struct({
  planPersonId: requiredId,
  status: Schema.Literals(["C", "U", "D"]),
  serviceTypeId: optionalId,
  personId: optionalId,
  planId: optionalId,
}).mapFields(Struct.map(Schema.mutableKey));

export const scheduleAssignOutputSchema = Schema.Struct({
  success: Schema.Literal(true),
  data: Schema.Struct({ id: requiredId }).mapFields(
    Struct.map(Schema.mutableKey)
  ),
}).mapFields(Struct.map(Schema.mutableKey));

export const scheduleMutationOutputSchema = Schema.Struct({
  success: Schema.Literal(true),
}).mapFields(Struct.map(Schema.mutableKey));

export const scheduleRpc = RpcGroup.make(
  Rpc.make("schedule.assign", {
    payload: scheduleAssignInputSchema,
    success: scheduleAssignOutputSchema,
    error: RpcError,
  }),
  Rpc.make("schedule.remove", {
    payload: scheduleRemoveInputSchema,
    success: scheduleMutationOutputSchema,
    error: RpcError,
  }),
  Rpc.make("schedule.updateStatus", {
    payload: scheduleUpdateStatusInputSchema,
    success: scheduleMutationOutputSchema,
    error: RpcError,
  })
);

export type ScheduleAssignInput = typeof scheduleAssignInputSchema.Encoded;

export type ScheduleRemoveInput = typeof scheduleRemoveInputSchema.Encoded;

export type ScheduleUpdateStatusInput =
  typeof scheduleUpdateStatusInputSchema.Encoded;

export type ScheduleAssignOutput = typeof scheduleAssignOutputSchema.Type;

export type ScheduleMutationOutput = typeof scheduleMutationOutputSchema.Type;

export type ScheduleAlreadyScheduledErrorData =
  typeof scheduleAlreadyScheduledErrorDataSchema.Type;

export type SchedulePositionMismatchErrorData =
  typeof schedulePositionMismatchErrorDataSchema.Type;

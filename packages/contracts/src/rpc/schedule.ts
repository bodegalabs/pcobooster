/** Schedule procedures over Effect RPC. Ported from the zod schemas in `../schedule.ts`. */
import { planningCenterGroup } from "@pcobooster/contracts/rpc/group";
import { write } from "@pcobooster/contracts/rpc/procedure";
import { requiredId } from "@pcobooster/contracts/rpc/schema";
import { Effect, Schema } from "effect";

export const scheduleAssignInputSchema = Schema.Struct({
  serviceTypeId: requiredId,
  personId: requiredId,
  planId: requiredId,
  teamId: requiredId,
  positionId: requiredId,
  teamName: Schema.optional(requiredId),
  positionName: Schema.optional(requiredId),
  /** `z.boolean().default(false)`: optional on the wire and when a client builds the input. */
  oneOff: Schema.Boolean.pipe(
    Schema.withDecodingDefault(Effect.succeed(false)),
    Schema.withConstructorDefault(Effect.succeed(false))
  ),
});
export type ScheduleAssignInput = typeof scheduleAssignInputSchema.Type;

export const scheduleAssignOutputSchema = Schema.Struct({
  success: Schema.Literal(true),
  data: Schema.Struct({ id: requiredId }),
});
export type ScheduleAssignOutput = typeof scheduleAssignOutputSchema.Type;

/** Who a removal or status change was about; optional, for the audit row. */
const scheduleTargetFields = {
  planPersonId: requiredId,
  serviceTypeId: Schema.optional(requiredId),
  personId: Schema.optional(requiredId),
  planId: Schema.optional(requiredId),
};

export const scheduleRemoveInputSchema = Schema.Struct(scheduleTargetFields);
export type ScheduleRemoveInput = typeof scheduleRemoveInputSchema.Type;

export const scheduleUpdateStatusInputSchema = Schema.Struct({
  ...scheduleTargetFields,
  status: Schema.Literals(["C", "U", "D"]),
});
export type ScheduleUpdateStatusInput =
  typeof scheduleUpdateStatusInputSchema.Type;

export const scheduleMutationOutputSchema = Schema.Struct({
  success: Schema.Literal(true),
});

/** An audited prepared write: the position check may stop; the create always finishes. */
export const scheduleAssign = write("schedule.assign", {
  payload: scheduleAssignInputSchema,
  success: scheduleAssignOutputSchema,
});

/** An audited write. */
export const scheduleRemove = write("schedule.remove", {
  payload: scheduleRemoveInputSchema,
  success: scheduleMutationOutputSchema,
});

/** An audited write. */
export const scheduleUpdateStatus = write("schedule.updateStatus", {
  payload: scheduleUpdateStatusInputSchema,
  success: scheduleMutationOutputSchema,
});

export const scheduleProcedures = [
  scheduleAssign,
  scheduleRemove,
  scheduleUpdateStatus,
] as const;
export const scheduleRpc = planningCenterGroup(...scheduleProcedures);

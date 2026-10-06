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
  oneOff: Schema.Boolean.pipe(
    Schema.withDecodingDefault(Effect.succeed(false))
  ),
});
export type ScheduleAssignInput = typeof scheduleAssignInputSchema.Type;

export const scheduleAssignOutputSchema = Schema.Struct({
  success: Schema.Literal(true),
  data: Schema.Struct({ id: requiredId }),
});
export type ScheduleAssignOutput = typeof scheduleAssignOutputSchema.Type;

export const scheduleAssign = write("schedule.assign", {
  payload: scheduleAssignInputSchema,
  success: scheduleAssignOutputSchema,
});

export const scheduleRpc = planningCenterGroup(scheduleAssign);

/** Schedule procedures over Effect RPC. Ported from the zod schemas in `../schedule.ts`. */
import { PlanningCenterSession } from "@pcobooster/contracts/rpc/planning-center-session";
import { write } from "@pcobooster/contracts/rpc/procedure";
import { Effect, Schema } from "effect";
import { RpcGroup } from "effect/unstable/rpc";

const requiredId = Schema.Trim.check(Schema.isMinLength(1));

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

export const scheduleRpc = RpcGroup.make(scheduleAssign).middleware(
  PlanningCenterSession
);

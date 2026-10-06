/** Plan time procedures over Effect RPC. Ported from the zod schemas in `../plan-times.ts`. */
import { planningCenterGroup } from "@pcobooster/contracts/rpc/group";
import {
  planTimeSchema,
  planTimeTypeSchema,
} from "@pcobooster/contracts/rpc/plan-time-schemas";
import { read, write } from "@pcobooster/contracts/rpc/procedure";
import {
  isoDateTime,
  mutableArray,
  requiredId,
} from "@pcobooster/contracts/rpc/schema";
import { Schema } from "effect";

const optionalIds = Schema.optional(mutableArray(requiredId));

export const planTimesListInputSchema = Schema.Struct({
  serviceTypeId: requiredId,
  planId: requiredId,
});

export const planTimesCreateInputSchema = Schema.Struct({
  ...planTimesListInputSchema.fields,
  name: Schema.optional(Schema.Trim),
  startsAt: isoDateTime,
  endsAt: Schema.optional(Schema.NullOr(isoDateTime)),
  timeType: planTimeTypeSchema,
  assignedTeamIds: optionalIds,
  assignedPositionIds: optionalIds,
});

export const planTimesUpdateInputSchema = Schema.Struct({
  ...planTimesListInputSchema.fields,
  planTimeId: requiredId,
  name: Schema.optional(Schema.Trim),
  startsAt: Schema.optional(isoDateTime),
  endsAt: Schema.optional(Schema.NullOr(isoDateTime)),
  timeType: Schema.optional(planTimeTypeSchema),
  assignedTeamIds: optionalIds,
  assignedPositionIds: optionalIds,
  assignedNeededPositionIds: optionalIds,
  clearedNeededPositionIds: optionalIds,
  assignedPlanPersonIds: optionalIds,
  clearedPlanPersonIds: optionalIds,
});

export const planTimesDeleteInputSchema = Schema.Struct({
  ...planTimesListInputSchema.fields,
  planTimeId: requiredId,
});

export const planTimesList = read("planTimes.list", {
  payload: planTimesListInputSchema,
  success: mutableArray(planTimeSchema),
});

export const planTimesCreate = write("planTimes.create", {
  payload: planTimesCreateInputSchema,
  success: planTimeSchema,
});

export const planTimesUpdate = write("planTimes.update", {
  payload: planTimesUpdateInputSchema,
  success: planTimeSchema,
});

/** Answers nothing (main: `z.void()`, HTTP 204). */
export const planTimesDelete = write("planTimes.delete", {
  payload: planTimesDeleteInputSchema,
  success: Schema.Void,
});

export const planTimesProcedures = [
  planTimesList,
  planTimesCreate,
  planTimesUpdate,
  planTimesDelete,
] as const;
export const planTimesRpc = planningCenterGroup(...planTimesProcedures);

import { RpcError } from "@pcobooster/contracts/errors";
import {
  planTimeSchema,
  planTimeTypeSchema,
} from "@pcobooster/contracts/plan-time-schemas";
import { isoInstantSchema } from "@pcobooster/contracts/schema";
import { Schema, Struct } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

const requiredId = Schema.Trim.check(Schema.isMinLength(1));

export const planTimesListInputSchema = Schema.Struct({
  serviceTypeId: requiredId,
  planId: requiredId,
}).mapFields(Struct.map(Schema.mutableKey));

export const planTimesCreateInputSchema = Schema.Struct({
  ...planTimesListInputSchema.fields,
  name: Schema.optional(Schema.Trim),
  startsAt: isoInstantSchema,
  endsAt: Schema.optional(Schema.NullOr(isoInstantSchema)),
  timeType: planTimeTypeSchema,
  assignedTeamIds: Schema.optional(Schema.mutable(Schema.Array(requiredId))),
  assignedPositionIds: Schema.optional(
    Schema.mutable(Schema.Array(requiredId))
  ),
}).mapFields(Struct.map(Schema.mutableKey));

export const planTimesUpdateInputSchema = Schema.Struct({
  ...planTimesListInputSchema.fields,
  planTimeId: requiredId,
  name: Schema.optional(Schema.Trim),
  startsAt: Schema.optional(isoInstantSchema),
  endsAt: Schema.optional(Schema.NullOr(isoInstantSchema)),
  timeType: Schema.optional(planTimeTypeSchema),
  assignedTeamIds: Schema.optional(Schema.mutable(Schema.Array(requiredId))),
  assignedPositionIds: Schema.optional(
    Schema.mutable(Schema.Array(requiredId))
  ),
  assignedNeededPositionIds: Schema.optional(
    Schema.mutable(Schema.Array(requiredId))
  ),
  clearedNeededPositionIds: Schema.optional(
    Schema.mutable(Schema.Array(requiredId))
  ),
  assignedPlanPersonIds: Schema.optional(
    Schema.mutable(Schema.Array(requiredId))
  ),
  clearedPlanPersonIds: Schema.optional(
    Schema.mutable(Schema.Array(requiredId))
  ),
}).mapFields(Struct.map(Schema.mutableKey));

export const planTimesDeleteInputSchema = Schema.Struct({
  ...planTimesListInputSchema.fields,
  planTimeId: requiredId,
}).mapFields(Struct.map(Schema.mutableKey));

export const planTimesListOutputSchema = Schema.mutable(
  Schema.Array(planTimeSchema)
);

export const planTimesDeleteOutputSchema = Schema.Undefined;

export const planTimesRpc = RpcGroup.make(
  Rpc.make("planTimes.list", {
    payload: planTimesListInputSchema,
    success: planTimesListOutputSchema,
    error: RpcError,
  }),
  Rpc.make("planTimes.create", {
    payload: planTimesCreateInputSchema,
    success: planTimeSchema,
    error: RpcError,
  }),
  Rpc.make("planTimes.update", {
    payload: planTimesUpdateInputSchema,
    success: planTimeSchema,
    error: RpcError,
  }),
  Rpc.make("planTimes.delete", {
    payload: planTimesDeleteInputSchema,
    success: planTimesDeleteOutputSchema,
    error: RpcError,
  })
);

export type PlanTimesListInput = typeof planTimesListInputSchema.Encoded;

export type PlanTimesCreateInput = typeof planTimesCreateInputSchema.Encoded;

export type PlanTimesUpdateInput = typeof planTimesUpdateInputSchema.Encoded;

export type PlanTimesDeleteInput = typeof planTimesDeleteInputSchema.Encoded;

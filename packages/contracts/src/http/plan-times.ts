/** The plan's service, rehearsal, and other times. */
import { read, write } from "@pcobooster/contracts/http/endpoint";
import { planningCenterGroup } from "@pcobooster/contracts/http/group";
import {
  planTimeSchema,
  planTimeTypeSchema,
} from "@pcobooster/contracts/http/plan-time-schemas";
import {
  mutableArray,
  isoDateTime,
  requiredId,
} from "@pcobooster/contracts/http/schema";
import { Schema, Struct } from "effect";

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

const TIMES = "/service-types/:serviceTypeId/plans/:planId/times";
const PLAN = ["serviceTypeId", "planId"] as const;
const TIME = ["serviceTypeId", "planId", "planTimeId"] as const;

export const planTimes = planningCenterGroup(
  "planTimes",
  read("list", TIMES, {
    params: planTimesListInputSchema.fields,
    success: mutableArray(planTimeSchema),
  }),
  write.post("create", TIMES, {
    params: Struct.pick(planTimesCreateInputSchema.fields, PLAN),
    payload: Struct.omit(planTimesCreateInputSchema.fields, PLAN),
    success: planTimeSchema,
  }),
  write.patch("update", `${TIMES}/:planTimeId`, {
    params: Struct.pick(planTimesUpdateInputSchema.fields, TIME),
    payload: Struct.omit(planTimesUpdateInputSchema.fields, TIME),
    success: planTimeSchema,
  }),
  write.delete("delete", `${TIMES}/:planTimeId`, {
    params: planTimesDeleteInputSchema.fields,
    success: Schema.Void,
  })
);

export type PlanTimesListInput = typeof planTimesListInputSchema.Type;
export type PlanTimesCreateInput = typeof planTimesCreateInputSchema.Type;
export type PlanTimesUpdateInput = typeof planTimesUpdateInputSchema.Type;
export type PlanTimesDeleteInput = typeof planTimesDeleteInputSchema.Type;

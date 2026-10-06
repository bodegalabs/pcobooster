/** The plan's service, rehearsal, and other times. */
import { read, write } from "@pcobooster/contracts/http/endpoint";
import { planningCenterGroup } from "@pcobooster/contracts/http/group";
import { planTimeSchema } from "@pcobooster/contracts/rpc/plan-time-schemas";
import {
  planTimesCreateInputSchema,
  planTimesDeleteInputSchema,
  planTimesListInputSchema,
  planTimesUpdateInputSchema,
} from "@pcobooster/contracts/rpc/plan-times";
import { mutableArray } from "@pcobooster/contracts/rpc/schema";
import { Schema, Struct } from "effect";

const TIMES = "/service-types/:serviceTypeId/plans/:planId/times";
const PLAN = ["serviceTypeId", "planId"] as const;
const TIME = ["serviceTypeId", "planId", "planTimeId"] as const;

export const planTimes = planningCenterGroup(
  "planTimes",
  read("planTimes.list", TIMES, {
    params: planTimesListInputSchema.fields,
    query: {},
    success: mutableArray(planTimeSchema),
  }),
  write.post("planTimes.create", TIMES, {
    params: Struct.pick(planTimesCreateInputSchema.fields, PLAN),
    payload: Struct.omit(planTimesCreateInputSchema.fields, PLAN),
    success: planTimeSchema,
  }),
  write.patch("planTimes.update", `${TIMES}/:planTimeId`, {
    params: Struct.pick(planTimesUpdateInputSchema.fields, TIME),
    payload: Struct.omit(planTimesUpdateInputSchema.fields, TIME),
    success: planTimeSchema,
  }),
  write.delete("planTimes.delete", `${TIMES}/:planTimeId`, {
    params: planTimesDeleteInputSchema.fields,
    query: {},
    success: Schema.Void,
  })
);

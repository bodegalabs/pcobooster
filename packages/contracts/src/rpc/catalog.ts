/** Catalog procedures over Effect RPC. Ported from the zod schemas in `../catalog.ts`. */
import { planningCenterGroup } from "@pcobooster/contracts/rpc/group";
import { read } from "@pcobooster/contracts/rpc/procedure";
import {
  finiteNumber,
  mutableArray,
  requiredId,
} from "@pcobooster/contracts/rpc/schema";
import { Schema } from "effect";

export const serviceTypeSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  sequence: finiteNumber,
});

export const planSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  seriesTitle: Schema.optional(Schema.String),
  seriesId: Schema.optional(Schema.NullOr(Schema.String)),
  planningCenterUrl: Schema.optional(Schema.NullOr(Schema.String)),
  createdAt: Schema.Date,
  sortDate: Schema.optional(Schema.Date),
});

export const planPersonNotificationSchema = Schema.Struct({
  prepared: Schema.Boolean,
  sentAt: Schema.NullOr(Schema.String),
  senderName: Schema.NullOr(Schema.String),
});

export const filledPositionPersonSchema = Schema.Struct({
  id: Schema.String,
  planPersonId: Schema.String,
  personId: Schema.optional(Schema.NullOr(Schema.String)),
  name: Schema.String,
  status: Schema.Literals(["pending", "confirmed"]),
  rawStatus: Schema.String,
  photoThumbnailUrl: Schema.optional(Schema.NullOr(Schema.String)),
  assignedTimeIds: Schema.optional(mutableArray(Schema.String)),
  serviceTimeIds: Schema.optional(mutableArray(Schema.String)),
  notification: Schema.NullOr(planPersonNotificationSchema),
});

export const teamPositionSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  teamId: Schema.String,
  teamName: Schema.optional(Schema.String),
  source: Schema.optional(
    Schema.Literals([
      "team_position",
      "needed_position",
      "plan_member",
      "custom",
    ])
  ),
  neededPositionId: Schema.optional(Schema.String),
  timeId: Schema.optional(Schema.NullOr(Schema.String)),
  timePreferenceOptionId: Schema.optional(Schema.NullOr(Schema.String)),
  neededCount: Schema.optional(finiteNumber),
  filledPendingCount: Schema.optional(finiteNumber),
  filledConfirmedCount: Schema.optional(finiteNumber),
  filledPeople: Schema.optional(mutableArray(filledPositionPersonSchema)),
});

export const teamPositionGroupSchema = Schema.Struct({
  teamId: Schema.String,
  teamName: Schema.String,
  positions: mutableArray(teamPositionSchema),
});

export const plansInputSchema = Schema.Struct({ serviceTypeId: requiredId });

export const planInputSchema = Schema.Struct({
  ...plansInputSchema.fields,
  planId: requiredId,
});

export const adjacentPlansInputSchema = Schema.Struct({
  ...planInputSchema.fields,
  direction: Schema.Literals(["previous", "next"]),
});

export const teamPositionsInputSchema = Schema.Struct({
  ...plansInputSchema.fields,
  planId: requiredId,
  seriesId: Schema.optional(requiredId),
});

export const catalogServiceTypes = read("catalog.serviceTypes", {
  payload: Schema.Struct({}),
  success: mutableArray(serviceTypeSchema),
});

export const catalogPlans = read("catalog.plans", {
  payload: plansInputSchema,
  success: mutableArray(planSchema),
});

export const catalogPlan = read("catalog.plan", {
  payload: planInputSchema,
  /** Null when the plan doesn't exist. */
  success: Schema.NullOr(planSchema),
});

export const catalogAdjacentPlans = read("catalog.adjacentPlans", {
  payload: adjacentPlansInputSchema,
  /** Nearest first; empty when the plan doesn't exist or nothing is on that side. */
  success: mutableArray(planSchema),
});

export const catalogOrganization = read("catalog.organization", {
  payload: Schema.Struct({}),
  success: Schema.Struct({ timeZone: Schema.String }),
});

export const catalogTeamPositions = read("catalog.teamPositions", {
  payload: teamPositionsInputSchema,
  success: mutableArray(teamPositionGroupSchema),
});

export const catalogProcedures = [
  catalogServiceTypes,
  catalogPlans,
  catalogPlan,
  catalogAdjacentPlans,
  catalogOrganization,
  catalogTeamPositions,
] as const;
export const catalogRpc = planningCenterGroup(...catalogProcedures);

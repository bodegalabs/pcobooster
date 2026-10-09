/** Service types, plans, and the organization, read from Planning Center. */
import { read } from "@pcobooster/contracts/http/endpoint";
import { planningCenterGroup } from "@pcobooster/contracts/http/group";
import {
  mutableArray,
  finiteNumber,
  requiredId,
} from "@pcobooster/contracts/http/schema";
import { Schema, Struct } from "effect";

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

const PLAN = ["serviceTypeId", "planId"] as const;

export const catalog = planningCenterGroup(
  "catalog",
  read("serviceTypes", "/service-types", {
    success: mutableArray(serviceTypeSchema),
  }),
  read("organization", "/organization", {
    success: Schema.Struct({ timeZone: Schema.String }),
  }),
  read("plans", "/service-types/:serviceTypeId/plans", {
    params: plansInputSchema.fields,
    success: mutableArray(planSchema),
  }),
  /** Null when the plan doesn't exist. */
  read("plan", "/service-types/:serviceTypeId/plans/:planId", {
    params: planInputSchema.fields,
    success: Schema.NullOr(planSchema),
  }),
  /** Nearest first; empty when the plan doesn't exist or nothing is on that side. */
  read(
    "adjacentPlans",
    "/service-types/:serviceTypeId/plans/:planId/adjacent",
    {
      params: Struct.pick(adjacentPlansInputSchema.fields, PLAN),
      query: Struct.omit(adjacentPlansInputSchema.fields, PLAN),
      success: mutableArray(planSchema),
    }
  ),
  read(
    "teamPositions",
    "/service-types/:serviceTypeId/plans/:planId/team-positions",
    {
      params: Struct.pick(teamPositionsInputSchema.fields, PLAN),
      query: Struct.omit(teamPositionsInputSchema.fields, PLAN),
      success: mutableArray(teamPositionGroupSchema),
    }
  )
);

export type ServiceType = typeof serviceTypeSchema.Type;
export type Plan = typeof planSchema.Type;
export type FilledPositionPerson = typeof filledPositionPersonSchema.Type;
export type PlanPersonNotification = typeof planPersonNotificationSchema.Type;
export type TeamPosition = typeof teamPositionSchema.Type;
export type TeamPositionGroup = typeof teamPositionGroupSchema.Type;
export type PlansInput = typeof plansInputSchema.Type;
export type PlanInput = typeof planInputSchema.Type;
export type AdjacentPlansInput = typeof adjacentPlansInputSchema.Type;
export type TeamPositionsInput = typeof teamPositionsInputSchema.Type;

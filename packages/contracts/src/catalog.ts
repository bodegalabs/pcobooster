import { RpcError } from "@pcobooster/contracts/errors";
import { Schema, Struct } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

export const serviceTypeSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  sequence: Schema.Finite,
}).mapFields(Struct.map(Schema.mutableKey));

export const planSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  seriesTitle: Schema.optional(Schema.String),
  seriesId: Schema.optional(Schema.NullOr(Schema.String)),
  planningCenterUrl: Schema.optional(Schema.NullOr(Schema.String)),
  createdAt: Schema.Date,
  sortDate: Schema.optional(Schema.Date),
}).mapFields(Struct.map(Schema.mutableKey));

export const planPersonNotificationSchema = Schema.Struct({
  prepared: Schema.Boolean,
  sentAt: Schema.NullOr(Schema.String),
  senderName: Schema.NullOr(Schema.String),
}).mapFields(Struct.map(Schema.mutableKey));

export const filledPositionPersonSchema = Schema.Struct({
  id: Schema.String,
  planPersonId: Schema.String,
  personId: Schema.optional(Schema.NullOr(Schema.String)),
  name: Schema.String,
  status: Schema.Literals(["pending", "confirmed"]),
  rawStatus: Schema.String,
  photoThumbnailUrl: Schema.optional(Schema.NullOr(Schema.String)),
  assignedTimeIds: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  serviceTimeIds: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  notification: Schema.NullOr(planPersonNotificationSchema),
}).mapFields(Struct.map(Schema.mutableKey));

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
  neededCount: Schema.optional(Schema.Finite),
  filledPendingCount: Schema.optional(Schema.Finite),
  filledConfirmedCount: Schema.optional(Schema.Finite),
  filledPeople: Schema.optional(
    Schema.mutable(Schema.Array(filledPositionPersonSchema))
  ),
}).mapFields(Struct.map(Schema.mutableKey));

export const teamPositionGroupSchema = Schema.Struct({
  teamId: Schema.String,
  teamName: Schema.String,
  positions: Schema.mutable(Schema.Array(teamPositionSchema)),
}).mapFields(Struct.map(Schema.mutableKey));

export const serviceTypesInputSchema = Schema.Struct({}).mapFields(
  Struct.map(Schema.mutableKey)
);

export const plansInputSchema = Schema.Struct({
  serviceTypeId: Schema.Trim.check(Schema.isMinLength(1)),
}).mapFields(Struct.map(Schema.mutableKey));

export const planInputSchema = Schema.Struct({
  ...plansInputSchema.fields,
  planId: Schema.Trim.check(Schema.isMinLength(1)),
}).mapFields(Struct.map(Schema.mutableKey));

export const adjacentPlansInputSchema = Schema.Struct({
  ...planInputSchema.fields,
  direction: Schema.Literals(["previous", "next"]),
}).mapFields(Struct.map(Schema.mutableKey));

export const organizationInputSchema = Schema.Struct({}).mapFields(
  Struct.map(Schema.mutableKey)
);

export const teamPositionsInputSchema = Schema.Struct({
  ...plansInputSchema.fields,
  planId: Schema.Trim.check(Schema.isMinLength(1)),
  seriesId: Schema.optional(Schema.Trim.check(Schema.isMinLength(1))),
}).mapFields(Struct.map(Schema.mutableKey));

export const serviceTypesOutputSchema = Schema.mutable(
  Schema.Array(serviceTypeSchema)
);

export const plansOutputSchema = Schema.mutable(Schema.Array(planSchema));

/** Null when the plan doesn't exist. */
export const planOutputSchema = Schema.NullOr(planSchema);

/** Nearest first; empty when the plan doesn't exist or nothing is on that side. */
export const adjacentPlansOutputSchema = Schema.mutable(
  Schema.Array(planSchema)
);

export const organizationOutputSchema = Schema.Struct({
  timeZone: Schema.String,
}).mapFields(Struct.map(Schema.mutableKey));

export const teamPositionsOutputSchema = Schema.mutable(
  Schema.Array(teamPositionGroupSchema)
);

export const catalogRpc = RpcGroup.make(
  Rpc.make("catalog.serviceTypes", {
    payload: serviceTypesInputSchema,
    success: serviceTypesOutputSchema,
    error: RpcError,
  }),
  Rpc.make("catalog.plans", {
    payload: plansInputSchema,
    success: plansOutputSchema,
    error: RpcError,
  }),
  Rpc.make("catalog.plan", {
    payload: planInputSchema,
    success: planOutputSchema,
    error: RpcError,
  }),
  Rpc.make("catalog.adjacentPlans", {
    payload: adjacentPlansInputSchema,
    success: adjacentPlansOutputSchema,
    error: RpcError,
  }),
  Rpc.make("catalog.organization", {
    payload: organizationInputSchema,
    success: organizationOutputSchema,
    error: RpcError,
  }),
  Rpc.make("catalog.teamPositions", {
    payload: teamPositionsInputSchema,
    success: teamPositionsOutputSchema,
    error: RpcError,
  })
);

export type ServiceType = typeof serviceTypeSchema.Type;

export type Plan = typeof planSchema.Type;

export type FilledPositionPerson = typeof filledPositionPersonSchema.Type;

export type PlanPersonNotification = typeof planPersonNotificationSchema.Type;

export type TeamPosition = typeof teamPositionSchema.Type;

export type TeamPositionGroup = typeof teamPositionGroupSchema.Type;

export type PlansInput = typeof plansInputSchema.Encoded;

export type PlanInput = typeof planInputSchema.Encoded;

export type AdjacentPlansInput = typeof adjacentPlansInputSchema.Encoded;

export type TeamPositionsInput = typeof teamPositionsInputSchema.Encoded;

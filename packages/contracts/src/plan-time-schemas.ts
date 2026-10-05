import { jsonValueSchema } from "@pcobooster/planning-center-models/json";
import { Schema, Struct } from "effect";

export const planTimeTypeSchema = Schema.Literals([
  "service",
  "rehearsal",
  "other",
]);

export const planTimeSchema = Schema.Struct({
  startsAt: Schema.Date,
  endsAt: Schema.NullOr(Schema.Date),
  id: Schema.String,
  name: Schema.String,
  timeType: planTimeTypeSchema,
  teamReminders: jsonValueSchema,
  assignedTeamIds: Schema.mutable(Schema.Array(Schema.String)),
  assignedPositionIds: Schema.mutable(Schema.Array(Schema.String)),
  splitTeamRehearsalAssignmentIds: Schema.mutable(Schema.Array(Schema.String)),
}).mapFields(Struct.map(Schema.mutableKey));

export type PlanTimeType = typeof planTimeTypeSchema.Type;

export type PlanTime = typeof planTimeSchema.Type;

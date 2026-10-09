/** Plan time answers. */
import { mutableArray } from "@pcobooster/contracts/http/schema";
import { Schema } from "effect";

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
  /** Any JSON value, as Planning Center stores it. */
  teamReminders: Schema.MutableJson,
  assignedTeamIds: mutableArray(Schema.String),
  assignedPositionIds: mutableArray(Schema.String),
  splitTeamRehearsalAssignmentIds: mutableArray(Schema.String),
});

export type PlanTimeType = typeof planTimeTypeSchema.Type;
export type PlanTime = typeof planTimeSchema.Type;

/** Plan time answers. Ported from the zod schemas in `../plan-time-schemas.ts`. */
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
  /** `z.json()`: any JSON value, mutable as zod infers it. */
  teamReminders: Schema.MutableJson,
  assignedTeamIds: mutableArray(Schema.String),
  assignedPositionIds: mutableArray(Schema.String),
  splitTeamRehearsalAssignmentIds: mutableArray(Schema.String),
});

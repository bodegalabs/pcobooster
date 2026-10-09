import {
  multiRelationshipSchema,
  nullableText,
  optionalText,
  orFallback,
  singleRelationshipSchema,
  textOr,
} from "@pcobooster/api/planning-center/attribute-schemas";
import { Schema, SchemaGetter } from "effect";

export const rosterPersonSchema = Schema.Struct({
  type: Schema.Literal("Person"),
  id: Schema.String,
  attributes: Schema.Struct({
    first_name: textOr(""),
    last_name: textOr(""),
    photo_url: nullableText,
    photo_thumbnail_url: nullableText,
    archived_at: nullableText,
  }),
});

const WEEKS_IN_MONTH = 5;

// A preference Planning Center left out or sent malformed reads as "no preference", never as
// a failed parse that would drop the candidate's other preferences.
const preferenceCountSchema = orFallback(
  Schema.NullOr(Schema.Int.check(Schema.isGreaterThan(0))),
  null
);

const preferenceTextSchema = orFallback(Schema.NullOr(Schema.String), null);

/** A week of the month, 1 to 5; Planning Center sends them as strings. */
const preferredWeekSchema = Schema.Union([
  Schema.Finite,
  Schema.FiniteFromString,
]).check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: WEEKS_IN_MONTH })
);

/** The weeks that read as weeks of the month; any other entry is dropped. */
const preferredWeeksSchema = orFallback(
  Schema.Array(orFallback(Schema.NullOr(preferredWeekSchema), null)).pipe(
    Schema.decodeTo(Schema.mutable(Schema.Array(Schema.Number)), {
      decode: SchemaGetter.transform((weeks: readonly (number | null)[]) =>
        weeks.filter((week) => week !== null)
      ),
      encode: SchemaGetter.transform((weeks: number[]) => weeks),
    })
  ),
  []
);

/**
 * A person's assignment to a team position, with their scheduling preferences for it.
 * Planning Center sends `preferred_weeks` as strings ("1" to "5").
 */
export const personTeamPositionAssignmentSchema = Schema.Struct({
  type: Schema.Literal("PersonTeamPositionAssignment"),
  id: Schema.String,
  attributes: Schema.Struct({
    schedule_preference: preferenceTextSchema,
    preferred_weeks: preferredWeeksSchema,
  }),
  relationships: Schema.Struct({
    person: singleRelationshipSchema,
    time_preference_options: orFallback(
      Schema.NullOr(multiRelationshipSchema),
      null
    ),
  }),
});

/** The Services person's own limits; `scheduler_or_current` permission, so often null. */
export const personPlanLimitsSchema = Schema.Struct({
  type: Schema.Literal("Person"),
  id: Schema.String,
  attributes: Schema.Struct({
    preferred_max_plans_per_day: preferenceCountSchema,
    preferred_max_plans_per_month: preferenceCountSchema,
  }),
});

export const scheduleResourceSchema = Schema.Struct({
  type: Schema.Literal("Schedule"),
  id: Schema.String,
  attributes: Schema.Struct({
    status: textOr(""),
    sort_date: optionalText,
    team_name: optionalText,
    team_position_name: optionalText,
    service_type_name: optionalText,
    decline_reason: optionalText,
  }),
  relationships: Schema.optional(
    Schema.Struct({
      plan: Schema.optional(singleRelationshipSchema),
      team: Schema.optional(singleRelationshipSchema),
      service_type: Schema.optional(singleRelationshipSchema),
      plan_person: Schema.optional(singleRelationshipSchema),
      plan_times: Schema.optional(multiRelationshipSchema),
      times: Schema.optional(multiRelationshipSchema),
    })
  ),
});

export const planPersonResourceSchema = Schema.Struct({
  type: Schema.Literal("PlanPerson"),
  id: Schema.String,
  attributes: Schema.Struct({
    status: textOr(""),
    created_at: textOr(""),
    team_position_name: textOr(""),
    decline_reason: optionalText,
  }),
  relationships: Schema.optional(
    Schema.Struct({
      plan: Schema.optional(singleRelationshipSchema),
      team: Schema.optional(singleRelationshipSchema),
      person: Schema.optional(singleRelationshipSchema),
      times: Schema.optional(multiRelationshipSchema),
      service_times: Schema.optional(multiRelationshipSchema),
    })
  ),
});

export const planTimeResourceSchema = Schema.Struct({
  type: Schema.Literal("PlanTime"),
  id: Schema.String,
  attributes: Schema.Struct({
    name: optionalText,
    starts_at: optionalText,
    ends_at: optionalText,
    time_type: optionalText,
  }),
});

export const decodeRosterPerson =
  Schema.decodeUnknownOption(rosterPersonSchema);
export const decodePersonTeamPositionAssignment = Schema.decodeUnknownOption(
  personTeamPositionAssignmentSchema
);
export const decodePersonPlanLimits = Schema.decodeUnknownOption(
  personPlanLimitsSchema
);
export const decodeScheduleResource = Schema.decodeUnknownOption(
  scheduleResourceSchema
);
export const decodePlanPersonResource = Schema.decodeUnknownOption(
  planPersonResourceSchema
);
export const decodePlanTimeResource = Schema.decodeUnknownOption(
  planTimeResourceSchema
);

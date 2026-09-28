import { z } from "zod";

const resourceIdentifierSchema = z.object({
  type: z.string(),
  id: z.string(),
});

const optionalStringSchema = z
  .string()
  .nullish()
  .transform((value): string | undefined => value ?? undefined);

const stringWithDefault = (fallback: string) =>
  z
    .string()
    .nullish()
    .transform((value) => value ?? fallback);

const singleRelationshipSchema = z.object({
  data: resourceIdentifierSchema.nullish(),
  links: z.object({ related: optionalStringSchema }).optional(),
});

const multiRelationshipSchema = z.object({
  data: z.array(resourceIdentifierSchema).nullish(),
  links: z.object({ related: optionalStringSchema }).optional(),
});

export const rosterPersonSchema = z.object({
  type: z.literal("Person"),
  id: z.string(),
  attributes: z.object({
    first_name: stringWithDefault(""),
    last_name: stringWithDefault(""),
    photo_url: z.string().nullable().default(null),
    photo_thumbnail_url: z.string().nullable().default(null),
    archived_at: z.string().nullable().default(null),
  }),
});

const WEEKS_IN_MONTH = 5;

// A preference Planning Center left out or sent malformed reads as "no preference", never as
// a failed parse that would drop the candidate's other preferences.
const positiveCountSchema = z.number().int().positive();
const preferenceCountSchema = z
  .unknown()
  .optional()
  .transform((value) => positiveCountSchema.safeParse(value).data ?? null);

const preferenceTextSchema = z
  .unknown()
  .optional()
  .transform((value) => z.string().safeParse(value).data ?? null);

const preferredWeeksSchema = z
  .unknown()
  .optional()
  .transform((weeks) =>
    (Array.isArray(weeks) ? weeks : []).flatMap((week) => {
      const value = Number(week);
      return Number.isInteger(value) && value >= 1 && value <= WEEKS_IN_MONTH
        ? [value]
        : [];
    })
  );

const relatedIdsSchema = z
  .unknown()
  .optional()
  .transform(
    (relationship) =>
      multiRelationshipSchema
        .safeParse(relationship)
        .data?.data?.map(({ id }) => id) ?? []
  );

/**
 * A person's assignment to a team position, with their scheduling preferences for it.
 * Planning Center sends `preferred_weeks` as strings ("1" to "5").
 */
export const personTeamPositionAssignmentSchema = z.object({
  type: z.literal("PersonTeamPositionAssignment"),
  id: z.string(),
  attributes: z.object({
    schedule_preference: preferenceTextSchema,
    preferred_weeks: preferredWeeksSchema,
  }),
  relationships: z.object({
    person: singleRelationshipSchema,
    time_preference_options: relatedIdsSchema,
  }),
});

/** The Services person's own limits; `scheduler_or_current` permission, so often null. */
export const personPlanLimitsSchema = z.object({
  type: z.literal("Person"),
  id: z.string(),
  attributes: z.object({
    preferred_max_plans_per_day: preferenceCountSchema,
    preferred_max_plans_per_month: preferenceCountSchema,
  }),
});

export const scheduleResourceSchema = z.object({
  type: z.literal("Schedule"),
  id: z.string(),
  attributes: z.object({
    status: stringWithDefault(""),
    sort_date: optionalStringSchema,
    team_name: optionalStringSchema,
    team_position_name: optionalStringSchema,
    service_type_name: optionalStringSchema,
    decline_reason: optionalStringSchema,
  }),
  relationships: z
    .object({
      plan: singleRelationshipSchema.optional(),
      team: singleRelationshipSchema.optional(),
      service_type: singleRelationshipSchema.optional(),
      plan_person: singleRelationshipSchema.optional(),
      plan_times: multiRelationshipSchema.optional(),
      times: multiRelationshipSchema.optional(),
    })
    .optional(),
});

export const planPersonResourceSchema = z.object({
  type: z.literal("PlanPerson"),
  id: z.string(),
  attributes: z.object({
    status: stringWithDefault(""),
    created_at: stringWithDefault(""),
    team_position_name: stringWithDefault(""),
    decline_reason: optionalStringSchema,
  }),
  relationships: z
    .object({
      plan: singleRelationshipSchema.optional(),
      team: singleRelationshipSchema.optional(),
      person: singleRelationshipSchema.optional(),
      times: multiRelationshipSchema.optional(),
      service_times: multiRelationshipSchema.optional(),
    })
    .optional(),
});

export const planTimeResourceSchema = z.object({
  type: z.literal("PlanTime"),
  id: z.string(),
  attributes: z.object({
    name: optionalStringSchema,
    starts_at: optionalStringSchema,
    ends_at: optionalStringSchema,
    time_type: optionalStringSchema,
  }),
});

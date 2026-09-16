import { z } from "zod";

const resourceIdentifierSchema = z.object({
  type: z.string(),
  id: z.string(),
});

const singleRelationshipSchema = z.object({
  data: resourceIdentifierSchema.nullable(),
});

const multiRelationshipSchema = z.object({
  data: z.array(resourceIdentifierSchema),
  links: z.object({ related: z.string().optional() }).optional(),
});

export const rosterPersonSchema = z.object({
  type: z.literal("Person"),
  id: z.string(),
  attributes: z.object({
    first_name: z.string().default(""),
    last_name: z.string().default(""),
    photo_url: z.string().nullable().default(null),
    photo_thumbnail_url: z.string().nullable().default(null),
    archived_at: z.string().nullable().default(null),
  }),
});

export const scheduleResourceSchema = z.object({
  type: z.literal("Schedule"),
  id: z.string(),
  attributes: z.object({
    status: z.string().default(""),
    sort_date: z.string().optional(),
    team_name: z.string().optional(),
    team_position_name: z.string().optional(),
    service_type_name: z.string().optional(),
    decline_reason: z.string().optional(),
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
    status: z.string().default(""),
    created_at: z.string().default(""),
    team_position_name: z.string().default(""),
    decline_reason: z.string().optional(),
  }),
  relationships: z
    .object({
      plan: z.object({ data: resourceIdentifierSchema }).optional(),
      team: z.object({ data: resourceIdentifierSchema }).optional(),
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
    name: z.string().optional(),
    starts_at: z.string().optional(),
    ends_at: z.string().optional(),
    time_type: z.string().optional(),
  }),
});

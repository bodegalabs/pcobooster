import { z } from "zod";

import type {
  PCApiResponse,
  PCRelationship,
  PCResource,
  PCResourceIdentifier,
} from "@/lib/types";

const optionalLinkSchema = z
  .string()
  .nullish()
  .transform((link) => link ?? undefined);

export const pcResourceIdentifierSchema = z.object({
  type: z.string(),
  id: z.string(),
}) satisfies z.ZodType<PCResourceIdentifier>;

export const pcRelationshipSchema = z.object({
  data: z
    .union([pcResourceIdentifierSchema, z.array(pcResourceIdentifierSchema)])
    .nullish(),
  links: z.object({ related: optionalLinkSchema }).optional(),
}) satisfies z.ZodType<PCRelationship>;

// Preserve API attributes so each use-case can validate the fields it consumes.
export const pcResourceSchema = z.object({
  type: z.string(),
  id: z.string(),
  attributes: z.record(z.string(), z.json()).default({}),
  relationships: z.record(z.string(), pcRelationshipSchema).optional(),
}) satisfies z.ZodType<PCResource>;

const responseMetadata = {
  included: z.array(pcResourceSchema).optional(),
  meta: z
    .object({
      total_count: z.number().optional(),
      count: z.number().optional(),
      next: z.object({ offset: z.number() }).optional(),
      prev: z.object({ offset: z.number() }).optional(),
    })
    .optional(),
  links: z
    .object({
      self: optionalLinkSchema,
      next: optionalLinkSchema,
      prev: optionalLinkSchema,
    })
    .optional(),
};

export const pcResourceResponseSchema = z.object({
  data: pcResourceSchema,
  ...responseMetadata,
}) satisfies z.ZodType<PCApiResponse<PCResource>>;

export const pcCollectionResponseSchema = z.object({
  data: z
    .union([pcResourceSchema, z.array(pcResourceSchema)])
    .transform((data) => (Array.isArray(data) ? data : [data])),
  ...responseMetadata,
}) satisfies z.ZodType<PCApiResponse<PCResource[]>>;

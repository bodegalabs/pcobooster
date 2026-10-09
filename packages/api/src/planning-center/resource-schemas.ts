import { optionalText } from "@pcobooster/api/planning-center/attribute-schemas";
import type { JsonObject } from "@pcobooster/planning-center-models/json";
import type {
  PCApiResponse,
  PCRelationship,
  PCResource,
  PCResourceIdentifier,
} from "@pcobooster/planning-center-models/types";
import { Effect, Schema, SchemaGetter } from "effect";

/** A JSON:API link; `null` and a missing link both read as absent. */
const optionalLinkSchema = optionalText;

export const pcResourceIdentifierSchema = Schema.Struct({
  type: Schema.String,
  id: Schema.String,
}) satisfies Schema.Codec<PCResourceIdentifier, unknown>;

export const pcRelationshipSchema = Schema.Struct({
  data: Schema.optional(
    Schema.NullOr(
      Schema.Union([
        pcResourceIdentifierSchema,
        Schema.mutable(Schema.Array(pcResourceIdentifierSchema)),
      ])
    )
  ),
  links: Schema.optional(Schema.Struct({ related: optionalLinkSchema })),
}) satisfies Schema.Codec<PCRelationship, unknown>;

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Resources are only decoded from `JSON.parse` output, whose values are JSON by construction, so
 * attributes are checked to be an object and never walked: validating every attribute again cost
 * several ms of Worker CPU per page. Each module validates the fields it consumes.
 */
const attributesSchema = Schema.declare(isJsonObject).pipe(
  Schema.withDecodingDefault(Effect.succeed({}))
);

export const pcResourceSchema = Schema.Struct({
  type: Schema.String,
  id: Schema.String,
  attributes: attributesSchema,
  relationships: Schema.optional(
    Schema.Record(Schema.String, pcRelationshipSchema)
  ),
}) satisfies Schema.Codec<PCResource, unknown>;

export const pcResourcesSchema = Schema.mutable(Schema.Array(pcResourceSchema));

const responseMetadata = {
  included: Schema.optional(pcResourcesSchema),
  meta: Schema.optional(
    Schema.Struct({
      total_count: Schema.optional(Schema.Finite),
      count: Schema.optional(Schema.Finite),
      next: Schema.optional(Schema.Struct({ offset: Schema.Finite })),
      prev: Schema.optional(Schema.Struct({ offset: Schema.Finite })),
    })
  ),
  links: Schema.optional(
    Schema.Struct({
      self: optionalLinkSchema,
      next: optionalLinkSchema,
      prev: optionalLinkSchema,
    })
  ),
};

export const pcResourceResponseSchema = Schema.Struct({
  data: pcResourceSchema,
  ...responseMetadata,
}) satisfies Schema.Codec<PCApiResponse<PCResource>, unknown>;

/** A collection's `data`; a single resource where a list was expected reads as a list of one. */
const collectionDataSchema = Schema.Union([
  // Lists first: nearly every collection answer is one, so the union rarely tries twice.
  pcResourcesSchema,
  pcResourceSchema,
]).pipe(
  Schema.decodeTo(
    Schema.mutable(Schema.Array(Schema.toType(pcResourceSchema))),
    {
      decode: SchemaGetter.transform(
        (data: PCResource | PCResource[]): PCResource[] =>
          Array.isArray(data) ? data : [data]
      ),
      encode: SchemaGetter.transform((data: PCResource[]) => data),
    }
  )
);

export const pcCollectionResponseSchema = Schema.Struct({
  data: collectionDataSchema,
  ...responseMetadata,
}) satisfies Schema.Codec<PCApiResponse<PCResource[]>, unknown>;

/**
 * Schema building blocks for the Planning Center attributes and relationships a module reads.
 * Planning Center leaves fields out, sends `null`, and documents few values, so each block says
 * what a missing or unexpected value reads as instead of failing the whole resource.
 */
import { Effect, Schema, SchemaGetter } from "effect";

/** Text Planning Center may leave out or send as `null`; both read as `undefined`. */
export const optionalText = Schema.optional(
  Schema.NullOr(Schema.String).pipe(
    Schema.decodeTo(Schema.UndefinedOr(Schema.String), {
      decode: SchemaGetter.transform(
        (text: string | null) => text ?? undefined
      ),
      encode: SchemaGetter.transform(
        (text: string | undefined) => text ?? null
      ),
    })
  )
);

/** Text Planning Center may leave out or send as `null`; both read as `fallback`. */
export const textOr = (fallback: string) =>
  Schema.NullOr(Schema.String).pipe(
    Schema.decodeTo(Schema.String, {
      decode: SchemaGetter.transform((text: string | null) => text ?? fallback),
      encode: SchemaGetter.transform((text: string): string | null => text),
    }),
    Schema.withDecodingDefault(Effect.succeed(null))
  );

/** Text or `null`; a missing field reads as `null`. */
export const nullableText = Schema.NullOr(Schema.String).pipe(
  Schema.withDecodingDefault(Effect.succeed(null))
);

/**
 * `schema`'s value; a field Planning Center leaves out or sends malformed reads as `fallback`
 * rather than failing the resource.
 */
export const orFallback = <Value, Encoded>(
  schema: Schema.Codec<Value, Encoded>,
  fallback: Value & Encoded
) =>
  schema.pipe(
    Schema.catchDecoding(() => Effect.succeedSome(fallback)),
    Schema.withDecodingDefault(Effect.succeed(fallback))
  );

export const resourceIdentifierSchema = Schema.Struct({
  type: Schema.String,
  id: Schema.String,
});

const relationshipLinks = Schema.optional(
  Schema.Struct({ related: optionalText })
);

/** A to-one relationship. */
export const singleRelationshipSchema = Schema.Struct({
  data: Schema.optional(Schema.NullOr(resourceIdentifierSchema)),
  links: relationshipLinks,
});

/** A to-many relationship. */
export const multiRelationshipSchema = Schema.Struct({
  data: Schema.optional(
    Schema.NullOr(Schema.mutable(Schema.Array(resourceIdentifierSchema)))
  ),
  links: relationshipLinks,
});

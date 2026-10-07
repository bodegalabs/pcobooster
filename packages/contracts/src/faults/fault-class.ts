import { Schema, SchemaGetter } from "effect";

/**
 * `Schema.TaggedError` under a name that does not end in "Error": the lint fixer otherwise
 * rewrites each `TaggedError<Self>()(...)` call into `new`, which breaks the class. A property
 * read, not a destructure: destructuring the `Schema` namespace makes bundlers keep all of it,
 * about 50 KB gzipped in the browser.
 */
export const faultClass = Schema.TaggedError;

/**
 * A field the server sets, logs, and reports, but never encodes: encoding drops the key and
 * decoding never produces it, so a client only ever sees `undefined`. `faults.test.ts` checks
 * no such field survives encoding.
 */
export const serverOnly = <Field extends Schema.Top>(field: Field) =>
  Schema.optionalKey(field).pipe(
    Schema.encodeTo(Schema.optionalKey(Schema.Never), {
      decode: SchemaGetter.omit(),
      encode: SchemaGetter.omit(),
    })
  );

/** The message of every 500: what failed is logged and reported, never sent. */
export const INTERNAL_SERVER_ERROR_MESSAGE = "Internal server error";

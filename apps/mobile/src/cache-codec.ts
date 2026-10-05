import { Schema, Struct } from "effect";

const arraySchema = Schema.Array(Schema.Unknown);
const recordSchema = Schema.Record(Schema.String, Schema.Unknown);
const dateEnvelopeSchema = Schema.Struct({ $pcoboosterDate: Schema.String });
/** Preserve actual Date objects without changing string-valued ISO contract fields. */
export const encodeCacheValue = (
  value: typeof Schema.Unknown.Type
): typeof Schema.Json.Type => {
  if (value instanceof Date) {
    return { $pcoboosterDate: value.toISOString() };
  }
  if (Schema.is(arraySchema)(value)) {
    return value.map(encodeCacheValue);
  }
  if (Schema.is(recordSchema)(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        encodeCacheValue(entry),
      ])
    );
  }
  return value === undefined
    ? null
    : Schema.decodeUnknownSync(Schema.Json)(value);
};
export const decodeCacheValue = (
  value: typeof Schema.Unknown.Type
): object | string | number | boolean | null => {
  if (Schema.is(arraySchema)(value)) {
    return value.map(decodeCacheValue);
  }
  if (Schema.is(dateEnvelopeSchema)(value) && Object.keys(value).length === 1) {
    const date = new Date(value.$pcoboosterDate);
    if (Number.isNaN(date.getTime())) {
      throw new TypeError("Invalid cached date");
    }
    return date;
  }
  if (Schema.is(recordSchema)(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        decodeCacheValue(entry),
      ])
    );
  }
  return Schema.decodeUnknownSync(
    Schema.Union([Schema.String, Schema.Number, Schema.Boolean, Schema.Null])
  )(value);
};
const mutable = Struct.map(Schema.mutableKey);
const cachedStateSchema = Schema.Struct({
  data: Schema.Unknown,
  dataUpdateCount: Schema.Number,
  dataUpdatedAt: Schema.Number,
  error: Schema.Null,
  errorUpdateCount: Schema.Number,
  errorUpdatedAt: Schema.Number,
  fetchFailureCount: Schema.Number,
  fetchFailureReason: Schema.Null,
  fetchMeta: Schema.Null,
  isInvalidated: Schema.Boolean,
  status: Schema.Literal("success"),
  fetchStatus: Schema.Literals(["fetching", "paused", "idle"]),
}).mapFields(mutable);
export const cachedQueriesSchema = Schema.Struct({
  queries: Schema.Array(
    Schema.Struct({
      queryHash: Schema.String,
      queryKey: Schema.mutable(Schema.Array(Schema.Unknown)),
      state: cachedStateSchema,
      dehydratedAt: Schema.Number,
    }).mapFields(mutable)
  ),
});

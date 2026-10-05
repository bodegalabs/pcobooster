import { Schema } from "effect";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | JsonObject;

/** Native recursive JSON validation preserves mutable provider payload arrays. */
export const jsonValueSchema: Schema.Codec<JsonValue> = Schema.suspend(() =>
  Schema.Union([
    Schema.String,
    Schema.Finite,
    Schema.Boolean,
    Schema.Null,
    Schema.mutable(Schema.Array(jsonValueSchema)),
    Schema.Record(Schema.String, Schema.mutableKey(jsonValueSchema)),
  ])
);
export interface JsonObject {
  [key: string]: JsonValue;
}

export const isString = (value: unknown): value is string =>
  typeof value === "string";

export const isNumber = (value: unknown): value is number =>
  typeof value === "number";

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

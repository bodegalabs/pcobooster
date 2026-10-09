import { Option, Schema } from "effect";

/**
 * Browser-saved JSON read and written through an Effect schema, usually the API answer's own
 * schema from `@pcobooster/contracts/http`. `Schema.toCodecJson` writes values JSON cannot carry
 * (Dates) in their canonical JSON form and reads them back as the same values. A saved value that
 * no longer decodes (malformed JSON, an older build's shape, edited storage) reads as missing, so
 * it is never shown.
 */
export interface StoredJson<Value> {
  /** The saved value, or `undefined` when nothing is saved or it does not decode. */
  readonly parse: (raw: string | null) => Value | undefined;
  /** The value as JSON text, or `undefined` when it does not encode (so nothing is saved). */
  readonly stringify: (value: Value) => string | undefined;
}

export const storedJson = <Value, Encoded>(
  schema: Schema.Codec<Value, Encoded>
): StoredJson<Value> => {
  const codec = Schema.fromJsonString(Schema.toCodecJson(schema));
  const decode = Schema.decodeUnknownOption(codec);
  const encode = Schema.encodeOption(codec);
  return {
    parse: (raw) =>
      raw === null ? undefined : Option.getOrUndefined(decode(raw)),
    stringify: (value) => Option.getOrUndefined(encode(value)),
  };
};

/** An API answer as a browser cache saves it: when it was saved, and the answer. */
export interface SavedAnswer<Data> {
  readonly savedAt: number;
  readonly data: Data;
}

/** Saved answers whose `data` is read and written through `data`'s schema. */
export const savedAnswer = <Data, Encoded>(
  data: Schema.Codec<Data, Encoded>
): StoredJson<SavedAnswer<Data>> =>
  storedJson(Schema.Struct({ savedAt: Schema.Finite, data }));

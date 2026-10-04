/**
 * Typed access to zod 4 schema definitions (`schema._zod.def`) for the Swift model generator.
 * Everything here reads schemas; nothing parses API data.
 */
import { z } from "zod";

export type ZodSchema = z.core.$ZodTypes;
export type ObjectFields = Readonly<Record<string, z.core.$ZodType>>;

/** Which side of a schema to read: what the API accepts, or what it returns. */
export type SchemaMode = "input" | "output";

type ZodTypeName = ZodSchema["_zod"]["def"]["type"];

/** A value `z.literal()` or `z.enum()` can hold. */
export type LiteralValue = z.core.util.Literal;

const ZOD_TYPE_NAMES: ReadonlySet<string> = new Set<ZodTypeName>([
  "any",
  "array",
  "bigint",
  "boolean",
  "catch",
  "custom",
  "date",
  "default",
  "enum",
  "file",
  "function",
  "intersection",
  "lazy",
  "literal",
  "map",
  "nan",
  "never",
  "nonoptional",
  "null",
  "nullable",
  "number",
  "object",
  "optional",
  "pipe",
  "prefault",
  "promise",
  "readonly",
  "record",
  "set",
  "string",
  "success",
  "symbol",
  "template_literal",
  "transform",
  "tuple",
  "undefined",
  "union",
  "unknown",
  "void",
]);
const INTEGER_FORMATS = new Set([
  "int32",
  "int64",
  "safeint",
  "uint32",
  "uint64",
]);
const JSON_VALUE_OPTION_TYPES = [
  "array",
  "boolean",
  "null",
  "number",
  "record",
  "string",
] as const;

const stringValue = z.string();
const numberValue = z.number();
const booleanValue = z.boolean();
const stringList = z.array(z.string()).min(1);

export const isStringValue = (value: unknown): value is string =>
  stringValue.safeParse(value).success;

export const isNumberValue = (value: unknown): value is number =>
  numberValue.safeParse(value).success;

export const isBooleanValue = (value: unknown): value is boolean =>
  booleanValue.safeParse(value).success;

/** A non-empty list of strings, such as an exported `as const` list of enum values. */
export const isStringList = (value: unknown): value is readonly string[] =>
  stringList.safeParse(value).success;

export const isZodType = (value: unknown): value is z.core.$ZodType =>
  value instanceof z.core.$ZodType;

const isKnownSchema = (schema: z.core.$ZodType): schema is ZodSchema =>
  ZOD_TYPE_NAMES.has(schema._zod.def.type);

export class UnsupportedSchemaError extends Error {
  constructor(where: string, detail: string) {
    super(`Cannot generate Swift for ${where}: ${detail}`);
    this.name = "UnsupportedSchemaError";
  }
}

/** Narrows a schema to the `$ZodTypes` union so `def.type` checks narrow `def`. */
export const asZodSchema = (schema: z.core.$ZodType): ZodSchema => {
  if (!isKnownSchema(schema)) {
    throw new UnsupportedSchemaError(
      "a schema",
      `zod type "${schema._zod.def.type}" is not one this generator knows`
    );
  }
  return schema;
};

/** A `.default()` value, boxed so a default of `undefined` stays distinguishable from none. */
export interface SchemaDefault {
  readonly value: unknown;
}

/** A schema with its optional, nullable, and default wrappers peeled off. */
export interface UnwrappedSchema {
  readonly base: ZodSchema;
  /** The key may be absent (`.optional()`). */
  readonly optional: boolean;
  /** The value may be `null` (`.nullable()`). */
  readonly nullable: boolean;
  /** Absent keys take this value (`.default()` or `.prefault()`). */
  readonly fallback: SchemaDefault | undefined;
}

interface UnwrapState {
  optional: boolean;
  nullable: boolean;
  fallback: SchemaDefault | undefined;
  required: boolean;
}

const isNullSchema = (schema: z.core.$ZodType): boolean =>
  schema._zod.def.type === "null";

/** The one non-null option of a `T | null` union, else undefined. */
const nullableUnionMember = (
  options: readonly z.core.$ZodType[]
): z.core.$ZodType | undefined => {
  const members = options.filter((option) => !isNullSchema(option));
  return members.length === 1 && members.length < options.length
    ? members[0]
    : undefined;
};

/** One unwrapping step, or undefined when `schema` is the base. */
const unwrapStep = (
  schema: ZodSchema,
  mode: SchemaMode,
  state: UnwrapState
): z.core.$ZodType | undefined => {
  const { def } = schema._zod;
  if (def.type === "optional") {
    state.optional = true;
    return def.innerType;
  }
  if (def.type === "nullable") {
    state.nullable = true;
    return def.innerType;
  }
  if (def.type === "default" || def.type === "prefault") {
    state.fallback ??= { value: def.defaultValue };
    return def.innerType;
  }
  if (def.type === "nonoptional") {
    state.required = true;
    return def.innerType;
  }
  if (def.type === "readonly" || def.type === "catch") {
    return def.innerType;
  }
  if (def.type === "pipe") {
    return mode === "input" ? def.in : def.out;
  }
  if (def.type === "union") {
    const member = nullableUnionMember(def.options);
    if (member !== undefined) {
      state.nullable = true;
    }
    return member;
  }
  return undefined;
};

/** Peels wrappers until the schema that decides the Swift type. */
export const unwrapSchema = (
  schema: z.core.$ZodType,
  mode: SchemaMode
): UnwrappedSchema => {
  const state: UnwrapState = {
    fallback: undefined,
    nullable: false,
    optional: false,
    required: false,
  };
  let current = asZodSchema(schema);
  for (;;) {
    const next = unwrapStep(current, mode, state);
    if (next === undefined) {
      break;
    }
    current = asZodSchema(next);
  }
  return {
    base: current,
    fallback: state.fallback,
    nullable: state.nullable,
    optional: state.optional && !state.required,
  };
};

/**
 * Whether zod itself lets the key be absent on this side, to cross-check `unwrapSchema`. On the
 * input side `optin` is `"optional"` or `"defaulted"` for an omittable key.
 */
export const zodKeyIsOptional = (
  schema: z.core.$ZodType,
  mode: SchemaMode
): boolean =>
  mode === "input"
    ? schema._zod.optin !== undefined
    : schema._zod.optout === "optional";

export const isIntegerSchema = (schema: ZodSchema): boolean => {
  const { def } = schema._zod;
  if (def.type !== "number") {
    return false;
  }
  if (
    "format" in def &&
    isStringValue(def.format) &&
    INTEGER_FORMATS.has(def.format)
  ) {
    return true;
  }
  return (def.checks ?? []).some((check) => {
    const checkDef = check._zod.def;
    return (
      "format" in checkDef &&
      isStringValue(checkDef.format) &&
      INTEGER_FORMATS.has(checkDef.format)
    );
  });
};

/** `z.json()`: a lazy union of every JSON shape, recursing through arrays and records. */
export const isJsonValueSchema = (schema: ZodSchema): boolean => {
  const { def } = schema._zod;
  if (def.type !== "lazy") {
    return false;
  }
  const innerDef = asZodSchema(def.getter())._zod.def;
  if (innerDef.type !== "union") {
    return false;
  }
  const optionTypes = innerDef.options
    .map((option) => option._zod.def.type)
    .toSorted();
  return (
    optionTypes.length === JSON_VALUE_OPTION_TYPES.length &&
    optionTypes.every((type, index) => type === JSON_VALUE_OPTION_TYPES[index])
  );
};

const literalStrings = (
  values: readonly LiteralValue[]
): string[] | undefined =>
  values.every((value) => isStringValue(value))
    ? values.filter((value) => isStringValue(value))
    : undefined;

/** The string values of an enum, a multi-value literal, or a union of string literals. */
export const stringEnumValues = (
  schema: ZodSchema
): readonly string[] | undefined => {
  const { def } = schema._zod;
  if (def.type === "enum") {
    return literalStrings(Object.values(def.entries));
  }
  if (def.type === "literal" && def.values.length > 1) {
    return literalStrings(def.values);
  }
  if (def.type !== "union" || "discriminator" in def) {
    return undefined;
  }
  const values: LiteralValue[] = [];
  for (const option of def.options) {
    const optionDef = asZodSchema(option)._zod.def;
    if (optionDef.type !== "literal") {
      return undefined;
    }
    values.push(...optionDef.values);
  }
  return literalStrings(values);
};

/** The fields of a `z.object`, else undefined. */
export const objectFields = (schema: ZodSchema): ObjectFields | undefined => {
  const { def } = schema._zod;
  return def.type === "object" ? def.shape : undefined;
};

export const discriminatorOf = (schema: ZodSchema): string | undefined => {
  const { def } = schema._zod;
  if (def.type !== "union" || !("discriminator" in def)) {
    return undefined;
  }
  return isStringValue(def.discriminator) ? def.discriminator : undefined;
};

/** The single literal value of a schema such as `z.literal("granted")`, else undefined. */
export const singleLiteral = (schema: ZodSchema): LiteralValue | undefined => {
  const { def } = schema._zod;
  return def.type === "literal" && def.values.length === 1
    ? def.values[0]
    : undefined;
};

/** The schemas directly inside a schema, for walking it. */
export const childSchemas = (schema: ZodSchema): readonly z.core.$ZodType[] => {
  const { def } = schema._zod;
  if (
    def.type === "optional" ||
    def.type === "nullable" ||
    def.type === "default" ||
    def.type === "prefault" ||
    def.type === "nonoptional" ||
    def.type === "readonly" ||
    def.type === "catch"
  ) {
    return [def.innerType];
  }
  if (def.type === "pipe") {
    return [def.in, def.out];
  }
  if (def.type === "array") {
    return [def.element];
  }
  if (def.type === "object") {
    return Object.values(def.shape);
  }
  if (def.type === "union") {
    return def.options;
  }
  if (def.type === "record") {
    return [def.keyType, def.valueType];
  }
  return [];
};

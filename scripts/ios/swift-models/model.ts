/**
 * Builds the language-neutral model of the generated Swift: named types (structs, string enums,
 * discriminated unions, aliases) and procedure descriptors, walking each procedure's zod
 * schemas. Names come from schema exports first, then from where an anonymous schema sits.
 */
import type { z } from "zod";

import type { ContractProcedure, SourceModule } from "./contracts";
import { procedureModule } from "./contracts";
import type { SchemaExport } from "./exports-index";
import { SchemaExportIndex, docPath } from "./exports-index";
import {
  camelCaseIdentifier,
  pascalCase,
  propertyNameForKey,
  singularize,
  swiftStringLiteral,
} from "./naming";
import type {
  LiteralValue,
  ObjectFields,
  SchemaDefault,
  SchemaMode,
  ZodSchema,
} from "./zod";
import {
  UnsupportedSchemaError,
  asZodSchema,
  childSchemas,
  discriminatorOf,
  isBooleanValue,
  isIntegerSchema,
  isJsonValueSchema,
  isNumberValue,
  isStringValue,
  objectFields,
  singleLiteral,
  stringEnumValues,
  unwrapSchema,
  zodKeyIsOptional,
} from "./zod";

/**
 * How a struct field travels: `required` and `defaulted` always encode; `optional` omits nil;
 * `nullable` encodes nil as `null`; `nullish` may do either (`Nullable` in input types).
 */
export type Presence =
  | "defaulted"
  | "nullable"
  | "nullish"
  | "optional"
  | "required";

export interface FieldModel {
  /** The JSON key. */
  readonly key: string;
  /** The Swift property name, unescaped. */
  readonly name: string;
  /** Whether `name` differs from `key`, needing a `CodingKeys` raw value. */
  readonly renamed: boolean;
  /** The Swift type of a present, non-null value. */
  readonly type: string;
  readonly presence: Presence;
  /** A Swift literal the memberwise init defaults to (`.default()` and literal fields). */
  readonly initDefault: string | undefined;
  /** The contract's doc comment on the property. */
  readonly doc: string | undefined;
}

export interface StructModel {
  readonly kind: "struct";
  readonly fields: readonly FieldModel[];
}

export interface EnumCase {
  readonly name: string;
  readonly value: string;
}

export interface EnumModel {
  readonly kind: "enum";
  readonly cases: readonly EnumCase[];
}

export interface UnionVariant {
  readonly name: string;
  readonly value: string;
  /** The payload struct, or undefined when the variant has only its discriminator. */
  readonly payload: string | undefined;
}

export interface UnionModel {
  readonly kind: "union";
  readonly discriminator: string;
  readonly variants: readonly UnionVariant[];
}

export interface AliasModel {
  readonly kind: "alias";
  readonly target: string;
}

export type TypeModel = AliasModel | EnumModel | StructModel | UnionModel;

/** Where a schema sits: `continuation` of the `people.planWindowHistory` input. */
interface Origin {
  /** The export or procedure the path starts from, formatted for a doc comment. */
  readonly root: string;
  /** The schema export the path starts from, for property docs. */
  readonly exportName: string | undefined;
  readonly path: string;
  /** The module the root is defined in. */
  readonly module: string;
}

export interface NamedType {
  readonly name: string;
  /**
   * What anonymous types inside this one are named after: `name`, minus the `Input` suffix
   * of a type split into input and output variants, so shared children read the same.
   */
  readonly childNameBase: string;
  /** The module whose Swift file holds this type. */
  readonly file: string;
  readonly doc: string;
  /** The sides of the API that use this type. Input types encode `.nullish()` as `Nullable`. */
  readonly modes: Set<SchemaMode>;
  readonly origin: Origin;
  /** For a discriminated union's payload struct: the discriminator key it leaves to the union. */
  omittedKey: string | undefined;
  model: TypeModel | undefined;
}

export interface ProcedureModel {
  /** Router keys, for example `["people", "positionCandidates"]`. */
  readonly keys: readonly string[];
  readonly module: string;
  readonly method: string | undefined;
  readonly httpPath: string | undefined;
  readonly summary: string | undefined;
  readonly inputType: string;
  /** False when the contract declares no `.input()`; the request body is then `{}`. */
  readonly hasInput: boolean;
  readonly outputType: string;
  /** The contract's doc comment on an exported output schema that names no Swift type. */
  readonly outputDoc: string | undefined;
  readonly errorCodes: readonly string[];
}

export interface ErrorCodeModel {
  readonly code: string;
  /** The Swift types of this code's `data` across procedures (one when they agree). */
  readonly dataTypes: readonly string[];
}

export interface ContractModel {
  readonly types: readonly NamedType[];
  readonly procedures: readonly ProcedureModel[];
  readonly errorCodes: readonly ErrorCodeModel[];
}

/** Names the generated code must never take: runtime types, Swift, and Foundation. */
export const RESERVED_TYPE_NAMES: ReadonlySet<string> = new Set([
  "Any",
  "Array",
  "Bool",
  "Calendar",
  "Character",
  "ContractCodingKey",
  "ContractErrorCode",
  "Data",
  "Date",
  "Decimal",
  "Dictionary",
  "Double",
  "EmptyInput",
  "EmptyOutput",
  "Error",
  "Float",
  "Int",
  "JSONCoding",
  "JSONValue",
  "Locale",
  "Never",
  "Nullable",
  "Optional",
  "Procedure",
  "RPC",
  "RPCRequest",
  "RPCResponse",
  "RPCTransport",
  "Result",
  "Set",
  "String",
  "TimeZone",
  "URL",
  "UUID",
  "Void",
]);

/** Case names a tolerant enum already uses for its own members. */
const RESERVED_CASE_NAMES = new Set([
  "allCases",
  "codingKey",
  "init",
  "rawValue",
  "self",
  "unknown",
]);

/** Zod types that map straight to one Swift type. */
const SCALAR_TYPES: ReadonlyMap<string, string> = new Map([
  ["any", "JSONValue"],
  ["boolean", "Bool"],
  ["date", "Date"],
  ["string", "String"],
  ["unknown", "JSONValue"],
]);

const EMPTY_INPUT = "EmptyInput";
const EMPTY_OUTPUT = "EmptyOutput";
const INPUT_SUFFIX = "Input";

/** Swift case names for string values, unique and stable in value order. */
export const enumCases = (values: readonly string[]): EnumCase[] => {
  const used = new Set<string>();
  return values.map((value) => {
    const identifier = camelCaseIdentifier(value);
    const base = RESERVED_CASE_NAMES.has(identifier)
      ? `${identifier}Value`
      : identifier;
    let name = base;
    let suffix = 2;
    while (used.has(name)) {
      name = `${base}${suffix}`;
      suffix += 1;
    }
    used.add(name);
    return { name, value };
  });
};

interface Scope {
  readonly mode: SchemaMode;
  /** The name an anonymous type here takes. */
  readonly hint: string;
  /** The name an anonymous array element here takes. */
  readonly elementHint: string;
  readonly origin: Origin;
}

interface ResolvedType {
  readonly type: string;
  readonly optional: boolean;
  readonly nullable: boolean;
  readonly defaulted: boolean;
  readonly initDefault: string | undefined;
}

interface NominalOptions {
  /** What makes two schemas one type; the schema itself unless they share a value list. */
  readonly identity: object | string;
  /** Where the doc comment says the type comes from, when not the schema's own origin. */
  readonly docOrigin: Origin | undefined;
}

interface NominalLookup {
  readonly entry: NamedType;
  /** First visit on this side: the caller walks the children. */
  readonly newMode: boolean;
}

interface ProcedureInput {
  readonly type: string;
  readonly hasInput: boolean;
}

const joinPath = (path: string, segment: string): string =>
  path === "" ? segment : `${path}.${segment}`;

const capitalizeSentence = (text: string): string =>
  `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

const originDoc = (origin: Origin): string =>
  origin.path === ""
    ? `${capitalizeSentence(origin.root)} in \`${origin.module}\`.`
    : `\`${origin.path}\` of ${origin.root} in \`${origin.module}\`.`;

const exportOrigin = (item: SchemaExport): Origin => ({
  exportName: item.exportName,
  module: item.module,
  path: "",
  root: `\`${item.exportName}\``,
});

const procedureOrigin = (module: string, root: string): Origin => ({
  exportName: undefined,
  module,
  path: "",
  root,
});

const presenceOf = (resolved: ResolvedType): Presence => {
  if (resolved.defaulted) {
    return "defaulted";
  }
  if (resolved.optional && resolved.nullable) {
    return "nullish";
  }
  if (resolved.optional) {
    return "optional";
  }
  return resolved.nullable ? "nullable" : "required";
};

const isEmptyObject = (schema: ZodSchema): boolean => {
  const fields = objectFields(schema);
  return fields !== undefined && Object.keys(fields).length === 0;
};

const scopeLabel = (scope: Scope): string =>
  `${scope.origin.root} ${scope.origin.path}`.trim();

const literalSwiftType = (value: LiteralValue, where: string): string => {
  if (isStringValue(value)) {
    return "String";
  }
  if (isBooleanValue(value)) {
    return "Bool";
  }
  if (isNumberValue(value)) {
    return Number.isInteger(value) ? "Int" : "Double";
  }
  throw new UnsupportedSchemaError(where, `literal ${String(value)}`);
};

/** A Swift literal for a JSON string, number, or boolean; undefined for anything else. */
const swiftScalarLiteral = (box: SchemaDefault): string | undefined => {
  const { value } = box;
  if (isStringValue(value)) {
    return swiftStringLiteral(value);
  }
  if (isBooleanValue(value) || isNumberValue(value)) {
    return String(value);
  }
  return undefined;
};

/** The init default for a single-value literal field, such as `success: z.literal(true)`. */
const literalDefault = (base: ZodSchema, scope: Scope): string | undefined => {
  const value = singleLiteral(base);
  if (value === undefined) {
    return undefined;
  }
  const literal = swiftScalarLiteral({ value });
  if (literal === undefined) {
    throw new UnsupportedSchemaError(
      scopeLabel(scope),
      `literal ${String(value)}`
    );
  }
  return literal;
};

/** The init default for a `.default()` field. */
const defaultLiteral = (
  fallback: SchemaDefault,
  base: ZodSchema,
  scope: Scope
): string => {
  const { value } = fallback;
  const values = stringEnumValues(base);
  const match =
    values === undefined
      ? undefined
      : enumCases(values).find((item) => item.value === value);
  if (match !== undefined) {
    return `.${match.name}`;
  }
  if (Array.isArray(value) && value.length === 0) {
    return "[]";
  }
  const literal = swiftScalarLiteral(fallback);
  if (literal === undefined) {
    throw new UnsupportedSchemaError(
      scopeLabel(scope),
      `default ${JSON.stringify(value)}`
    );
  }
  return literal;
};

const procedureTypeBase = (procedure: ContractProcedure): string =>
  procedure.keys.map((key) => pascalCase(key)).join("");

class ContractModelBuilder {
  readonly #index: SchemaExportIndex;
  /** Exports that name types this pass; others still lend docs and `.partial()` names. */
  readonly #naming = new Map<z.core.$ZodType, SchemaExport>();
  readonly #ambiguousNames = new Set<string>();
  readonly #claimed = new Set<string>(RESERVED_TYPE_NAMES);
  readonly #types = new Map<object | string, Map<string, NamedType>>();
  readonly #ordered: NamedType[] = [];
  readonly #sensitivity = new Map<z.core.$ZodType, boolean>();
  readonly #errorDataTypes = new Map<string, Set<string>>();
  readonly #namedExports = new Set<z.core.$ZodType>();

  /**
   * `namingExports` limits which schema exports reserve their names: the ones a first pass found
   * in use, so an export no procedure reaches never pushes a generated name to a `2` suffix.
   */
  constructor(
    index: SchemaExportIndex,
    namingExports: ReadonlySet<z.core.$ZodType> | undefined
  ) {
    this.#index = index;
    const schemasByName = new Map<string, z.core.$ZodType>();
    for (const item of index.schemaExports()) {
      if (namingExports !== undefined && !namingExports.has(item.schema)) {
        continue;
      }
      const known = schemasByName.get(item.typeName);
      if (known !== undefined && known !== item.schema) {
        this.#ambiguousNames.add(item.typeName);
      }
      schemasByName.set(item.typeName, item.schema);
      this.#naming.set(item.schema, item);
      this.#claimed.add(item.typeName);
    }
  }

  /** The schema exports that named a generated type. */
  namedExports(): ReadonlySet<z.core.$ZodType> {
    return this.#namedExports;
  }

  types(): readonly NamedType[] {
    return this.#ordered;
  }

  errorCodes(): ErrorCodeModel[] {
    return [...this.#errorDataTypes.keys()].toSorted().map((code) => ({
      code,
      dataTypes: [...(this.#errorDataTypes.get(code) ?? [])].toSorted(),
    }));
  }

  procedure(
    procedure: ContractProcedure,
    modules: readonly SourceModule[]
  ): ProcedureModel {
    const module = procedureModule(procedure, modules);
    const label = procedure.keys.join(".");
    const input = this.#procedureInput(procedure, module, label);
    const outputType = this.#procedureOutput(procedure, module, label);
    this.#errorData(procedure, module, label);
    return {
      errorCodes: procedure.errors.map(({ code }) => code),
      hasInput: input.hasInput,
      httpPath: procedure.httpPath,
      inputType: input.type,
      keys: procedure.keys,
      method: procedure.method,
      module,
      outputDoc: this.#outputDoc(procedure.outputSchema),
      outputType,
      summary: procedure.summary,
    };
  }

  #claim(hint: string): string {
    let name = hint;
    let suffix = 2;
    while (this.#claimed.has(name)) {
      name = `${hint}${suffix}`;
      suffix += 1;
    }
    this.#claimed.add(name);
    return name;
  }

  /** Whether the input and output sides of a schema can differ (it contains a pipe). */
  #isModeSensitive(schema: z.core.$ZodType): boolean {
    const known = this.#sensitivity.get(schema);
    if (known !== undefined) {
      return known;
    }
    this.#sensitivity.set(schema, false);
    const zodSchema = asZodSchema(schema);
    const { type } = zodSchema._zod.def;
    const result =
      type === "pipe" ||
      type === "transform" ||
      childSchemas(zodSchema).some((child) => this.#isModeSensitive(child));
    this.#sensitivity.set(schema, result);
    return result;
  }

  #nameFor(scope: Scope, exported: SchemaExport | undefined): string {
    if (exported === undefined) {
      return this.#claim(scope.hint);
    }
    const where = `\`${exported.exportName}\` in ${exported.module}`;
    if (this.#ambiguousNames.has(exported.typeName)) {
      throw new UnsupportedSchemaError(
        where,
        `another exported schema is also named ${exported.typeName}; rename one`
      );
    }
    if (RESERVED_TYPE_NAMES.has(exported.typeName)) {
      throw new UnsupportedSchemaError(
        where,
        `${exported.typeName} is reserved in Swift; rename the export`
      );
    }
    return exported.typeName;
  }

  #typeDoc(origin: Origin, exported: SchemaExport | undefined): string {
    const constantDoc =
      exported === undefined
        ? undefined
        : this.#index.constantDoc(exported.module, exported.exportName);
    return constantDoc === undefined
      ? originDoc(origin)
      : `${constantDoc}\n\n${originDoc(origin)}`;
  }

  #nominal(
    schema: ZodSchema,
    scope: Scope,
    options?: NominalOptions
  ): NominalLookup {
    const modeKey = this.#isModeSensitive(schema) ? scope.mode : "shared";
    const identity = options?.identity ?? schema;
    const byMode = this.#types.get(identity) ?? new Map<string, NamedType>();
    this.#types.set(identity, byMode);
    const existing = byMode.get(modeKey);
    if (existing !== undefined) {
      const newMode = !existing.modes.has(scope.mode);
      existing.modes.add(scope.mode);
      return { entry: existing, newMode };
    }
    const exported = this.#naming.get(schema);
    if (exported !== undefined) {
      this.#namedExports.add(schema);
    }
    const childNameBase = this.#nameFor(scope, exported);
    const name =
      modeKey === "input" && !childNameBase.endsWith(INPUT_SUFFIX)
        ? this.#claim(`${childNameBase}${INPUT_SUFFIX}`)
        : childNameBase;
    const origin =
      exported === undefined ? scope.origin : exportOrigin(exported);
    const entry: NamedType = {
      childNameBase,
      doc: this.#typeDoc(options?.docOrigin ?? origin, exported),
      file: exported?.module ?? scope.origin.module,
      model: undefined,
      modes: new Set([scope.mode]),
      name,
      omittedKey: undefined,
      origin,
    };
    byMode.set(modeKey, entry);
    this.#ordered.push(entry);
    return { entry, newMode: true };
  }

  /** The Swift type of a schema and how it is wrapped. */
  #resolve(schema: z.core.$ZodType, scope: Scope): ResolvedType {
    const unwrapped = unwrapSchema(schema, scope.mode);
    const type = this.#baseType(unwrapped.base, scope);
    const { fallback } = unwrapped;
    const initDefault =
      fallback === undefined
        ? literalDefault(unwrapped.base, scope)
        : defaultLiteral(fallback, unwrapped.base, scope);
    return {
      defaulted: fallback !== undefined,
      initDefault,
      nullable: unwrapped.nullable,
      optional: unwrapped.optional,
      type,
    };
  }

  #baseType(base: ZodSchema, scope: Scope): string {
    if (isJsonValueSchema(base)) {
      return "JSONValue";
    }
    const values = stringEnumValues(base);
    if (values !== undefined) {
      return this.#enumType(base, values, scope);
    }
    const { def } = base._zod;
    const scalar = SCALAR_TYPES.get(def.type);
    if (scalar !== undefined) {
      return scalar;
    }
    if (def.type === "number") {
      return isIntegerSchema(base) ? "Int" : "Double";
    }
    if (def.type === "literal") {
      return literalSwiftType(def.values[0], scopeLabel(scope));
    }
    if (def.type === "object") {
      return this.#structType(base, scope);
    }
    if (def.type === "union") {
      return this.#unionType(base, scope);
    }
    if (def.type === "array") {
      return `[${this.#elementType(def.element, scope)}]`;
    }
    if (def.type === "record") {
      return this.#recordType(base, def.keyType, def.valueType, scope);
    }
    throw new UnsupportedSchemaError(
      scopeLabel(scope),
      `zod type "${def.type}" has no Swift mapping`
    );
  }

  #elementType(element: z.core.$ZodType, scope: Scope): string {
    const resolved = this.#resolve(element, {
      elementHint: `${scope.elementHint}Element`,
      hint: scope.elementHint,
      mode: scope.mode,
      origin: { ...scope.origin, path: `${scope.origin.path}[]` },
    });
    return resolved.optional || resolved.nullable
      ? `${resolved.type}?`
      : resolved.type;
  }

  #recordType(
    base: ZodSchema,
    keyType: z.core.$ZodType,
    valueType: z.core.$ZodType,
    scope: Scope
  ): string {
    const key = this.#resolve(keyType, {
      ...scope,
      elementHint: `${scope.hint}Key`,
      hint: `${scope.hint}Key`,
    });
    const keyIsEnum = stringEnumValues(unwrapSchema(keyType, scope.mode).base);
    if (key.type !== "String" && keyIsEnum === undefined) {
      throw new UnsupportedSchemaError(
        scopeLabel(scope),
        "record keys must be strings or string enums"
      );
    }
    const value = this.#elementType(valueType, {
      ...scope,
      elementHint: `${scope.hint}Value`,
    });
    const target = `[${key.type}: ${value}]`;
    if (!this.#naming.has(base)) {
      return target;
    }
    const { entry } = this.#nominal(base, scope);
    entry.model ??= { kind: "alias", target };
    return entry.name;
  }

  #enumType(base: ZodSchema, values: readonly string[], scope: Scope): string {
    const valueList = this.#naming.has(base)
      ? undefined
      : this.#index.valueListFor(values);
    const { entry } =
      valueList === undefined
        ? this.#nominal(base, scope)
        : this.#nominal(
            base,
            { ...scope, hint: valueList.typeName },
            {
              docOrigin: {
                exportName: undefined,
                module: valueList.module,
                path: "",
                root: `the \`${valueList.exportName}\` values`,
              },
              identity: `values:${valueList.module}:${valueList.exportName}`,
            }
          );
    entry.model ??= { cases: enumCases(values), kind: "enum" };
    return entry.name;
  }

  #structType(base: ZodSchema, scope: Scope, omittedKey?: string): string {
    const partialSource = this.#naming.has(base)
      ? undefined
      : this.#index.partialSourceOf(base);
    const { entry, newMode } =
      partialSource === undefined
        ? this.#nominal(base, scope)
        : this.#nominal(
            base,
            { ...scope, hint: `Partial${partialSource.typeName}` },
            {
              docOrigin: {
                ...exportOrigin(partialSource),
                root: `\`${partialSource.exportName}.partial()\``,
              },
              identity: base,
            }
          );
    if (entry.model === undefined) {
      entry.omittedKey = omittedKey;
    } else if (entry.omittedKey !== omittedKey) {
      throw new UnsupportedSchemaError(
        scopeLabel(scope),
        "an object used both as a discriminated union variant and on its own"
      );
    }
    if (!newMode) {
      return entry.name;
    }
    const objectSchemaFields = objectFields(base) ?? {};
    const fields = Object.entries(objectSchemaFields)
      .filter(([key]) => key !== omittedKey)
      .map(([key, fieldSchema]) =>
        this.#field(key, fieldSchema, objectSchemaFields, entry, scope.mode)
      );
    entry.model ??= { fields, kind: "struct" };
    return entry.name;
  }

  #fieldDoc(
    key: string,
    siblings: ObjectFields,
    parent: NamedType
  ): string | undefined {
    const { origin } = parent;
    const own =
      origin.exportName === undefined
        ? undefined
        : this.#index.propertyDoc(
            origin.module,
            origin.exportName,
            docPath(origin.path, key)
          );
    return own ?? this.#index.inheritedPropertyDoc(siblings, key);
  }

  #field(
    key: string,
    schema: z.core.$ZodType,
    siblings: ObjectFields,
    parent: NamedType,
    mode: SchemaMode
  ): FieldModel {
    const { name, renamed } = propertyNameForKey(key);
    const scope: Scope = {
      elementHint: `${parent.childNameBase}${pascalCase(singularize(key))}`,
      hint: `${parent.childNameBase}${pascalCase(key)}`,
      mode,
      origin: { ...parent.origin, path: joinPath(parent.origin.path, key) },
    };
    const resolved = this.#resolve(schema, scope);
    const zodOptional = zodKeyIsOptional(schema, mode);
    const ourOptional =
      resolved.optional || (mode === "input" && resolved.defaulted);
    if (zodOptional !== ourOptional) {
      const expected = zodOptional ? "optional" : "required";
      throw new UnsupportedSchemaError(
        scopeLabel(scope),
        `zod treats the ${mode} key as ${expected}, but the generator does not`
      );
    }
    return {
      doc: this.#fieldDoc(key, siblings, parent),
      initDefault: resolved.initDefault,
      key,
      name,
      presence: presenceOf(resolved),
      renamed,
      type: resolved.type,
    };
  }

  #unionType(base: ZodSchema, scope: Scope): string {
    const discriminator = discriminatorOf(base);
    const { def } = base._zod;
    if (discriminator === undefined || def.type !== "union") {
      throw new UnsupportedSchemaError(
        scopeLabel(scope),
        "unions must be discriminated (z.discriminatedUnion) or of string literals"
      );
    }
    const { entry, newMode } = this.#nominal(base, scope);
    if (!newMode) {
      return entry.name;
    }
    const options = def.options.map((option) => {
      const optionSchema = asZodSchema(option);
      const variantFields = objectFields(optionSchema);
      const tag = variantFields?.[discriminator];
      const value =
        tag === undefined ? undefined : singleLiteral(asZodSchema(tag));
      if (variantFields === undefined || !isStringValue(value)) {
        throw new UnsupportedSchemaError(
          scopeLabel(scope),
          `every variant needs one string literal \`${discriminator}\``
        );
      }
      return { optionSchema, value, variantFields };
    });
    const cases = enumCases(options.map(({ value }) => value));
    const variants = options.map(
      ({ optionSchema, value, variantFields }, index) => {
        const hasPayload = Object.keys(variantFields).some(
          (key) => key !== discriminator
        );
        const hint = `${entry.childNameBase}${pascalCase(value)}`;
        const variantPath = `{${discriminator}: ${JSON.stringify(value)}}`;
        const payload = hasPayload
          ? this.#structType(
              optionSchema,
              {
                elementHint: hint,
                hint,
                mode: scope.mode,
                origin: {
                  ...entry.origin,
                  path: `${entry.origin.path}${variantPath}`,
                },
              },
              discriminator
            )
          : undefined;
        return { name: cases[index]?.name ?? value, payload, value };
      }
    );
    entry.model ??= { discriminator, kind: "union", variants };
    return entry.name;
  }

  #procedureInput(
    procedure: ContractProcedure,
    module: string,
    label: string
  ): ProcedureInput {
    const schema = procedure.inputSchema;
    if (schema === undefined) {
      return { hasInput: false, type: EMPTY_INPUT };
    }
    const unwrapped = unwrapSchema(schema, "input");
    if (unwrapped.optional || unwrapped.nullable) {
      throw new UnsupportedSchemaError(
        `the ${label} input`,
        "optional or nullable procedure inputs"
      );
    }
    if (isEmptyObject(unwrapped.base)) {
      return { hasInput: true, type: EMPTY_INPUT };
    }
    const base = procedureTypeBase(procedure);
    const type = this.#baseType(unwrapped.base, {
      elementHint: `${base}InputItem`,
      hint: `${base}Input`,
      mode: "input",
      origin: procedureOrigin(module, `the \`${label}\` input`),
    });
    return { hasInput: true, type };
  }

  #procedureOutput(
    procedure: ContractProcedure,
    module: string,
    label: string
  ): string {
    const schema = procedure.outputSchema;
    if (schema === undefined) {
      throw new UnsupportedSchemaError(`the ${label} output`, "no .output()");
    }
    const unwrapped = unwrapSchema(schema, "output");
    const { type } = unwrapped.base._zod.def;
    if (type === "void" || type === "undefined") {
      return EMPTY_OUTPUT;
    }
    if (isEmptyObject(unwrapped.base) && !unwrapped.nullable) {
      return EMPTY_OUTPUT;
    }
    const base = procedureTypeBase(procedure);
    const swiftType = this.#baseType(unwrapped.base, {
      elementHint: `${base}OutputItem`,
      hint: `${base}Output`,
      mode: "output",
      origin: procedureOrigin(module, `the \`${label}\` output`),
    });
    return unwrapped.optional || unwrapped.nullable
      ? `${swiftType}?`
      : swiftType;
  }

  /** The doc on an exported output schema that is a list or optional, not a named type. */
  #outputDoc(schema: z.core.$ZodType | undefined): string | undefined {
    const exported =
      schema === undefined ? undefined : this.#index.exportOf(schema);
    if (exported === undefined || this.#naming.has(exported.schema)) {
      return undefined;
    }
    return this.#index.constantDoc(exported.module, exported.exportName);
  }

  #errorData(
    procedure: ContractProcedure,
    module: string,
    label: string
  ): void {
    for (const error of procedure.errors) {
      if (error.dataSchema === undefined) {
        continue;
      }
      const resolved = this.#resolve(error.dataSchema, {
        elementHint: `${pascalCase(error.code)}ErrorDataItem`,
        hint: `${pascalCase(error.code)}ErrorData`,
        mode: "output",
        origin: procedureOrigin(
          module,
          `the \`${error.code}\` error data of \`${label}\``
        ),
      });
      const types = this.#errorDataTypes.get(error.code) ?? new Set<string>();
      types.add(resolved.type);
      this.#errorDataTypes.set(error.code, types);
    }
  }
}

/**
 * Walks every procedure twice: the first pass finds which schema exports name types, and the
 * second names everything with only those exports reserved.
 */
export const buildContractModel = (
  procedures: readonly ContractProcedure[],
  modules: readonly SourceModule[]
): ContractModel => {
  const index = new SchemaExportIndex(modules);
  const firstPass = new ContractModelBuilder(index, undefined);
  for (const procedure of procedures) {
    firstPass.procedure(procedure, modules);
  }
  const builder = new ContractModelBuilder(index, firstPass.namedExports());
  const procedureModels = procedures.map((procedure) =>
    builder.procedure(procedure, modules)
  );
  const withData = builder.errorCodes();
  const allCodes = new Set(
    procedures.flatMap(({ errors }) => errors.map(({ code }) => code))
  );
  const errorCodes = [...allCodes]
    .toSorted()
    .map(
      (code) =>
        withData.find((item) => item.code === code) ?? { code, dataTypes: [] }
    );
  return { errorCodes, procedures: procedureModels, types: builder.types() };
};

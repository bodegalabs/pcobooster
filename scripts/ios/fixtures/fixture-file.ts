import type {
  JsonObject,
  JsonValue,
} from "@pcobooster/planning-center-models/json";

import type { appContract } from "../../../packages/contracts/src/router";

/**
 * One fixture file per contract procedure, at
 * `apps/ios/PCOBoosterCore/Sources/PCOBoosterMock/Fixtures/<namespace>.<procedure>.json`:
 *
 *     {"default": <output>, "cases": [{"match": <input subset>, "output": <output>}]}
 *
 * `MockTransport` answers with the first case whose `match` is a JSON subset of the request
 * input (objects by key, arrays element by element), else `default`. `cases` is optional.
 */

interface ContractProcedure {
  readonly "~orpc": {
    readonly inputSchema?: unknown;
    readonly outputSchema?: unknown;
  };
}

/**
 * Types come from each schema's Standard Schema props rather than Zod's own, so they hold
 * whichever copy of Zod the contracts package resolves.
 */
type StandardTypes<Schema> = Schema extends {
  readonly "~standard": { readonly types?: infer Types };
}
  ? NonNullable<Types>
  : never;

type SchemaOutput<Schema> =
  StandardTypes<Schema> extends { readonly output: infer Output }
    ? Output
    : never;

type SchemaInput<Schema> =
  StandardTypes<Schema> extends { readonly input: infer Input } ? Input : never;

export type ProcedureOutput<Procedure> = Procedure extends ContractProcedure
  ? SchemaOutput<Procedure["~orpc"]["outputSchema"]>
  : never;

export type ProcedureInput<Procedure> = Procedure extends ContractProcedure
  ? SchemaInput<Procedure["~orpc"]["inputSchema"]>
  : never;

/** A subset of a request's input JSON. */
export type InputMatch<Input> = Input extends readonly (infer Item)[]
  ? readonly InputMatch<Item>[]
  : Input extends object
    ? { readonly [Key in keyof Input]?: InputMatch<Input[Key]> }
    : Input;

export interface FixtureCase<Procedure> {
  readonly match: InputMatch<ProcedureInput<Procedure>>;
  readonly output: ProcedureOutput<Procedure>;
}

export interface ProcedureFixture<Procedure> {
  readonly default: ProcedureOutput<Procedure>;
  readonly cases?: readonly FixtureCase<Procedure>[];
}

type FixtureTree<Router> = {
  readonly [Key in keyof Router]: Router[Key] extends ContractProcedure
    ? ProcedureFixture<Router[Key]>
    : FixtureTree<Router[Key]>;
};

/** A fixture for every procedure in `appContract`, typed by its schemas. */
export type AppFixtures = FixtureTree<typeof appContract>;

/** Fixture data before it is written: JSON plus `Date`s and absent optional fields. */
export type FixtureValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | readonly FixtureValue[]
  | { readonly [key: string]: FixtureValue };

export interface StoredFixture {
  readonly default: FixtureValue;
  readonly cases?: readonly {
    readonly match: FixtureValue;
    readonly output: FixtureValue;
  }[];
}

export type FixtureNode =
  | StoredFixture
  | { readonly [key: string]: FixtureNode };

export type ContractNode =
  | ContractProcedure
  | { readonly [key: string]: ContractNode };

export interface ContractProcedureEntry {
  /** Router keys, for example `["people", "positionCandidates"]`. */
  readonly path: readonly string[];
  readonly inputSchema: unknown;
  readonly outputSchema: unknown;
}

const isContractProcedure = (node: ContractNode): node is ContractProcedure =>
  "~orpc" in node;

const isStoredFixture = (node: FixtureNode): node is StoredFixture =>
  "default" in node;

const isFixtureScalar = (
  value: FixtureValue
): value is string | number | boolean | null | undefined =>
  value === null || value === undefined || typeof value !== "object";

const isFixtureList = (value: FixtureValue): value is readonly FixtureValue[] =>
  Array.isArray(value);

/** Every procedure in a contract router, depth first in key order. */
export const listProcedures = (
  router: ContractNode,
  prefix: readonly string[] = []
): ContractProcedureEntry[] => {
  if (isContractProcedure(router)) {
    return [
      {
        path: prefix,
        inputSchema: router["~orpc"].inputSchema,
        outputSchema: router["~orpc"].outputSchema,
      },
    ];
  }
  return Object.entries(router).flatMap(([key, node]) =>
    listProcedures(node, [...prefix, key])
  );
};

/** Router paths of every fixture in a tree, dotted. */
export const listFixturePaths = (
  node: FixtureNode,
  prefix: readonly string[] = []
): string[] => {
  if (isStoredFixture(node)) {
    return [prefix.join(".")];
  }
  return Object.entries(node).flatMap(([key, child]) =>
    listFixturePaths(child, [...prefix, key])
  );
};

/** The fixture at a router path, or undefined when the tree has none. */
export const fixtureAt = (
  tree: FixtureNode,
  path: readonly string[]
): StoredFixture | undefined => {
  let node: FixtureNode | undefined = tree;
  for (const key of path) {
    node = node === undefined || isStoredFixture(node) ? undefined : node[key];
  }
  return node !== undefined && isStoredFixture(node) ? node : undefined;
};

/** `people.positionCandidates.json`; `health.json` for the top-level procedure. */
export const fixtureFileName = (path: readonly string[]): string =>
  `${path.join(".")}.json`;

/**
 * The value as the API would send it: `Date`s as `toISOString()`, absent fields dropped, and
 * `undefined` (a void output) as `null`.
 */
export const toJsonData = (value: FixtureValue): JsonValue => {
  if (isFixtureScalar(value)) {
    return value ?? null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (isFixtureList(value)) {
    return value.map(toJsonData);
  }
  const object: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      object[key] = toJsonData(entry);
    }
  }
  return object;
};

const INLINE_WIDTH = 100;
/** A table row on one line still reads well up to about this width. */
const ROW_WIDTH = 440;
const INDENT = "  ";
const EN_DASH = 0x20_13;
const EM_DASH = 0x20_14;
// Built from code points: the formatter rewrites escaped dashes in literals into real ones.
const LONG_DASHES = new RegExp(
  `[${String.fromCodePoint(EN_DASH, EM_DASH)}]`,
  "gu"
);

const escapeLongDash = (dash: string): string =>
  `\\u${(dash.codePointAt(0) ?? 0).toString(16).padStart(4, "0")}`;

type JsonScalar = string | number | boolean | null;

const isScalar = (value: JsonValue): value is JsonScalar =>
  value === null || typeof value !== "object";

const isJsonArray = (value: JsonValue): value is JsonValue[] =>
  Array.isArray(value);

const isJsonObject = (value: JsonValue): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const inline = (value: JsonValue): string => {
  if (isJsonArray(value)) {
    return `[${value.map(inline).join(", ")}]`;
  }
  if (isJsonObject(value)) {
    const entries = Object.entries(value).map(
      ([key, entry]) => `${JSON.stringify(key)}: ${inline(entry)}`
    );
    return `{${entries.join(", ")}}`;
  }
  return JSON.stringify(value);
};

/**
 * A record of scalars, scalar lists, and records of scalars, such as one roster row or one
 * scheduled person: printed as one line.
 */
const isRow = (value: JsonValue, nested = true): boolean =>
  isJsonObject(value) &&
  Object.values(value).every(
    (entry) =>
      isScalar(entry) ||
      (isJsonArray(entry) && entry.every(isScalar)) ||
      (nested && isRow(entry, false))
  );

/**
 * Readable JSON: a value that fits on one line stays there, and so does a table row; anything
 * else breaks open, one entry per line.
 */
const format = (value: JsonValue, depth: number): string => {
  const flat = inline(value);
  const indent = INDENT.repeat(depth);
  if (
    isScalar(value) ||
    indent.length + flat.length <= INLINE_WIDTH ||
    (isRow(value) && flat.length <= ROW_WIDTH)
  ) {
    return flat;
  }
  const inner = INDENT.repeat(depth + 1);
  if (isJsonArray(value)) {
    const items = value.map((item) => `${inner}${format(item, depth + 1)}`);
    return `[\n${items.join(",\n")}\n${indent}]`;
  }
  const entries = Object.entries(value).map(
    ([key, entry]) =>
      `${inner}${JSON.stringify(key)}: ${format(entry, depth + 1)}`
  );
  return `{\n${entries.join(",\n")}\n${indent}}`;
};

/** The file `MockTransport` reads. Long dashes are escaped for the repo's dash lint. */
export const renderFixtureFile = (fixture: StoredFixture): string => {
  const file: JsonObject = { default: toJsonData(fixture.default) };
  const cases = fixture.cases ?? [];
  if (cases.length > 0) {
    file.cases = cases.map(({ match, output }) => ({
      match: toJsonData(match),
      output: toJsonData(output),
    }));
  }
  return `${format(file, 0).replaceAll(LONG_DASHES, escapeLongDash)}\n`;
};

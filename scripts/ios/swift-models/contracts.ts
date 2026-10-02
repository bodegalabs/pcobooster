/**
 * Reads the oRPC contract router and the modules that define its schemas: every procedure with
 * its route and schemas, and every module export the generator can name types after. Module
 * exports are decoded here, at the import boundary, into `ExportValue`s.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

/** Directories scanned for schema exports, relative to the repository root. */
export const SCHEMA_SOURCE_DIRECTORIES = [
  "packages/contracts/src",
  "packages/planning-center-models/src",
] as const;

const PROCEDURE_KEY = "~orpc";
/** oRPC's key for declared errors; computed so lint does not mistake it for zod 3 options. */
const ERROR_MAP_KEY = "errorMap";

const zodSchema = z.instanceof(z.core.$ZodType);

/** What oRPC 1.x stores under a contract procedure's `["~orpc"]`. */
const procedureDefinitionSchema = z.object({
  [ERROR_MAP_KEY]: z.record(
    z.string(),
    z
      .object({ data: zodSchema.optional(), status: z.number().optional() })
      .optional()
  ),
  inputSchema: zodSchema.optional(),
  outputSchema: zodSchema.optional(),
  route: z.object({
    method: z.string().optional(),
    path: z.string().optional(),
    summary: z.string().optional(),
  }),
});

type ProcedureDefinition = z.output<typeof procedureDefinitionSchema>;

interface ProcedureNode {
  readonly kind: "procedure";
  readonly definition: ProcedureDefinition;
}

interface RouterNode {
  readonly kind: "router";
  readonly children: ReadonlyMap<string, ContractNode>;
}

/** A contract router or procedure, decoded. */
export type ContractNode = ProcedureNode | RouterNode;

const procedureNodeSchema = z
  .object({ [PROCEDURE_KEY]: procedureDefinitionSchema })
  .transform((value): ProcedureNode => ({
    definition: value[PROCEDURE_KEY],
    kind: "procedure",
  }));

const contractNodeSchema: z.ZodType<ContractNode> = z.lazy(() =>
  z.union([
    procedureNodeSchema,
    z
      .record(z.string(), contractNodeSchema)
      .transform((children): RouterNode => ({
        children: new Map(Object.entries(children)),
        kind: "router",
      })),
  ])
);

/** A module export, classified for the generator. */
export type ExportValue =
  | { readonly kind: "contract"; readonly node: ContractNode }
  | { readonly kind: "other" }
  | { readonly kind: "schema"; readonly schema: z.core.$ZodType }
  | { readonly kind: "values"; readonly values: readonly string[] };

const exportValueSchema: z.ZodType<ExportValue> = z.union([
  zodSchema.transform((schema): ExportValue => ({ kind: "schema", schema })),
  z
    .array(z.string())
    .min(1)
    .transform((values): ExportValue => ({ kind: "values", values })),
  contractNodeSchema.transform((node): ExportValue => ({
    kind: "contract",
    node,
  })),
]);

const OTHER_EXPORT: ExportValue = { kind: "other" };

const moduleNamespaceSchema = z.looseObject({});

/** A module whose exports name generated types, such as `packages/contracts/src/catalog.ts`. */
export interface SourceModule {
  /** Repository-relative path. */
  readonly path: string;
  /** Exports by name, in name order. */
  readonly exports: ReadonlyMap<string, ExportValue>;
  /** The module's TypeScript source, for doc comments. */
  readonly source: string;
}

/** One contract procedure. */
export interface ContractProcedure {
  /** Router keys, for example `["people", "positionCandidates"]`. */
  readonly keys: readonly string[];
  readonly method: string | undefined;
  readonly httpPath: string | undefined;
  readonly summary: string | undefined;
  readonly inputSchema: z.core.$ZodType | undefined;
  readonly outputSchema: z.core.$ZodType | undefined;
  /** Declared error codes and their `data` schemas, in declaration order. */
  readonly errors: readonly ContractError[];
}

export interface ContractError {
  readonly code: string;
  readonly status: number | undefined;
  readonly dataSchema: z.core.$ZodType | undefined;
}

const toProcedure = (
  keys: readonly string[],
  definition: ProcedureDefinition
): ContractProcedure => ({
  errors: Object.entries(definition.errorMap).map(([code, item]) => ({
    code,
    dataSchema: item?.data,
    status: item?.status,
  })),
  httpPath: definition.route.path,
  inputSchema: definition.inputSchema,
  keys,
  method: definition.route.method,
  outputSchema: definition.outputSchema,
  summary: definition.route.summary,
});

/** Every procedure in a contract router, in router key order. */
export const contractProcedures = (
  node: ContractNode,
  keys: readonly string[] = []
): ContractProcedure[] => {
  if (node.kind === "procedure") {
    return [toProcedure(keys, node.definition)];
  }
  return [...node.children].flatMap(([key, child]) =>
    contractProcedures(child, [...keys, key])
  );
};

const isSourceFile = (fileName: string): boolean =>
  fileName.endsWith(".ts") &&
  !fileName.endsWith(".test.ts") &&
  !fileName.endsWith(".d.ts");

/** Imports every non-test module in `directories` (repository-relative), in path order. */
export const loadSourceModules = async (
  rootDir: string,
  directories: readonly string[] = SCHEMA_SOURCE_DIRECTORIES
): Promise<SourceModule[]> => {
  const relativePaths = directories.flatMap((directory) =>
    readdirSync(path.join(rootDir, directory))
      .filter((fileName) => isSourceFile(fileName))
      .toSorted()
      .map((fileName) => `${directory}/${fileName}`)
  );
  return await Promise.all(
    relativePaths.map(async (relativePath) => {
      const absolutePath = path.join(rootDir, relativePath);
      const loaded: unknown = await import(pathToFileURL(absolutePath).href);
      const namespace = moduleNamespaceSchema.parse(loaded);
      return {
        exports: new Map(
          Object.keys(namespace)
            .toSorted()
            .map((name) => {
              const parsed = exportValueSchema.safeParse(namespace[name]);
              return [name, parsed.success ? parsed.data : OTHER_EXPORT];
            })
        ),
        path: relativePath,
        source: readFileSync(absolutePath, "utf-8"),
      };
    })
  );
};

const sameProcedure = (
  node: ContractNode | undefined,
  procedure: ContractProcedure
): boolean =>
  node?.kind === "procedure" &&
  node.definition.inputSchema === procedure.inputSchema &&
  node.definition.outputSchema === procedure.outputSchema &&
  node.definition.route.path === procedure.httpPath;

/**
 * The module that defines a procedure: the one exporting it, or exporting the contract object
 * that holds it. `oc.router` copies procedures, so they are matched by schemas and route.
 */
export const procedureModule = (
  procedure: ContractProcedure,
  modules: readonly SourceModule[]
): string => {
  const name = procedure.keys.at(-1) ?? "";
  for (const sourceModule of modules) {
    for (const value of sourceModule.exports.values()) {
      if (value.kind !== "contract") {
        continue;
      }
      const { node } = value;
      const held = node.kind === "router" ? node.children.get(name) : undefined;
      if (sameProcedure(node, procedure) || sameProcedure(held, procedure)) {
        return sourceModule.path;
      }
    }
  }
  throw new Error(
    `No module defines the ${procedure.keys.join(".")} procedure`
  );
};

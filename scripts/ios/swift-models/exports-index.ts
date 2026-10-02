/**
 * What the contract modules export, for naming and documenting generated types: every
 * `fooSchema` export (named `Foo`), every exported list of strings (`CHORD_CHART_MARGINS`, which
 * names the enum built from it), and the doc comments written on them.
 */
import type { z } from "zod";

import type { ExportValue, SourceModule } from "./contracts";
import type { ModuleDocs } from "./jsdoc";
import { readModuleDocs } from "./jsdoc";
import { typeNameForSchemaExport, typeNameForValueListExport } from "./naming";
import type { ObjectFields, ZodSchema } from "./zod";
import { asZodSchema, objectFields } from "./zod";

export interface SchemaExport {
  readonly schema: z.core.$ZodType;
  readonly exportName: string;
  /** Repository-relative module path. */
  readonly module: string;
  /** The Swift type name the export gives a struct, enum, union, or alias. */
  readonly typeName: string;
}

export interface ValueList {
  readonly exportName: string;
  readonly module: string;
  readonly typeName: string;
  readonly values: readonly string[];
}

/** Matching keys an object shares with an exported one before it inherits that one's docs. */
const MIN_SHARED_FIELDS_FOR_INHERITED_DOCS = 2;
const LIST_SEGMENT = "[]";
const VARIANT_SEGMENT = /\{[^}]*\}/gu;

const sameValues = (
  left: readonly string[],
  right: readonly string[]
): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

/** `{status: "granted"}.serviceTypes[]` -> `serviceTypes`: the object keys a doc path uses. */
export const docPath = (originPath: string, key: string): string =>
  [
    ...originPath
      .replaceAll(LIST_SEGMENT, "")
      .replaceAll(VARIANT_SEGMENT, "")
      .split("."),
    key,
  ]
    .filter((segment) => segment !== "")
    .join(".");

export class SchemaExportIndex {
  readonly #schemaExports = new Map<z.core.$ZodType, SchemaExport>();
  readonly #objectExports: SchemaExport[] = [];
  readonly #valueLists: ValueList[] = [];
  readonly #sources = new Map<string, string>();
  readonly #docs = new Map<string, ModuleDocs>();

  /** Modules in path order; within a module, exports in name order. The first export wins. */
  constructor(modules: readonly SourceModule[]) {
    for (const sourceModule of modules) {
      this.#sources.set(sourceModule.path, sourceModule.source);
      for (const [exportName, value] of sourceModule.exports) {
        this.#add(sourceModule.path, exportName, value);
      }
    }
  }

  #add(module: string, exportName: string, value: ExportValue): void {
    if (value.kind === "values") {
      this.#valueLists.push({
        exportName,
        module,
        typeName: typeNameForValueListExport(exportName),
        values: value.values,
      });
      return;
    }
    const typeName = typeNameForSchemaExport(exportName);
    if (
      value.kind !== "schema" ||
      typeName === undefined ||
      this.#schemaExports.has(value.schema)
    ) {
      return;
    }
    const item: SchemaExport = {
      exportName,
      module,
      schema: value.schema,
      typeName,
    };
    this.#schemaExports.set(value.schema, item);
    if (objectFields(asZodSchema(value.schema)) !== undefined) {
      this.#objectExports.push(item);
    }
  }

  schemaExports(): IterableIterator<SchemaExport> {
    return this.#schemaExports.values();
  }

  exportOf(schema: z.core.$ZodType): SchemaExport | undefined {
    return this.#schemaExports.get(schema);
  }

  /** The exported list of strings an enum's values come from, in the same order. */
  valueListFor(values: readonly string[]): ValueList | undefined {
    return this.#valueLists.find((list) => sameValues(list.values, values));
  }

  /** The exported object `schema` is `.partial()` of: the same keys, each made optional. */
  partialSourceOf(schema: ZodSchema): SchemaExport | undefined {
    const fields = objectFields(schema);
    if (fields === undefined || Object.keys(fields).length === 0) {
      return undefined;
    }
    const entries = Object.entries(fields);
    return this.#objectExports.find((item) => {
      const sourceFields = objectFields(asZodSchema(item.schema));
      if (
        sourceFields === undefined ||
        sourceFields === fields ||
        Object.keys(sourceFields).length !== entries.length
      ) {
        return false;
      }
      return entries.every(([key, field]) => {
        const { def } = asZodSchema(field)._zod;
        return def.type === "optional" && def.innerType === sourceFields[key];
      });
    });
  }

  #moduleDocs(module: string): ModuleDocs {
    const known = this.#docs.get(module);
    if (known !== undefined) {
      return known;
    }
    const docs = readModuleDocs(this.#sources.get(module) ?? "");
    this.#docs.set(module, docs);
    return docs;
  }

  /** The doc comment on an exported constant. */
  constantDoc(module: string, exportName: string): string | undefined {
    return this.#moduleDocs(module).constants.get(exportName);
  }

  /** The doc comment on a property inside an exported constant (`requestBudget.limit`). */
  propertyDoc(
    module: string,
    exportName: string,
    path: string
  ): string | undefined {
    return this.#moduleDocs(module).properties.get(exportName)?.get(path);
  }

  /**
   * The doc on `key` in an exported object that `fields` was built from (`.extend()`, spread
   * fields): one holding the same field schema and sharing enough other fields with `fields`.
   */
  inheritedPropertyDoc(fields: ObjectFields, key: string): string | undefined {
    const field = fields[key];
    for (const item of this.#objectExports) {
      const sourceFields = objectFields(asZodSchema(item.schema));
      if (
        sourceFields === undefined ||
        sourceFields === fields ||
        sourceFields[key] !== field
      ) {
        continue;
      }
      const shared = Object.entries(sourceFields).filter(
        ([sourceKey, sourceField]) => fields[sourceKey] === sourceField
      ).length;
      const required = Math.min(
        MIN_SHARED_FIELDS_FOR_INHERITED_DOCS,
        Object.keys(sourceFields).length
      );
      const doc = this.propertyDoc(item.module, item.exportName, key);
      if (shared >= required && doc !== undefined) {
        return doc;
      }
    }
    return undefined;
  }
}

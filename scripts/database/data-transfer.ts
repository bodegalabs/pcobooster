import { createHash } from "node:crypto";

import {
  account,
  activityEvents,
  planningCenterAccountIdentities,
  session,
  user,
  verification,
} from "@pcobooster/api/db/schema";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { Effect } from "effect";
import { z } from "zod";

export type SqlValue = string | number | null;
export type SqlRow = Record<string, SqlValue>;
export interface MigrationTarget {
  query: (sql: string, params?: SqlValue[]) => Promise<SqlRow[]>;
}

// Parents precede their children. Activity history deliberately retains deleted actors.
export const migrationTables = [
  user,
  account,
  session,
  verification,
  planningCenterAccountIdentities,
  activityEvents,
].map((table) => {
  const config = getTableConfig(table);
  return {
    name: config.name,
    columns: config.columns.map((column) => ({
      name: column.name,
      kind: z
        .enum(["date", "boolean", "json", "number", "string"])
        .parse(column.dataType),
    })),
    primaryKey: config.columns.find((column) => column.primary)?.name ?? "id",
  };
});

type TableSpec = (typeof migrationTables)[number];
export interface TableSnapshot {
  table: TableSpec;
  rows: SqlRow[];
}

const identifierPattern = /^[a-zA-Z_]\w*$/u;
export const quoteIdentifier = (identifier: string): string => {
  if (!identifierPattern.test(identifier)) {
    throw new Error("Unexpected SQL identifier in migration schema");
  }
  return `"${identifier}"`;
};

export const sourceRowsSchema = z.array(
  z.record(z.string(), z.union([z.date(), z.json()]))
);
type SourceValue = z.infer<typeof sourceRowsSchema>[number][string];

const convertValue = (value: SourceValue, kind: string): SqlValue => {
  if (value === null) {
    return null;
  }
  switch (kind) {
    case "date": {
      const date = z.date().parse(value);
      return date.getTime();
    }
    case "boolean": {
      return z.boolean().parse(value) ? 1 : 0;
    }
    case "json": {
      return JSON.stringify(z.json().parse(value));
    }
    case "number": {
      return z.coerce.number().int().parse(value);
    }
    case "string": {
      return z.string().parse(value);
    }
    default: {
      throw new Error(`Unsupported migration column type: ${kind}`);
    }
  }
};

export const normalizeSourceRows = (
  table: TableSpec,
  rows: z.infer<typeof sourceRowsSchema>
): SqlRow[] =>
  rows.map((row) =>
    Object.fromEntries(
      table.columns.map((column) => [
        column.name,
        convertValue(row[column.name], column.kind),
      ])
    )
  );

const rowKey = (table: TableSpec, row: SqlRow): string => {
  const value = row[table.primaryKey];
  if (value === undefined || value === null) {
    throw new Error(`Missing primary key in ${table.name}`);
  }
  return String(value);
};

const serializeRow = (table: TableSpec, row: SqlRow): string =>
  JSON.stringify(table.columns.map((column) => row[column.name]));

export const fingerprint = ({ table, rows }: TableSnapshot): string => {
  const hash = createHash("sha256");
  const ordered = rows.toSorted((left, right) => {
    const a = rowKey(table, left);
    const b = rowKey(table, right);
    return a < b ? -1 : Number(a > b);
  });
  for (const row of ordered) {
    hash.update(serializeRow(table, row));
    hash.update("\n");
  }
  return hash.digest("hex");
};

const selectRows = (table: TableSpec): string =>
  `SELECT ${table.columns.map((column) => quoteIdentifier(column.name)).join(", ")} FROM ${quoteIdentifier(table.name)}`;

/** Resume only identical rows; never overwrite or delete data already in the destination. */
export const transferSnapshot = async (
  snapshots: TableSnapshot[],
  target: MigrationTarget
) => {
  const missingByTable = new Map<string, SqlRow[]>();
  // Validate every table before making the first write.
  await Promise.all(
    snapshots.map(async ({ table, rows }) => {
      const sourceById = new Map(
        rows.map((row) => [rowKey(table, row), serializeRow(table, row)])
      );
      if (sourceById.size !== rows.length) {
        throw new Error(`Duplicate source primary key in ${table.name}`);
      }
      const existing = await target.query(selectRows(table));
      const existingIds = new Set<string>();
      for (const row of existing) {
        const key = rowKey(table, row);
        if (sourceById.get(key) !== serializeRow(table, row)) {
          throw new Error(
            `Destination ${table.name} contains different data; refusing to overwrite it`
          );
        }
        existingIds.add(key);
      }
      missingByTable.set(
        table.name,
        rows.filter((row) => !existingIds.has(rowKey(table, row)))
      );
    })
  );

  await Effect.runPromise(
    Effect.forEach(
      snapshots,
      ({ table }) =>
        Effect.promise(async () => {
          const columns = table.columns
            .map((column) => quoteIdentifier(column.name))
            .join(", ");
          const placeholders = table.columns.map(() => "?").join(", ");
          await Effect.runPromise(
            Effect.forEach(
              missingByTable.get(table.name) ?? [],
              (row) =>
                Effect.promise(async () => {
                  const values = table.columns.map(
                    (column) => row[column.name]
                  );
                  await target.query(
                    `INSERT INTO ${quoteIdentifier(table.name)} (${columns}) VALUES (${placeholders})`,
                    values
                  );
                }),
              { concurrency: 1, discard: true }
            )
          );
        }),
      { concurrency: 1, discard: true }
    )
  );

  const receipts = await Promise.all(
    snapshots.map(async (snapshot) => {
      const destination = await target.query(selectRows(snapshot.table));
      const sourceHash = fingerprint(snapshot);
      if (
        destination.length !== snapshot.rows.length ||
        fingerprint({ table: snapshot.table, rows: destination }) !== sourceHash
      ) {
        throw new Error(
          `Destination verification failed for ${snapshot.table.name}`
        );
      }
      return {
        table: snapshot.table.name,
        rows: destination.length,
        sha256: sourceHash,
      };
    })
  );
  const violations = await target.query("PRAGMA foreign_key_check");
  if (violations.length > 0) {
    throw new Error("Destination foreign key verification failed");
  }
  return receipts;
};

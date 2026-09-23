import { parseArgs } from "node:util";

import { Client } from "pg";
import { z } from "zod";

import {
  migrationTables,
  normalizeSourceRows,
  sourceRowsSchema,
  quoteIdentifier,
  transferSnapshot,
} from "./data-transfer";
import type { MigrationTarget, TableSnapshot } from "./data-transfer";
import { createLocalD1 } from "./local-d1";

const { values } = parseArgs({
  options: {
    local: { type: "boolean", default: false },
    "database-id": { type: "string" },
  },
  strict: true,
});

const readSnapshot = async (): Promise<TableSnapshot[]> => {
  const connection = new URL(z.url().parse(process.env.DATABASE_URL));
  connection.searchParams.set("sslmode", "verify-full");
  const connectionString = connection.toString();
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
    );
    const tables = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    );
    const expectedTables = new Set(migrationTables.map((table) => table.name));
    if (tables.rows.some((row) => !expectedTables.has(row.tablename))) {
      throw new Error(
        "PostgreSQL contains additional public tables; extend the migration before continuing"
      );
    }
    const snapshots = await Promise.all(
      migrationTables.map(async (table) => {
        const columns = table.columns
          .map((column) => quoteIdentifier(column.name))
          .join(", ");
        const result = await client.query(
          `SELECT ${columns} FROM ${quoteIdentifier(table.name)}`
        );
        return {
          table,
          rows: normalizeSourceRows(table, sourceRowsSchema.parse(result.rows)),
        };
      })
    );
    await client.query("COMMIT");
    return snapshots;
  } finally {
    await client.end();
  }
};

const resultSchema = z.object({
  success: z.boolean(),
  result: z.array(
    z.object({
      success: z.boolean(),
      results: z.array(
        z.record(z.string(), z.union([z.string(), z.number(), z.null()]))
      ),
    })
  ),
});

const remoteTarget = (databaseId: string): MigrationTarget => {
  const accountId = z
    .string()
    .regex(/^[a-f\d]{32}$/u)
    .parse(process.env.CLOUDFLARE_ACCOUNT_ID);
  const token = z.string().min(1).parse(process.env.CLOUDFLARE_API_TOKEN);
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${z.uuid().parse(databaseId)}/query`;
  return {
    query: async (sql, params = []) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ sql, params }),
      });
      // Error bodies can echo SQL values, including authentication tokens.
      if (!response.ok) {
        throw new Error(
          `D1 request failed with HTTP ${response.status}; source data was not changed`
        );
      }
      const result = resultSchema.safeParse(await response.json());
      if (
        !result.success ||
        !result.data.success ||
        result.data.result.some((item) => !item.success)
      ) {
        throw new Error("D1 returned an unsuccessful query result");
      }
      return result.data.result.flatMap((item) => item.results);
    },
  };
};

const main = async () => {
  if (values.local === (values["database-id"] !== undefined)) {
    throw new Error(
      "Specify exactly one of --local or --database-id <D1 UUID>"
    );
  }
  const snapshots = await readSnapshot();
  if (values["database-id"] !== undefined) {
    const receipt = await transferSnapshot(
      snapshots,
      remoteTarget(values["database-id"])
    );
    process.stdout.write(
      `${JSON.stringify({ target: values["database-id"], verified: receipt }, null, 2)}\n`
    );
    return;
  }

  const { runtime, target } = await createLocalD1("migration-rehearsal");
  try {
    const receipt = await transferSnapshot(snapshots, target);
    process.stdout.write(
      `${JSON.stringify({ target: "ephemeral local D1", verified: receipt }, null, 2)}\n`
    );
  } finally {
    await runtime.dispose();
  }
};

try {
  await main();
} catch {
  // Keep source credentials, SQL parameters, and account data out of terminal logs.
  process.stderr.write(
    "Migration failed. No PostgreSQL data was changed. Verify the environment, source schema, and destination before retrying.\n"
  );
  process.exitCode = 1;
}

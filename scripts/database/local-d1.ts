import { readFile, readdir } from "node:fs/promises";

import { Miniflare } from "miniflare";

import type { MigrationTarget, SqlRow } from "./data-transfer";

export const createLocalD1 = async (name: string) => {
  const runtime = new Miniflare({
    workers: [
      {
        config: {
          name,
          compatibilityDate: "2026-09-23",
          manifest: {
            mainModule: "index.js",
            modules: {
              "index.js": {
                type: "esm",
                contents:
                  "export default { fetch() { return new Response('OK'); } };",
              },
            },
          },
          env: { DB: { type: "d1", id: name } },
        },
      },
    ],
  });
  try {
    const binding = await runtime.getD1Database("DB");
    const directory = new URL(
      "../../packages/api/migrations/",
      import.meta.url
    );
    const files = await readdir(directory);
    const migrations = await Promise.all(
      files
        .filter((file) => file.endsWith(".sql"))
        .toSorted()
        .map(async (file) => await readFile(new URL(file, directory), "utf-8"))
    );
    const statements = migrations.flatMap((sql) =>
      sql
        .split("--> statement-breakpoint")
        .filter((statement) => statement.trim() !== "")
        .map((statement) => binding.prepare(statement))
    );
    await binding.batch(statements);
    const target: MigrationTarget = {
      query: async (sql, params = []) => {
        const result = await binding
          .prepare(sql)
          .bind(...params)
          .all<SqlRow>();
        return result.results;
      },
    };
    return { binding, runtime, target };
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
};

import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for Codex cloud migrations.");
}

const migrationsFolder = fileURLToPath(
  new URL("../../packages/api/migrations", import.meta.url)
);
const sql = neon(databaseUrl);
const database = drizzle({ client: sql });

await migrate(database, { migrationsFolder });

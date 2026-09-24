import type { D1Database } from "@cloudflare/workers-types";
import * as schema from "@pcobooster/api/db/schema";
import { defineRelations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

// No joins are declared; this exposes every table to `db.query`.
const relations = defineRelations(schema);

export const createDatabase = (binding: D1Database) =>
  drizzle(binding, { relations });
export type Db = ReturnType<typeof createDatabase>;

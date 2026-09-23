import type { D1Database } from "@cloudflare/workers-types";
import * as schema from "@pcobooster/api/db/schema";
import { drizzle } from "drizzle-orm/d1";

export const createDatabase = (binding: D1Database) =>
  drizzle(binding, { schema });
export type Db = ReturnType<typeof createDatabase>;

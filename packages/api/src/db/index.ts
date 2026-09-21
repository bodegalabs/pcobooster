import { pool } from "@worship-admin/api/db/pool";
import * as schema from "@worship-admin/api/db/schema";
import { drizzle } from "drizzle-orm/node-postgres";

export const db = drizzle(pool, { schema });

export type Db = typeof db;

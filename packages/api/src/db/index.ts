import { pool } from "@pcobooster/api/db/pool";
import * as schema from "@pcobooster/api/db/schema";
import { drizzle } from "drizzle-orm/node-postgres";

export const db = drizzle(pool, { schema });

export type Db = typeof db;

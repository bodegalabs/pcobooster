import { drizzle } from "drizzle-orm/node-postgres";

import { pool } from "@/lib/db/pool";
import * as schema from "@/lib/db/schema";

export const db = drizzle(pool, { schema });

export type Db = typeof db;

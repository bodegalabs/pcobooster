import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!isNonEmptyString(databaseUrl)) {
  throw new Error("Missing DATABASE_URL environment variable");
}

const processGlobals = globalThis;
const cachedPool =
  "__planningCenterPgPool" in processGlobals
    ? processGlobals.__planningCenterPgPool
    : undefined;

export const pool =
  cachedPool instanceof Pool
    ? cachedPool
    : new Pool({
        connectionString: databaseUrl,
        max: 10,
      });

if (process.env.NODE_ENV !== "production") {
  Object.assign(processGlobals, { __planningCenterPgPool: pool });
}

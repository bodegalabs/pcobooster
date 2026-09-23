import { env } from "cloudflare:workers";

import { createDatabase } from "./client";

export const db = createDatabase(env.DB);
export type { Db } from "./client";

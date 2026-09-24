import type { D1Database } from "@cloudflare/workers-types";
import { createAuth } from "@pcobooster/api/auth";
import type { Auth } from "@pcobooster/api/auth";
import type { ServerConfig } from "@pcobooster/api/config/server-config";
import { createDatabase } from "@pcobooster/api/db/client";
import type { Db } from "@pcobooster/api/db/client";
import { Context } from "effect";

/** Built once per Worker isolate and shared by every request it serves. */
export interface ServerDependencies {
  readonly config: ServerConfig;
  readonly database: Db;
  readonly auth: Auth;
}

export class Server extends Context.Service<Server, ServerDependencies>()(
  "@pcobooster/api/Server"
) {}

export const createServerDependencies = (
  config: ServerConfig,
  binding: D1Database
): ServerDependencies => {
  const database = createDatabase(binding);
  return { config, database, auth: createAuth(config, database) };
};

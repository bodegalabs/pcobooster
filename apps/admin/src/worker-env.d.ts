/**
 * Bindings Alchemy gives the admin Worker (`alchemy.run.ts`). Declared here rather than by
 * loading `@cloudflare/workers-types` globally, whose `Request`/`Response` clash with the DOM lib.
 */
declare module "cloudflare:workers" {
  interface AdminWorkerEnv {
    /** The product's D1 database; the admin app reads account activity from it directly. */
    DB: WorkersD1Database;
    /** The Zero Trust team whose Access login every read requires; empty under `alchemy dev`. */
    ACCESS_TEAM_DOMAIN: string;
  }

  export const env: AdminWorkerEnv;
}

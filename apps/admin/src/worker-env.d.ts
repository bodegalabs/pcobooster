/**
 * Bindings Alchemy gives the admin Worker (`alchemy.run.ts`). Declared here rather than by
 * loading `@cloudflare/workers-types` globally, whose `Request`/`Response` clash with the DOM lib.
 */
declare module "cloudflare:workers" {
  interface AdminWorkerEnv {
    /** The product's D1 database; the admin app reads account activity from it directly. */
    DB: WorkersD1Database;
  }

  export const env: AdminWorkerEnv;
}

/**
 * Bindings Alchemy gives the admin Worker (`alchemy.run.ts`). Declared here rather than by
 * loading `@cloudflare/workers-types` globally, whose `Request`/`Response` clash with the DOM lib.
 */
declare module "cloudflare:workers" {
  interface AdminWorkerEnv {
    /** Service binding to the API Worker. */
    API: { fetch: (request: Request) => Promise<Response> };
    PRODUCT_ORIGIN: string;
  }

  export const env: AdminWorkerEnv;
}

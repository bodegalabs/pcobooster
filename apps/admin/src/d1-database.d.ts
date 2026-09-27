import type { D1Database } from "@cloudflare/workers-types";

/**
 * The D1 binding type, made global so `worker-env.d.ts` can stay an ambient module declaration
 * (an import there would turn it into an augmentation of a module nothing else declares).
 */
declare global {
  type WorkersD1Database = D1Database;
}

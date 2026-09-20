import { os } from "@orpc/server";
import { z } from "zod";

/**
 * Temporary transport-level router. Domain procedures should move into
 * `packages/api` as the REST endpoints are converted to oRPC procedures.
 */
export const appRouter = os.router({
  health: os
    .input(z.object({}).optional())
    .handler(() => ({ status: "ok" as const })),
});

export type AppRouter = typeof appRouter;

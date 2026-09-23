import { oc } from "@orpc/contract";
import { applicationErrorMap } from "@pcobooster/contracts/errors";
import { z } from "zod";

/** Holds a key-derived token, never the demo link key itself. */
export const DEMO_SESSION_COOKIE = "pcobooster-demo";

export const demoStartInputSchema = z.object({
  key: z.string().trim().min(1).max(256),
});
export const demoExitInputSchema = z.object({});
export const demoSessionSchema = z.object({ demo: z.boolean() });

export const demoContract = {
  start: oc
    .errors({
      NOT_FOUND: applicationErrorMap.NOT_FOUND,
      INTERNAL_SERVER_ERROR: applicationErrorMap.INTERNAL_SERVER_ERROR,
    })
    .route({
      method: "POST",
      path: "/demo/start",
      summary: "Start a read-only demo session from a demo link key",
    })
    .input(demoStartInputSchema)
    .output(demoSessionSchema),
  exit: oc
    .errors({
      INTERNAL_SERVER_ERROR: applicationErrorMap.INTERNAL_SERVER_ERROR,
    })
    .route({
      method: "POST",
      path: "/demo/exit",
      summary: "End the current demo session",
    })
    .input(demoExitInputSchema)
    .output(demoSessionSchema),
};

export type DemoStartInput = z.input<typeof demoStartInputSchema>;

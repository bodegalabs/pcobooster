import { z } from "zod";

/** Holds a key-derived token, never the demo link key itself. */
export const DEMO_SESSION_COOKIE = "pcobooster-demo";

export const demoStartInputSchema = z.object({
  key: z.string().trim().min(1).max(256),
});
export const demoExitInputSchema = z.object({});
export const demoSessionSchema = z.object({ demo: z.boolean() });

export type DemoStartInput = z.input<typeof demoStartInputSchema>;

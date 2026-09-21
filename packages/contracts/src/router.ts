import { oc } from "@orpc/contract";
import { z } from "zod";

const healthInputSchema = z.object({});
const healthOutputSchema = z.object({ status: z.literal("ok") });

export const healthContract = oc
  .route({
    method: "GET",
    path: "/health",
    summary: "Report API health",
  })
  .input(healthInputSchema)
  .output(healthOutputSchema);

export const appContract = oc.router({
  health: healthContract,
});

export type AppContract = typeof appContract;
export type HealthInput = z.input<typeof healthInputSchema>;
export type HealthOutput = z.output<typeof healthOutputSchema>;

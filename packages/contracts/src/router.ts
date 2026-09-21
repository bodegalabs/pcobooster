import { oc } from "@orpc/contract";
import { accountsContract } from "@worship-admin/contracts/accounts";
import { adminContract } from "@worship-admin/contracts/admin";
import { catalogContract } from "@worship-admin/contracts/catalog";
import { featuresContract } from "@worship-admin/contracts/features";
import { peopleContract } from "@worship-admin/contracts/people";
import { sessionContract } from "@worship-admin/contracts/session";
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
  accounts: accountsContract,
  admin: adminContract,
  catalog: catalogContract,
  features: featuresContract,
  health: healthContract,
  people: peopleContract,
  session: sessionContract,
});

export type AppContract = typeof appContract;
export type HealthInput = z.input<typeof healthInputSchema>;
export type HealthOutput = z.output<typeof healthOutputSchema>;

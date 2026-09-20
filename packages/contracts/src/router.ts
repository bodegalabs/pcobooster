import { oc } from "@orpc/contract";
import { accountsContract } from "@worship-admin/contracts/accounts";
import { adminContract } from "@worship-admin/contracts/admin";
import { catalogContract } from "@worship-admin/contracts/catalog";
import { featuresContract } from "@worship-admin/contracts/features";
import { peopleContract } from "@worship-admin/contracts/people";
import { planItemsContract } from "@worship-admin/contracts/plan-items";
import { planPeopleContract } from "@worship-admin/contracts/plan-people";
import { planTimesContract } from "@worship-admin/contracts/plan-times";
import { scheduleContract } from "@worship-admin/contracts/schedule";
import { sessionContract } from "@worship-admin/contracts/session";
import { songsContract } from "@worship-admin/contracts/songs";
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
  planItems: planItemsContract,
  planPeople: planPeopleContract,
  planTimes: planTimesContract,
  schedule: scheduleContract,
  session: sessionContract,
  songs: songsContract,
});

export type AppContract = typeof appContract;
export type HealthInput = z.input<typeof healthInputSchema>;
export type HealthOutput = z.output<typeof healthOutputSchema>;

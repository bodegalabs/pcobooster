import { SERVICES_PERMISSION_LEVELS } from "@pcobooster/planning-center-models/access";
import { z } from "zod";

const servicesLevelSchema = z.enum(SERVICES_PERMISSION_LEVELS).nullable();

export const servicesAccessSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("none") }),
  z.object({
    status: z.literal("granted"),
    organizationAdministrator: z.boolean(),
    planLevel: servicesLevelSchema,
    maxPlanLevel: servicesLevelSchema,
    songLevel: servicesLevelSchema,
    canViewAllPeople: z.boolean(),
    ledTeamCount: z.number().int().nonnegative(),
    serviceTypes: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        level: servicesLevelSchema,
      })
    ),
  }),
]);

export const peopleAccessSchema = z.object({
  status: z.enum(["none", "granted"]),
});

export const accessSnapshotSchema = z.object({
  services: servicesAccessSchema,
  people: peopleAccessSchema,
});

export const accessInputSchema = z.object({});

export type AccessSnapshot = z.output<typeof accessSnapshotSchema>;

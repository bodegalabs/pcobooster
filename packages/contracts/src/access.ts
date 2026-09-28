import { oc } from "@orpc/contract";
import { applicationErrorMap } from "@pcobooster/contracts/errors";
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

const accessProcedure = oc.errors({
  UNAUTHORIZED: applicationErrorMap.UNAUTHORIZED,
  FORBIDDEN: applicationErrorMap.FORBIDDEN,
  TOO_MANY_REQUESTS: applicationErrorMap.TOO_MANY_REQUESTS,
  BAD_GATEWAY: applicationErrorMap.BAD_GATEWAY,
  INTERNAL_SERVER_ERROR: applicationErrorMap.INTERNAL_SERVER_ERROR,
});

export const accessContract = {
  me: accessProcedure
    .route({
      method: "GET",
      path: "/access",
      summary:
        "Read the signed-in person's Planning Center permissions in Services and People",
    })
    .input(accessInputSchema)
    .output(accessSnapshotSchema),
};

export type AccessSnapshot = z.output<typeof accessSnapshotSchema>;

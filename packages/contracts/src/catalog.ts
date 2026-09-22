import { oc } from "@orpc/contract";
import { applicationErrorMap } from "@pcobooster/contracts/errors";
import { z } from "zod";

export const serviceTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  sequence: z.number(),
});

export const planSchema = z.object({
  id: z.string(),
  title: z.string(),
  seriesTitle: z.string().optional(),
  seriesId: z.string().nullable().optional(),
  planningCenterUrl: z.string().nullable().optional(),
  createdAt: z.date(),
  sortDate: z.date().optional(),
});

export const filledPositionPersonSchema = z.object({
  id: z.string(),
  planPersonId: z.string(),
  personId: z.string().nullable().optional(),
  name: z.string(),
  status: z.enum(["pending", "confirmed"]),
  rawStatus: z.string(),
  photoThumbnailUrl: z.string().nullable().optional(),
  assignedTimeIds: z.array(z.string()).optional(),
  serviceTimeIds: z.array(z.string()).optional(),
});

export const teamPositionSchema = z.object({
  id: z.string(),
  name: z.string(),
  teamId: z.string(),
  teamName: z.string().optional(),
  source: z
    .enum(["team_position", "needed_position", "plan_member", "custom"])
    .optional(),
  neededPositionId: z.string().optional(),
  timeId: z.string().nullable().optional(),
  timePreferenceOptionId: z.string().nullable().optional(),
  neededCount: z.number().optional(),
  filledPendingCount: z.number().optional(),
  filledConfirmedCount: z.number().optional(),
  filledPeople: z.array(filledPositionPersonSchema).optional(),
});

export const teamPositionGroupSchema = z.object({
  teamId: z.string(),
  teamName: z.string(),
  positions: z.array(teamPositionSchema),
});

export const serviceTypesInputSchema = z.object({});
export const plansInputSchema = z.object({
  serviceTypeId: z.string().trim().min(1),
});
export const organizationInputSchema = z.object({});
export const teamPositionsInputSchema = plansInputSchema.extend({
  planId: z.string().trim().min(1),
  seriesId: z.string().trim().min(1).optional(),
});

export const serviceTypesOutputSchema = z.array(serviceTypeSchema);
export const plansOutputSchema = z.array(planSchema);
export const organizationOutputSchema = z.object({ timeZone: z.string() });
export const teamPositionsOutputSchema = z.array(teamPositionGroupSchema);

const catalogProcedure = oc.errors({
  UNAUTHORIZED: applicationErrorMap.UNAUTHORIZED,
  FORBIDDEN: applicationErrorMap.FORBIDDEN,
  TOO_MANY_REQUESTS: applicationErrorMap.TOO_MANY_REQUESTS,
  BAD_GATEWAY: applicationErrorMap.BAD_GATEWAY,
  INTERNAL_SERVER_ERROR: applicationErrorMap.INTERNAL_SERVER_ERROR,
});

export const catalogContract = {
  serviceTypes: catalogProcedure
    .route({
      method: "GET",
      path: "/catalog/service-types",
      summary: "List active service types",
    })
    .input(serviceTypesInputSchema)
    .output(serviceTypesOutputSchema),
  plans: catalogProcedure
    .route({
      method: "GET",
      path: "/catalog/plans",
      summary: "List upcoming plans for a service type",
    })
    .input(plansInputSchema)
    .output(plansOutputSchema),
  organization: catalogProcedure
    .route({
      method: "GET",
      path: "/catalog/organization",
      summary: "Get the organization calendar time zone",
    })
    .input(organizationInputSchema)
    .output(organizationOutputSchema),
  teamPositions: catalogProcedure
    .route({
      method: "GET",
      path: "/catalog/team-positions",
      summary: "List plan positions and their scheduled people",
    })
    .input(teamPositionsInputSchema)
    .output(teamPositionsOutputSchema),
};

export type ServiceType = z.output<typeof serviceTypeSchema>;
export type Plan = z.output<typeof planSchema>;
export type FilledPositionPerson = z.output<typeof filledPositionPersonSchema>;
export type TeamPosition = z.output<typeof teamPositionSchema>;
export type TeamPositionGroup = z.output<typeof teamPositionGroupSchema>;
export type PlansInput = z.input<typeof plansInputSchema>;
export type TeamPositionsInput = z.input<typeof teamPositionsInputSchema>;

import { oc } from "@orpc/contract";
import { applicationErrorMap } from "@pcobooster/contracts/errors";
import {
  planTimeSchema,
  planTimeTypeSchema,
} from "@pcobooster/contracts/plan-time-schemas";
import { z } from "zod";

const requiredId = z.string().trim().min(1);

export const planTimesListInputSchema = z.object({
  serviceTypeId: requiredId,
  planId: requiredId,
});

export const planTimesCreateInputSchema = planTimesListInputSchema.extend({
  name: z.string().trim().optional(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable().optional(),
  timeType: planTimeTypeSchema,
  assignedTeamIds: z.array(requiredId).optional(),
  assignedPositionIds: z.array(requiredId).optional(),
});

export const planTimesUpdateInputSchema = planTimesListInputSchema.extend({
  planTimeId: requiredId,
  name: z.string().trim().optional(),
  startsAt: z.iso.datetime().optional(),
  endsAt: z.iso.datetime().nullable().optional(),
  timeType: planTimeTypeSchema.optional(),
  assignedTeamIds: z.array(requiredId).optional(),
  assignedPositionIds: z.array(requiredId).optional(),
  assignedNeededPositionIds: z.array(requiredId).optional(),
  clearedNeededPositionIds: z.array(requiredId).optional(),
  assignedPlanPersonIds: z.array(requiredId).optional(),
  clearedPlanPersonIds: z.array(requiredId).optional(),
});

export const planTimesDeleteInputSchema = planTimesListInputSchema.extend({
  planTimeId: requiredId,
});

export const planTimesListOutputSchema = z.array(planTimeSchema);
export const planTimesDeleteOutputSchema = z.void();

const planTimesProcedure = oc.errors({
  UNAUTHORIZED: applicationErrorMap.UNAUTHORIZED,
  FORBIDDEN: applicationErrorMap.FORBIDDEN,
  TOO_MANY_REQUESTS: applicationErrorMap.TOO_MANY_REQUESTS,
  BAD_GATEWAY: applicationErrorMap.BAD_GATEWAY,
  INTERNAL_SERVER_ERROR: applicationErrorMap.INTERNAL_SERVER_ERROR,
});

export const planTimesContract = {
  list: planTimesProcedure
    .route({
      method: "GET",
      path: "/plans/{planId}/times",
      summary: "List a plan's service and rehearsal times",
    })
    .input(planTimesListInputSchema)
    .output(planTimesListOutputSchema),
  create: planTimesProcedure
    .route({
      method: "POST",
      path: "/plans/{planId}/times",
      summary: "Create a plan time",
    })
    .input(planTimesCreateInputSchema)
    .output(planTimeSchema),
  update: planTimesProcedure
    .route({
      method: "PATCH",
      path: "/plan-times/{planTimeId}",
      summary: "Update a plan time and its assignments",
    })
    .input(planTimesUpdateInputSchema)
    .output(planTimeSchema),
  delete: planTimesProcedure
    .route({
      method: "DELETE",
      path: "/plan-times/{planTimeId}",
      successStatus: 204,
      summary: "Delete a plan time",
    })
    .input(planTimesDeleteInputSchema)
    .output(planTimesDeleteOutputSchema),
};

export type PlanTimesListInput = z.input<typeof planTimesListInputSchema>;
export type PlanTimesCreateInput = z.input<typeof planTimesCreateInputSchema>;
export type PlanTimesUpdateInput = z.input<typeof planTimesUpdateInputSchema>;
export type PlanTimesDeleteInput = z.input<typeof planTimesDeleteInputSchema>;

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

export type PlanTimesListInput = z.input<typeof planTimesListInputSchema>;
export type PlanTimesCreateInput = z.input<typeof planTimesCreateInputSchema>;
export type PlanTimesUpdateInput = z.input<typeof planTimesUpdateInputSchema>;
export type PlanTimesDeleteInput = z.input<typeof planTimesDeleteInputSchema>;

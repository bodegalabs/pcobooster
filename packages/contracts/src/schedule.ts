import { z } from "zod";

const requiredId = z.string().trim().min(1);
const optionalId = requiredId.optional();

export const scheduleAssignInputSchema = z.object({
  serviceTypeId: requiredId,
  personId: requiredId,
  planId: requiredId,
  teamId: requiredId,
  positionId: requiredId,
  teamName: requiredId.optional(),
  positionName: requiredId.optional(),
  oneOff: z.boolean().default(false),
});

export const scheduleRemoveInputSchema = z.object({
  planPersonId: requiredId,
  serviceTypeId: optionalId,
  personId: optionalId,
  planId: optionalId,
});

export const scheduleUpdateStatusInputSchema = z.object({
  planPersonId: requiredId,
  status: z.enum(["C", "U", "D"]),
  serviceTypeId: optionalId,
  personId: optionalId,
  planId: optionalId,
});

export const scheduleAssignOutputSchema = z.object({
  success: z.literal(true),
  data: z.object({ id: requiredId }),
});

export const scheduleMutationOutputSchema = z.object({
  success: z.literal(true),
});

export type ScheduleAssignInput = z.input<typeof scheduleAssignInputSchema>;
export type ScheduleRemoveInput = z.input<typeof scheduleRemoveInputSchema>;
export type ScheduleUpdateStatusInput = z.input<
  typeof scheduleUpdateStatusInputSchema
>;
export type ScheduleAssignOutput = z.output<typeof scheduleAssignOutputSchema>;
export type ScheduleMutationOutput = z.output<
  typeof scheduleMutationOutputSchema
>;

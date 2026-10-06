import { z } from "zod";

const requiredId = z.string().trim().min(1);

export const planPeopleUpdateTimesInputSchema = z.object({
  serviceTypeId: requiredId,
  planId: requiredId,
  personId: requiredId,
  planPersonId: requiredId,
  planTimeIds: z.array(requiredId),
});

export const planPeopleUpdateTimesOutputSchema = z.object({
  ok: z.literal(true),
});

export type PlanPeopleUpdateTimesInput = z.input<
  typeof planPeopleUpdateTimesInputSchema
>;

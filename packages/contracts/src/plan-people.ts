import { oc } from "@orpc/contract";
import { applicationErrorMap } from "@pcobooster/contracts/errors";
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

export const planPeopleContract = {
  updateTimes: oc
    .errors({
      UNAUTHORIZED: applicationErrorMap.UNAUTHORIZED,
      FORBIDDEN: applicationErrorMap.FORBIDDEN,
      TOO_MANY_REQUESTS: applicationErrorMap.TOO_MANY_REQUESTS,
      BAD_GATEWAY: applicationErrorMap.BAD_GATEWAY,
      INTERNAL_SERVER_ERROR: applicationErrorMap.INTERNAL_SERVER_ERROR,
    })
    .route({
      method: "PATCH",
      path: "/plan-people/{planPersonId}/times",
      summary: "Replace a person's assigned plan times",
    })
    .input(planPeopleUpdateTimesInputSchema)
    .output(planPeopleUpdateTimesOutputSchema),
};

export type PlanPeopleUpdateTimesInput = z.input<
  typeof planPeopleUpdateTimesInputSchema
>;

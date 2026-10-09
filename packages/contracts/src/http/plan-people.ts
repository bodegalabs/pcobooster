/** Which of the plan's times each scheduled person serves. */
import { write } from "@pcobooster/contracts/http/endpoint";
import { planningCenterGroup } from "@pcobooster/contracts/http/group";
import { mutableArray, requiredId } from "@pcobooster/contracts/http/schema";
import { Schema, Struct } from "effect";

export const planPeopleUpdateTimesInputSchema = Schema.Struct({
  serviceTypeId: requiredId,
  planId: requiredId,
  personId: requiredId,
  planPersonId: requiredId,
  planTimeIds: mutableArray(requiredId),
});

const PLAN_PERSON = ["serviceTypeId", "planId", "planPersonId"] as const;

export const planPeople = planningCenterGroup(
  "planPeople",
  /** Sets the person's times to exactly `planTimeIds`. */
  write.put(
    "updateTimes",
    "/service-types/:serviceTypeId/plans/:planId/people/:planPersonId/times",
    {
      params: Struct.pick(planPeopleUpdateTimesInputSchema.fields, PLAN_PERSON),
      payload: Struct.omit(
        planPeopleUpdateTimesInputSchema.fields,
        PLAN_PERSON
      ),
      success: Schema.Struct({ ok: Schema.Literal(true) }),
    }
  )
);

export type PlanPeopleUpdateTimesInput =
  typeof planPeopleUpdateTimesInputSchema.Type;

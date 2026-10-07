/** Scheduling people: every write here is audited in D1 with its real outcome. */
import { write } from "@pcobooster/contracts/http/endpoint";
import { planningCenterGroup } from "@pcobooster/contracts/http/group";
import { requiredId } from "@pcobooster/contracts/http/schema";
import { Struct, Effect, Schema } from "effect";

export const scheduleAssignInputSchema = Schema.Struct({
  serviceTypeId: requiredId,
  personId: requiredId,
  planId: requiredId,
  teamId: requiredId,
  positionId: requiredId,
  teamName: Schema.optional(requiredId),
  positionName: Schema.optional(requiredId),
  /** `z.boolean().default(false)`: optional on the wire and when a client builds the input. */
  oneOff: Schema.Boolean.pipe(
    Schema.withDecodingDefault(Effect.succeed(false)),
    Schema.withConstructorDefault(Effect.succeed(false))
  ),
});
export type ScheduleAssignInput = typeof scheduleAssignInputSchema.Type;

export const scheduleAssignOutputSchema = Schema.Struct({
  success: Schema.Literal(true),
  data: Schema.Struct({ id: requiredId }),
});
export type ScheduleAssignOutput = typeof scheduleAssignOutputSchema.Type;

/**
 * Who a removal or status change is about. The plan person is required; the rest is optional
 * context that picks the Planning Center path the write uses, which cached reads it refreshes,
 * and what the audit row records.
 */
const scheduleTargetFields = {
  planPersonId: requiredId,
  serviceTypeId: Schema.optional(requiredId),
  personId: Schema.optional(requiredId),
  planId: Schema.optional(requiredId),
};

export const scheduleRemoveInputSchema = Schema.Struct(scheduleTargetFields);
export type ScheduleRemoveInput = typeof scheduleRemoveInputSchema.Type;

export const scheduleUpdateStatusInputSchema = Schema.Struct({
  ...scheduleTargetFields,
  status: Schema.Literals(["C", "U", "D"]),
});
export type ScheduleUpdateStatusInput =
  typeof scheduleUpdateStatusInputSchema.Type;

export const scheduleMutationOutputSchema = Schema.Struct({
  success: Schema.Literal(true),
});

const PLAN = ["serviceTypeId", "planId"] as const;
const PLAN_PERSON = ["planPersonId"] as const;

export const schedule = planningCenterGroup(
  "schedule",
  /** An audited prepared write: the position check may stop; the create always finishes. */
  write.post(
    "assign",
    "/service-types/:serviceTypeId/plans/:planId/team-members",
    {
      params: Struct.pick(scheduleAssignInputSchema.fields, PLAN),
      payload: Struct.omit(scheduleAssignInputSchema.fields, PLAN),
      success: scheduleAssignOutputSchema,
    }
  ),
  /**
   * An audited write. The optional context (service type, person, plan) is more than audit
   * detail: it selects the upstream paths the removal uses and the caches it invalidates.
   */
  write.delete("remove", "/plan-people/:planPersonId", {
    params: Struct.pick(scheduleRemoveInputSchema.fields, PLAN_PERSON),
    query: Struct.omit(scheduleRemoveInputSchema.fields, PLAN_PERSON),
    success: scheduleMutationOutputSchema,
  }),
  /** An audited write, with the same optional context as `schedule.remove`. */
  write.patch("updateStatus", "/plan-people/:planPersonId", {
    params: Struct.pick(scheduleUpdateStatusInputSchema.fields, PLAN_PERSON),
    payload: Struct.omit(scheduleUpdateStatusInputSchema.fields, PLAN_PERSON),
    success: scheduleMutationOutputSchema,
  })
);

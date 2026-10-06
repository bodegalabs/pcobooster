/** Scheduling people: every write here is audited in D1 with its real outcome. */
import { write } from "@pcobooster/contracts/http/endpoint";
import { planningCenterGroup } from "@pcobooster/contracts/http/group";
import {
  scheduleAssignInputSchema,
  scheduleAssignOutputSchema,
  scheduleMutationOutputSchema,
  scheduleRemoveInputSchema,
  scheduleUpdateStatusInputSchema,
} from "@pcobooster/contracts/rpc/schedule";
import { Struct } from "effect";

const PLAN = ["serviceTypeId", "planId"] as const;
const PLAN_PERSON = ["planPersonId"] as const;

export const schedule = planningCenterGroup(
  "schedule",
  /** An audited prepared write: the position check may stop; the create always finishes. */
  write.post(
    "schedule.assign",
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
  write.delete("schedule.remove", "/plan-people/:planPersonId", {
    params: Struct.pick(scheduleRemoveInputSchema.fields, PLAN_PERSON),
    query: Struct.omit(scheduleRemoveInputSchema.fields, PLAN_PERSON),
    success: scheduleMutationOutputSchema,
  }),
  /** An audited write, with the same optional context as `schedule.remove`. */
  write.patch("schedule.updateStatus", "/plan-people/:planPersonId", {
    params: Struct.pick(scheduleUpdateStatusInputSchema.fields, PLAN_PERSON),
    payload: Struct.omit(scheduleUpdateStatusInputSchema.fields, PLAN_PERSON),
    success: scheduleMutationOutputSchema,
  })
);

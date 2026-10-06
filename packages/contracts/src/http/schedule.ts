/** Schedule endpoints. Spike scope: the audited status change only. */
import { write } from "@pcobooster/contracts/http/endpoint";
import { PlanningCenterSession } from "@pcobooster/contracts/http/planning-center-session";
import { ProcedureScope } from "@pcobooster/contracts/http/procedure-scope";
import {
  scheduleMutationOutputSchema,
  scheduleUpdateStatusInputSchema,
} from "@pcobooster/contracts/rpc/schedule";
import { Struct } from "effect";
import { HttpApiGroup } from "effect/unstable/httpapi";

/** An audited write: the plan person's status in Planning Center. */
export const scheduleUpdateStatus = write.patch(
  "updateStatus",
  "/plan-people/:planPersonId",
  {
    params: Struct.pick(scheduleUpdateStatusInputSchema.fields, [
      "planPersonId",
    ]),
    payload: Struct.omit(scheduleUpdateStatusInputSchema.fields, [
      "planPersonId",
    ]),
    success: scheduleMutationOutputSchema,
  }
);

export const scheduleApi = HttpApiGroup.make("schedule")
  .add(scheduleUpdateStatus.endpoint)
  .middleware(PlanningCenterSession)
  .middleware(ProcedureScope);

export const scheduleWireApi = HttpApiGroup.make("schedule")
  .add(scheduleUpdateStatus.wire)
  .middleware(PlanningCenterSession)
  .middleware(ProcedureScope);

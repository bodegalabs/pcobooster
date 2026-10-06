/** People endpoints. Spike scope: the paginated plan-window history only. */
import { read } from "@pcobooster/contracts/http/endpoint";
import { PlanningCenterSession } from "@pcobooster/contracts/http/planning-center-session";
import { ProcedureScope } from "@pcobooster/contracts/http/procedure-scope";
import { peoplePlanWindowHistoryInputSchema } from "@pcobooster/contracts/rpc/people";
import { planWindowHistoryBatchSchema } from "@pcobooster/contracts/rpc/people-schemas";
import { HttpApiGroup } from "effect/unstable/httpapi";

/**
 * Partial with a continuation cursor: pass `deferredPlans` and `deferredServiceTypeIds` back as
 * `continuation`, which travels as one JSON query param.
 */
export const peoplePlanWindowHistory = read(
  "planWindowHistory",
  "/people/plan-window-history",
  {
    params: {},
    query: peoplePlanWindowHistoryInputSchema.fields,
    success: planWindowHistoryBatchSchema,
  }
);

export const peopleApi = HttpApiGroup.make("people")
  .add(peoplePlanWindowHistory.endpoint)
  .middleware(PlanningCenterSession)
  .middleware(ProcedureScope);

export const peopleWireApi = HttpApiGroup.make("people")
  .add(peoplePlanWindowHistory.wire)
  .middleware(PlanningCenterSession)
  .middleware(ProcedureScope);

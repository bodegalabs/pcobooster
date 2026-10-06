/** Plan people procedures over Effect RPC. Ported from the zod schemas in `../plan-people.ts`. */
import { planningCenterGroup } from "@pcobooster/contracts/rpc/group";
import { write } from "@pcobooster/contracts/rpc/procedure";
import { mutableArray, requiredId } from "@pcobooster/contracts/rpc/schema";
import { Schema } from "effect";

export const planPeopleUpdateTimesInputSchema = Schema.Struct({
  serviceTypeId: requiredId,
  planId: requiredId,
  personId: requiredId,
  planPersonId: requiredId,
  planTimeIds: mutableArray(requiredId),
});

export const planPeopleUpdateTimes = write("planPeople.updateTimes", {
  payload: planPeopleUpdateTimesInputSchema,
  success: Schema.Struct({ ok: Schema.Literal(true) }),
});

export const planPeopleProcedures = [planPeopleUpdateTimes] as const;
export const planPeopleRpc = planningCenterGroup(...planPeopleProcedures);

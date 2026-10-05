import { RpcError } from "@pcobooster/contracts/errors";
import { Schema, Struct } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

const requiredId = Schema.Trim.check(Schema.isMinLength(1));

export const planPeopleUpdateTimesInputSchema = Schema.Struct({
  serviceTypeId: requiredId,
  planId: requiredId,
  personId: requiredId,
  planPersonId: requiredId,
  planTimeIds: Schema.mutable(Schema.Array(requiredId)),
}).mapFields(Struct.map(Schema.mutableKey));

export const planPeopleUpdateTimesOutputSchema = Schema.Struct({
  ok: Schema.Literal(true),
}).mapFields(Struct.map(Schema.mutableKey));

export const planPeopleRpc = RpcGroup.make(
  Rpc.make("planPeople.updateTimes", {
    payload: planPeopleUpdateTimesInputSchema,
    success: planPeopleUpdateTimesOutputSchema,
    error: RpcError,
  })
);

export type PlanPeopleUpdateTimesInput =
  typeof planPeopleUpdateTimesInputSchema.Encoded;

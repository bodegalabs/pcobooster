import { RpcError } from "@pcobooster/contracts/errors";
import { Schema, Struct } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

const requiredId = Schema.Trim.check(Schema.isMinLength(1));

export const neededPositionsAdjustInputSchema = Schema.Struct({
  serviceTypeId: requiredId,
  planId: requiredId,
  teamId: requiredId,
  positionName: Schema.Trim.check(Schema.isMinLength(1)),
  change: Schema.Literals(["add", "remove"]),
}).mapFields(Struct.map(Schema.mutableKey));

/** The position's open slots after the change; unchanged when it had no open-slot record. */
export const neededPositionsAdjustOutputSchema = Schema.Struct({
  openCount: Schema.Finite.check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
}).mapFields(Struct.map(Schema.mutableKey));

export const neededPositionsRpc = RpcGroup.make(
  Rpc.make("neededPositions.adjust", {
    payload: neededPositionsAdjustInputSchema,
    success: neededPositionsAdjustOutputSchema,
    error: RpcError,
  })
);

export type NeededPositionsAdjustInput =
  typeof neededPositionsAdjustInputSchema.Encoded;

import { RpcError } from "@pcobooster/contracts/errors";
import { Schema, Struct } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

export const sessionStatusInputSchema = Schema.Struct({}).mapFields(
  Struct.map(Schema.mutableKey)
);

export const sessionStatusSchema = Schema.Struct({
  authenticated: Schema.Boolean,
}).mapFields(Struct.map(Schema.mutableKey));

export const sessionRpc = RpcGroup.make(
  Rpc.make("session.status", {
    payload: sessionStatusInputSchema,
    success: sessionStatusSchema,
    error: RpcError,
  })
);

export type SessionStatus = typeof sessionStatusSchema.Type;

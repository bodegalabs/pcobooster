import { RpcError } from "@pcobooster/contracts/errors";
import { Schema, Struct } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

/** Holds a key-derived token, never the demo link key itself. */
export const DEMO_SESSION_COOKIE = "pcobooster-demo";

export const demoStartInputSchema = Schema.Struct({
  key: Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(256)),
}).mapFields(Struct.map(Schema.mutableKey));

export const demoExitInputSchema = Schema.Struct({}).mapFields(
  Struct.map(Schema.mutableKey)
);

export const demoSessionSchema = Schema.Struct({
  demo: Schema.Boolean,
}).mapFields(Struct.map(Schema.mutableKey));

export const demoStartOutputSchema = Schema.Struct({
  ...demoSessionSchema.fields,
  sessionToken: Schema.optional(Schema.String),
}).mapFields(Struct.map(Schema.mutableKey));

export const demoRpc = RpcGroup.make(
  Rpc.make("demo.start", {
    payload: demoStartInputSchema,
    success: demoStartOutputSchema,
    error: RpcError,
  }),
  Rpc.make("demo.exit", {
    payload: demoExitInputSchema,
    success: demoSessionSchema,
    error: RpcError,
  })
);

export type DemoStartInput = typeof demoStartInputSchema.Encoded;

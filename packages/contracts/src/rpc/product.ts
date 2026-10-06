/**
 * Every product procedure over Effect RPC. Web, SSR, Expo, the deploy check, and the API Worker
 * all use this one value. `ProcedureScope` is added last, so it wraps every other middleware.
 * A namespace merged here without its handler layer on the server is a type error.
 */
import { catalogPlan, catalogRpc } from "@pcobooster/contracts/rpc/catalog";
import { plainGroup } from "@pcobooster/contracts/rpc/group";
import { read } from "@pcobooster/contracts/rpc/procedure";
import {
  scheduleAssign,
  scheduleRpc,
} from "@pcobooster/contracts/rpc/schedule";
import { Schema } from "effect";
import { RpcGroup } from "effect/unstable/rpc";

export const healthOutputSchema = Schema.Struct({
  status: Schema.Literal("ok"),
  version: Schema.String,
});

/** Liveness through the whole RPC stack; the deploy check reads `version`. */
export const health = read("health", {
  payload: Schema.Struct({}),
  success: healthOutputSchema,
});

export const healthRpc = plainGroup(health);

export const ProductRpc = RpcGroup.make().merge(
  healthRpc,
  catalogRpc,
  scheduleRpc
);

export type ProductRpcs = RpcGroup.Rpcs<typeof ProductRpc>;
export type ProcedureTag = ProductRpcs["_tag"];

/** Each declaration, before groups add middleware, so its `kind` is still visible to types. */
const declarations = [health, catalogPlan, scheduleAssign] as const;
type Declaration = (typeof declarations)[number];

/** Tags of `read` procedures: the only ones a caller may send at speculative priority. */
export type ReadProcedureTag = Extract<Declaration, { kind: "read" }>["_tag"];

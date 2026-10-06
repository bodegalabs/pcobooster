import { accessProcedures, accessRpc } from "@pcobooster/contracts/rpc/access";
/**
 * Every product procedure over Effect RPC. Web, SSR, Expo, the deploy check, and the API Worker
 * all use this one value. Each namespace is declared with `planningCenterGroup` or `plainGroup`,
 * so `ProcedureScope` wraps every other middleware. A namespace merged here without its handler
 * layer on the server is a type error; `parity.test.ts` checks the procedures against main's.
 */
import {
  accountsProcedures,
  accountsRpc,
} from "@pcobooster/contracts/rpc/accounts";
import {
  catalogProcedures,
  catalogRpc,
} from "@pcobooster/contracts/rpc/catalog";
import { demoProcedures, demoRpc } from "@pcobooster/contracts/rpc/demo";
import {
  featuresProcedures,
  featuresRpc,
} from "@pcobooster/contracts/rpc/features";
import {
  feedbackProcedures,
  feedbackRpc,
} from "@pcobooster/contracts/rpc/feedback";
import { plainGroup } from "@pcobooster/contracts/rpc/group";
import { read } from "@pcobooster/contracts/rpc/procedure";
import {
  scheduleAssign,
  scheduleRpc,
} from "@pcobooster/contracts/rpc/schedule";
import {
  sessionProcedures,
  sessionRpc,
} from "@pcobooster/contracts/rpc/session";
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
  sessionRpc,
  accountsRpc,
  featuresRpc,
  demoRpc,
  feedbackRpc,
  accessRpc,
  catalogRpc,
  scheduleRpc
);

export type ProductRpcs = RpcGroup.Rpcs<typeof ProductRpc>;
export type ProcedureTag = ProductRpcs["_tag"];

/** Each declaration, before groups add middleware, so its `kind` is still visible to types. */
const declarations = [
  health,
  ...sessionProcedures,
  ...accountsProcedures,
  ...featuresProcedures,
  ...demoProcedures,
  ...feedbackProcedures,
  ...accessProcedures,
  ...catalogProcedures,
  scheduleAssign,
] as const;
type Declaration = (typeof declarations)[number];

/** Tags of `read` procedures: the only ones a caller may send at speculative priority. */
export type ReadProcedureTag = Extract<Declaration, { kind: "read" }>["_tag"];

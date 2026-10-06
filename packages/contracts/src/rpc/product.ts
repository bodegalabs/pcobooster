/**
 * Every product procedure over Effect RPC. Web, SSR, Expo, the deploy check, and the API Worker
 * all use this one value. Each namespace is declared with `planningCenterGroup` or `plainGroup`,
 * so `ProcedureScope` wraps every other middleware. A namespace merged here without its handler
 * layer on the server is a type error; `parity.test.ts` checks the procedures against main's.
 */
import { accessProcedures, accessRpc } from "@pcobooster/contracts/rpc/access";
import {
  accountsProcedures,
  accountsRpc,
} from "@pcobooster/contracts/rpc/accounts";
import {
  catalogProcedures,
  catalogRpc,
} from "@pcobooster/contracts/rpc/catalog";
import {
  chordChartsProcedures,
  chordChartsRpc,
} from "@pcobooster/contracts/rpc/chord-charts";
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
import {
  neededPositionsProcedures,
  neededPositionsRpc,
} from "@pcobooster/contracts/rpc/needed-positions";
import { peopleProcedures, peopleRpc } from "@pcobooster/contracts/rpc/people";
import {
  planItemsProcedures,
  planItemsRpc,
} from "@pcobooster/contracts/rpc/plan-items";
import {
  planPeopleProcedures,
  planPeopleRpc,
} from "@pcobooster/contracts/rpc/plan-people";
import {
  planTimesProcedures,
  planTimesRpc,
} from "@pcobooster/contracts/rpc/plan-times";
import { read } from "@pcobooster/contracts/rpc/procedure";
import {
  scheduleProcedures,
  scheduleRpc,
} from "@pcobooster/contracts/rpc/schedule";
import {
  sessionProcedures,
  sessionRpc,
} from "@pcobooster/contracts/rpc/session";
import { songsProcedures, songsRpc } from "@pcobooster/contracts/rpc/songs";
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

export const healthProcedures = [health] as const;
export const healthRpc = plainGroup(...healthProcedures);

export const ProductRpc = RpcGroup.make().merge(
  healthRpc,
  sessionRpc,
  accountsRpc,
  featuresRpc,
  demoRpc,
  feedbackRpc,
  accessRpc,
  catalogRpc,
  peopleRpc,
  songsRpc,
  chordChartsRpc,
  planItemsRpc,
  planTimesRpc,
  planPeopleRpc,
  neededPositionsRpc,
  scheduleRpc
);

export type ProductRpcs = RpcGroup.Rpcs<typeof ProductRpc>;
export type ProcedureTag = ProductRpcs["_tag"];

/** Every declaration, before groups add middleware, so its `kind` is still visible to types. */
const productProcedures = [
  ...healthProcedures,
  ...sessionProcedures,
  ...accountsProcedures,
  ...featuresProcedures,
  ...demoProcedures,
  ...feedbackProcedures,
  ...accessProcedures,
  ...catalogProcedures,
  ...peopleProcedures,
  ...songsProcedures,
  ...chordChartsProcedures,
  ...planItemsProcedures,
  ...planTimesProcedures,
  ...planPeopleProcedures,
  ...neededPositionsProcedures,
  ...scheduleProcedures,
] as const;

type Declaration = (typeof productProcedures)[number];

/** Tags of `read` procedures: the only ones a caller may send at speculative priority. */
export type ReadProcedureTag = Extract<Declaration, { kind: "read" }>["_tag"];

/**
 * What clients build their RPC client from: each procedure's `wire` form, whose payload is the
 * encoded side of the server's. The server decodes, so its transforms and checks run there.
 */
export const ProductWireRpc = RpcGroup.make(
  ...productProcedures.map((procedure) => procedure.wire)
);

export type ProductWireRpcs = RpcGroup.Rpcs<typeof ProductWireRpc>;

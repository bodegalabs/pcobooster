/**
 * Every product procedure over Effect RPC. Web, SSR, Expo, the deploy check, and the API Worker
 * all use this one value. Each namespace is declared with `planningCenterGroup` or `plainGroup`,
 * so `ProcedureScope` wraps every other middleware. A namespace merged here without its handler
 * layer on the server is a type error; `parity.test.ts` checks the procedures against main's.
 */
import type { accessProcedures } from "@pcobooster/contracts/rpc/access";
import { accessRpc } from "@pcobooster/contracts/rpc/access";
import type { accountsProcedures } from "@pcobooster/contracts/rpc/accounts";
import { accountsRpc } from "@pcobooster/contracts/rpc/accounts";
import type { catalogProcedures } from "@pcobooster/contracts/rpc/catalog";
import { catalogRpc } from "@pcobooster/contracts/rpc/catalog";
import type { chordChartsProcedures } from "@pcobooster/contracts/rpc/chord-charts";
import { chordChartsRpc } from "@pcobooster/contracts/rpc/chord-charts";
import type { demoProcedures } from "@pcobooster/contracts/rpc/demo";
import { demoRpc } from "@pcobooster/contracts/rpc/demo";
import type { featuresProcedures } from "@pcobooster/contracts/rpc/features";
import { featuresRpc } from "@pcobooster/contracts/rpc/features";
import type { feedbackProcedures } from "@pcobooster/contracts/rpc/feedback";
import { feedbackRpc } from "@pcobooster/contracts/rpc/feedback";
import { plainGroup } from "@pcobooster/contracts/rpc/group";
import type { neededPositionsProcedures } from "@pcobooster/contracts/rpc/needed-positions";
import { neededPositionsRpc } from "@pcobooster/contracts/rpc/needed-positions";
import type { peopleProcedures } from "@pcobooster/contracts/rpc/people";
import { peopleRpc } from "@pcobooster/contracts/rpc/people";
import type { planItemsProcedures } from "@pcobooster/contracts/rpc/plan-items";
import { planItemsRpc } from "@pcobooster/contracts/rpc/plan-items";
import type { planPeopleProcedures } from "@pcobooster/contracts/rpc/plan-people";
import { planPeopleRpc } from "@pcobooster/contracts/rpc/plan-people";
import type { planTimesProcedures } from "@pcobooster/contracts/rpc/plan-times";
import { planTimesRpc } from "@pcobooster/contracts/rpc/plan-times";
import { read } from "@pcobooster/contracts/rpc/procedure";
import type { scheduleProcedures } from "@pcobooster/contracts/rpc/schedule";
import { scheduleRpc } from "@pcobooster/contracts/rpc/schedule";
import type { sessionProcedures } from "@pcobooster/contracts/rpc/session";
import { sessionRpc } from "@pcobooster/contracts/rpc/session";
import type { songsProcedures } from "@pcobooster/contracts/rpc/songs";
import { songsRpc } from "@pcobooster/contracts/rpc/songs";
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

/** Each declaration, before groups add middleware, so its `kind` is still visible to types. */
type Declaration = (
  | typeof healthProcedures
  | typeof sessionProcedures
  | typeof accountsProcedures
  | typeof featuresProcedures
  | typeof demoProcedures
  | typeof feedbackProcedures
  | typeof accessProcedures
  | typeof catalogProcedures
  | typeof peopleProcedures
  | typeof songsProcedures
  | typeof chordChartsProcedures
  | typeof planItemsProcedures
  | typeof planTimesProcedures
  | typeof planPeopleProcedures
  | typeof neededPositionsProcedures
  | typeof scheduleProcedures
)[number];

/** Tags of `read` procedures: the only ones a caller may send at speculative priority. */
export type ReadProcedureTag = Extract<Declaration, { kind: "read" }>["_tag"];

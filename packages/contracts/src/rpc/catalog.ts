/** Catalog procedures over Effect RPC. Ported from the zod schemas in `../catalog.ts`. */
import { PlanningCenterSession } from "@pcobooster/contracts/rpc/planning-center-session";
import { read } from "@pcobooster/contracts/rpc/procedure";
import { Schema } from "effect";
import { RpcGroup } from "effect/unstable/rpc";

const requiredId = Schema.Trim.check(Schema.isMinLength(1));

export const planSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  seriesTitle: Schema.optional(Schema.String),
  seriesId: Schema.optional(Schema.NullOr(Schema.String)),
  planningCenterUrl: Schema.optional(Schema.NullOr(Schema.String)),
  createdAt: Schema.Date,
  sortDate: Schema.optional(Schema.Date),
});

export const planInputSchema = Schema.Struct({
  serviceTypeId: requiredId,
  planId: requiredId,
});

export const catalogPlan = read("catalog.plan", {
  payload: planInputSchema,
  /** Null when the plan doesn't exist. */
  success: Schema.NullOr(planSchema),
});

export const catalogRpc = RpcGroup.make(catalogPlan).middleware(
  PlanningCenterSession
);

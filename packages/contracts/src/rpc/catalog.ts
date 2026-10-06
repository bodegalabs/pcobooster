/** Catalog procedures over Effect RPC. Ported from the zod schemas in `../catalog.ts`. */
import { planningCenterGroup } from "@pcobooster/contracts/rpc/group";
import { read } from "@pcobooster/contracts/rpc/procedure";
import { requiredId } from "@pcobooster/contracts/rpc/schema";
import { Schema } from "effect";

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

export const catalogRpc = planningCenterGroup(catalogPlan);

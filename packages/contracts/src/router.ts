import { accessRpc } from "@pcobooster/contracts/access";
import { accountsRpc } from "@pcobooster/contracts/accounts";
import { catalogRpc } from "@pcobooster/contracts/catalog";
import { chordChartsRpc } from "@pcobooster/contracts/chord-charts";
import { demoRpc } from "@pcobooster/contracts/demo";
import { featuresRpc } from "@pcobooster/contracts/features";
import { feedbackRpc } from "@pcobooster/contracts/feedback";
import { neededPositionsRpc } from "@pcobooster/contracts/needed-positions";
import { peopleRpc } from "@pcobooster/contracts/people";
import { planItemsRpc } from "@pcobooster/contracts/plan-items";
import { planPeopleRpc } from "@pcobooster/contracts/plan-people";
import { planTimesRpc } from "@pcobooster/contracts/plan-times";
import { scheduleRpc } from "@pcobooster/contracts/schedule";
import { sessionRpc } from "@pcobooster/contracts/session";
import { songsRpc } from "@pcobooster/contracts/songs";
import { Schema } from "effect";
import { RpcGroup } from "effect/rpc";

/** The 48 product operations shared by web, mobile and the API Worker. */
export const ProductRpc = RpcGroup.make().merge(
  accessRpc,
  accountsRpc,
  catalogRpc,
  chordChartsRpc,
  demoRpc,
  featuresRpc,
  feedbackRpc,
  neededPositionsRpc,
  peopleRpc,
  planItemsRpc,
  planPeopleRpc,
  planTimesRpc,
  scheduleRpc,
  sessionRpc,
  songsRpc
);

/** Health remains an ordinary HTTP surface. */
export const healthInputSchema = Schema.Struct({});
export const healthOutputSchema = Schema.Struct({
  status: Schema.Literal("ok"),
  version: Schema.String,
});
export type HealthInput = typeof healthInputSchema.Type;
export type HealthOutput = typeof healthOutputSchema.Type;

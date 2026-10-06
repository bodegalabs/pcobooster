/**
 * The product API: one group per namespace, every path under `/api/v1`. The server serves
 * `ProductApi`; clients are built from `ProductWireApi`, whose endpoints take their input's
 * encoded side (`endpoint.ts`). A procedure's tag is `<group>.<endpoint>`, as callers name it.
 */
import {
  chordChartsApi,
  chordChartsWireApi,
} from "@pcobooster/contracts/http/chord-charts";
import { peopleApi, peopleWireApi } from "@pcobooster/contracts/http/people";
import {
  scheduleApi,
  scheduleWireApi,
} from "@pcobooster/contracts/http/schedule";
import { HttpApi } from "effect/unstable/httpapi";

export const API_PREFIX = "/api/v1";

export const ProductApi = HttpApi.make("pcobooster")
  .add(peopleApi, scheduleApi, chordChartsApi)
  .prefix(API_PREFIX);

export const ProductWireApi = HttpApi.make("pcobooster")
  .add(peopleWireApi, scheduleWireApi, chordChartsWireApi)
  .prefix(API_PREFIX);

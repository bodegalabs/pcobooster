/**
 * The product API: one group per namespace, every path under `/api/v1`. The server serves
 * `ProductApi`; clients are built from `ProductWireApi`, whose endpoints take their input's
 * encoded side (`endpoint.ts`); `procedureRoutes` is the one route table. Each namespace is
 * declared with `planningCenterGroup` or `plainGroup` (`group.ts`), so every endpoint has its
 * middleware in the same order; a namespace added here without its handlers fails when the
 * server's router is built.
 */
import { access } from "@pcobooster/contracts/http/access";
import { accounts } from "@pcobooster/contracts/http/accounts";
import { catalog } from "@pcobooster/contracts/http/catalog";
import { chordCharts } from "@pcobooster/contracts/http/chord-charts";
import { demo } from "@pcobooster/contracts/http/demo";
import { features } from "@pcobooster/contracts/http/features";
import { feedback } from "@pcobooster/contracts/http/feedback";
import { health } from "@pcobooster/contracts/http/health";
import { neededPositions } from "@pcobooster/contracts/http/needed-positions";
import { people } from "@pcobooster/contracts/http/people";
import { planItems } from "@pcobooster/contracts/http/plan-items";
import { planPeople } from "@pcobooster/contracts/http/plan-people";
import { planTimes } from "@pcobooster/contracts/http/plan-times";
import { API_PREFIX } from "@pcobooster/contracts/http/route";
import type { ProcedureRoute } from "@pcobooster/contracts/http/route";
import { schedule } from "@pcobooster/contracts/http/schedule";
import { session } from "@pcobooster/contracts/http/session";
import { songs } from "@pcobooster/contracts/http/songs";
import { HttpApi } from "effect/unstable/httpapi";

export const ProductApi = HttpApi.make("pcobooster")
  .add(
    health.api,
    session.api,
    accounts.api,
    features.api,
    demo.api,
    feedback.api,
    access.api,
    catalog.api,
    people.api,
    songs.api,
    chordCharts.api,
    planItems.api,
    planTimes.api,
    planPeople.api,
    neededPositions.api,
    schedule.api
  )
  .prefix(API_PREFIX);

export const ProductWireApi = HttpApi.make("pcobooster")
  .add(
    health.wire,
    session.wire,
    accounts.wire,
    features.wire,
    demo.wire,
    feedback.wire,
    access.wire,
    catalog.wire,
    people.wire,
    songs.wire,
    chordCharts.wire,
    planItems.wire,
    planTimes.wire,
    planPeople.wire,
    neededPositions.wire,
    schedule.wire
  )
  .prefix(API_PREFIX);

/** Every procedure's method, path, param placement, kind, flag, and Planning Center access. */
export const procedureRoutes: readonly ProcedureRoute[] = [
  ...health.routes,
  ...session.routes,
  ...accounts.routes,
  ...features.routes,
  ...demo.routes,
  ...feedback.routes,
  ...access.routes,
  ...catalog.routes,
  ...people.routes,
  ...songs.routes,
  ...chordCharts.routes,
  ...planItems.routes,
  ...planTimes.routes,
  ...planPeople.routes,
  ...neededPositions.routes,
  ...schedule.routes,
];

type Declarations =
  | (typeof health.declarations)[number]
  | (typeof session.declarations)[number]
  | (typeof accounts.declarations)[number]
  | (typeof features.declarations)[number]
  | (typeof demo.declarations)[number]
  | (typeof feedback.declarations)[number]
  | (typeof access.declarations)[number]
  | (typeof catalog.declarations)[number]
  | (typeof people.declarations)[number]
  | (typeof songs.declarations)[number]
  | (typeof chordCharts.declarations)[number]
  | (typeof planItems.declarations)[number]
  | (typeof planTimes.declarations)[number]
  | (typeof planPeople.declarations)[number]
  | (typeof neededPositions.declarations)[number]
  | (typeof schedule.declarations)[number];

/** Every procedure's tag, as callers name it. */
export type ProcedureTag = Declarations["tag"];

/** Tags of reads: the only procedures a caller may send at speculative priority. */
export type ReadProcedureTag = Extract<Declarations, { kind: "read" }>["tag"];

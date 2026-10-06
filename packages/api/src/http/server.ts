/**
 * The product API over HttpApi: every group's handlers and both middlewares, as one layer that
 * adds the API's routes to the Worker's HttpRouter. A group without its handlers fails when the
 * router is built; a handler whose services the middlewares do not provide fails to typecheck.
 */
import "@pcobooster/api/rpc/services";
import type { PlanningCenterAccessDependencies } from "@pcobooster/api/application/planning-center-access";
import { ChordChartsHttpHandlers } from "@pcobooster/api/http/handlers/chord-charts";
import { PeopleHttpHandlers } from "@pcobooster/api/http/handlers/people";
import { scheduleHttpHandlers } from "@pcobooster/api/http/handlers/schedule";
import { PlanningCenterSessionLive } from "@pcobooster/api/http/planning-center-session";
import { ProcedureScopeLive } from "@pcobooster/api/http/procedure-scope";
import type { ProcedureScopeOptions } from "@pcobooster/api/http/procedure-scope";
import type { ScheduleAuditDependencies } from "@pcobooster/api/rpc/schedule-audit";
import { ProductApi } from "@pcobooster/contracts/http/api";
import { Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

export type ProductApiOptions = ProcedureScopeOptions & {
  /** How endpoints resolve Planning Center access; the Worker passes none. */
  readonly access?: PlanningCenterAccessDependencies;
  /** Where schedule writes are audited; the Worker passes none (D1). */
  readonly scheduleAudit?: ScheduleAuditDependencies;
};

export const productApiLayer = (options: ProductApiOptions) =>
  HttpApiBuilder.layer(ProductApi).pipe(
    Layer.provide(
      Layer.mergeAll(
        PeopleHttpHandlers,
        scheduleHttpHandlers(options.scheduleAudit),
        ChordChartsHttpHandlers
      )
    ),
    Layer.provide(
      Layer.mergeAll(
        ProcedureScopeLive(options),
        PlanningCenterSessionLive(options.access)
      )
    )
  );

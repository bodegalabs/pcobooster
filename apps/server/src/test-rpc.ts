import type { PlanningCenterAccessDependencies } from "@pcobooster/api/application/planning-center-access";
import { PlanningCenterRatePacer } from "@pcobooster/api/planning-center/rate-pacer";
import type { ReportProcedureFailure } from "@pcobooster/api/rpc/outcome";
import type { ScheduleAuditDependencies } from "@pcobooster/api/rpc/schedule-audit";
import type { ServerDependencies } from "@pcobooster/api/server";
import { unreachableHttpClient } from "@pcobooster/api/testing/http-client";
import { recordLogs } from "@pcobooster/api/testing/logs";
import { makeProductClient } from "@pcobooster/client/product-client";
import type {
  ProductClient,
  ProductClientConfig,
} from "@pcobooster/client/product-client";
import { Effect, Scope } from "effect";
import type { Tracer } from "effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { makeRpcRoute } from "./rpc-route";

export const TEST_RPC_URL = "http://api.test/api/rpc";
export const TEST_RELEASE_VERSION = "rpc-route-test";

export interface RpcRouteTestOptions {
  readonly server: ServerDependencies;
  /** How each procedure resolves Planning Center access; the Worker's own resolution by default. */
  readonly access?: PlanningCenterAccessDependencies;
  readonly scheduleAudit?: ScheduleAuditDependencies;
  readonly report?: ReportProcedureFailure | null;
  /** What Planning Center calls reach; any request fails the test by default. */
  readonly httpClient?: HttpClient.HttpClient;
  /** Records the spans procedures run in. */
  readonly tracer?: Tracer.Tracer;
}

export interface RpcRouteTest {
  /** Serves one HTTP request as the API Worker's `/api/rpc` route does. */
  readonly fetch: (request: Request) => Promise<Response>;
  /** The product client, sending through `fetch` above. */
  readonly client: (
    config?: Partial<Omit<ProductClientConfig, "url" | "fetch">>
  ) => ProductClient;
  /** Every Effect log line the route and its procedures wrote. */
  readonly logs: ReturnType<typeof recordLogs>["lines"];
}

/**
 * The `/api/rpc` route in Node, built once as the Worker builds it, so unit tests cover the
 * protocol, middleware, handlers, and response headers together. Work left after a disconnect
 * runs before the response settles, instead of under workerd's `waitUntil`.
 */
export const serveRpcForTest = (options: RpcRouteTestOptions): RpcRouteTest => {
  const { lines, capture } = recordLogs();
  const scope = Scope.makeUnsafe();
  const route = Effect.runPromise(
    makeRpcRoute({
      server: options.server,
      pacer: new PlanningCenterRatePacer(),
      report: options.report ?? null,
      releaseVersion: TEST_RELEASE_VERSION,
      access: options.access,
      scheduleAudit: options.scheduleAudit,
      afterDisconnect: (work) => work,
    }).pipe(Scope.provide(scope))
  );
  const fetch = async (request: Request): Promise<Response> => {
    const rpc = await route;
    const response = await Effect.runPromise(
      capture(
        rpc(HttpServerRequest.fromWeb(request)).pipe(
          Effect.provideService(
            HttpClient.HttpClient,
            options.httpClient ?? unreachableHttpClient
          ),
          options.tracer === undefined
            ? (effect) => effect
            : Effect.withTracer(options.tracer)
        )
      )
    );
    return HttpServerResponse.toWeb(response);
  };
  return {
    fetch,
    client: (config = {}) =>
      makeProductClient({
        client: "web",
        credentials: "omit",
        ...config,
        url: TEST_RPC_URL,
        fetch: async (input, init) => await fetch(new Request(input, init)),
      }),
    logs: lines,
  };
};

import type { PlanningCenterAccessDependencies } from "@pcobooster/api/application/planning-center-access";
import { PlanningCenterRatePacer } from "@pcobooster/api/planning-center/rate-pacer";
import type { ReportProcedureFailure } from "@pcobooster/api/rpc/outcome";
import type { ScheduleAuditDependencies } from "@pcobooster/api/rpc/schedule-audit";
import type { ServerDependencies } from "@pcobooster/api/server";
import { unreachableHttpClient } from "@pcobooster/api/testing/http-client";
import { recordLogs } from "@pcobooster/api/testing/logs";
import { makeProductHttpClient } from "@pcobooster/client/product-http-client";
import type {
  ProductHttpClient,
  ProductHttpClientConfig,
} from "@pcobooster/client/product-http-client";
import { Context, Effect, Scope } from "effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpEffect from "effect/unstable/http/HttpEffect";
import type * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";

import { makeHttpApp } from "./http-app";
import type { AuthWriteLimiter } from "./http-app";

export const TEST_API_ORIGIN = "http://api.test";
export const TEST_RELEASE_VERSION = "http-app-test";

export interface HttpAppTestOptions {
  readonly server: ServerDependencies;
  /** How each endpoint resolves Planning Center access; the Worker's own by default. */
  readonly access?: PlanningCenterAccessDependencies;
  readonly scheduleAudit?: ScheduleAuditDependencies;
  readonly report?: ReportProcedureFailure | null;
  readonly allowAuthWrite?: AuthWriteLimiter;
  readonly authHandler?: (request: Request) => Promise<Response> | Response;
  /** What Planning Center calls reach; any request fails the test by default. */
  readonly httpClient?: HttpClient.HttpClient;
}

export interface HttpAppTest {
  /** Serves one HTTP request as the API Worker's router does, pre-response handlers included. */
  readonly fetch: (request: Request) => Promise<Response>;
  /** `fetch` for a path on the test origin. */
  readonly request: (path: string, init?: RequestInit) => Promise<Response>;
  /** The product API client, sending through `fetch` above. */
  readonly client: (
    config?: Partial<Omit<ProductHttpClientConfig, "url" | "fetch">>
  ) => ProductHttpClient;
  /** Every Effect log line the router and its endpoints wrote. */
  readonly logs: ReturnType<typeof recordLogs>["lines"];
}

/**
 * The Worker's router in Node, built once as the Worker builds it, so unit tests cover routing,
 * CORS, the cache policy, Better Auth, and the product API together.
 */
export const serveHttpForTest = (options: HttpAppTestOptions): HttpAppTest => {
  const { lines, capture } = recordLogs();
  const scope = Scope.makeUnsafe();
  const handler = Effect.runPromise(
    makeHttpApp({
      server: options.server,
      pacer: new PlanningCenterRatePacer(),
      report: options.report ?? null,
      releaseVersion: TEST_RELEASE_VERSION,
      access: options.access,
      scheduleAudit: options.scheduleAudit,
      allowAuthWrite: options.allowAuthWrite,
      authHandler: options.authHandler,
    }).pipe(
      Scope.provide(scope),
      Effect.map((http) =>
        HttpEffect.toWebHandlerWith<
          HttpClient.HttpClient,
          HttpServerRequest.HttpServerRequest | Scope.Scope
        >(
          Context.make(
            HttpClient.HttpClient,
            options.httpClient ?? unreachableHttpClient
          )
        )(capture(http))
      )
    )
  );
  const fetch = async (request: Request): Promise<Response> =>
    await (
      await handler
    )(request);
  return {
    fetch,
    request: async (path, init) =>
      await fetch(new Request(`${TEST_API_ORIGIN}${path}`, init)),
    client: (config = {}) =>
      makeProductHttpClient({
        client: "web",
        credentials: "omit",
        ...config,
        url: TEST_API_ORIGIN,
        fetch: async (input, init) => await fetch(new Request(input, init)),
      }),
    logs: lines,
  };
};

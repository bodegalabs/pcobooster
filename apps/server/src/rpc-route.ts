/**
 * `POST /api/rpc`: the product's Effect RPC endpoint. The server is built once per isolate
 * (`makeRpcRoute`); each request runs its HTTP effect on Alchemy's request fiber, so procedures
 * inherit that invocation's HTTP client, logger, and tracer, with no Promise hop and the body read
 * once, by the RPC protocol.
 */
import { createRequestContext } from "@pcobooster/api/application/context";
import { moduleLog } from "@pcobooster/api/logging";
import { createPostHogExceptionReporter } from "@pcobooster/api/modules/analytics/posthog-exception";
import { causeError, faultOutcomeOf } from "@pcobooster/api/rpc/outcome";
import type { ReportProcedureFailure } from "@pcobooster/api/rpc/outcome";
import { writeProcedureOutcome } from "@pcobooster/api/rpc/protocol";
import { makeProductRpcServer } from "@pcobooster/api/rpc/server";
import type {
  ProductRpcHttpEffect,
  ProductRpcServerOptions,
} from "@pcobooster/api/rpc/server";
import { makeRpcExchange, RpcExchange } from "@pcobooster/api/rpc/services";
import type { RpcExchangeState } from "@pcobooster/api/rpc/services";
import { RequestRejected } from "@pcobooster/contracts/faults/request-rejected";
import {
  RPC_HEADERS,
  SERVER_VERSION_HEADER,
} from "@pcobooster/contracts/rpc/procedure";
import * as Cloudflare from "alchemy/Cloudflare";
import { Effect, Option } from "effect";
import type { Scope } from "effect";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

export const RPC_PATH = "/api/rpc";

/** Effect's HTTP client posts to `<url>/`, so the route answers with and without the slash. */
export const isRpcPath = (pathname: string): boolean =>
  pathname === RPC_PATH || pathname === `${RPC_PATH}/`;

/** Status logged for a procedure whose caller disconnected; never sent, the caller is gone. */
const CLIENT_CLOSED_STATUS = 499;
const METHOD_NOT_ALLOWED_STATUS = 405;

export interface RpcRouteOptions extends ProductRpcServerOptions {
  readonly releaseVersion: string;
}

const routeLog = moduleLog("rpc");

/** Sends 5xx procedures to PostHog; null where the stage has no project (all but production). */
export const postHogProcedureReporter = (
  apiKey: string | null
): ReportProcedureFailure | null => {
  const report = createPostHogExceptionReporter({
    apiKey,
    fetch: globalThis.fetch,
  });
  if (report === null) {
    return null;
  }
  return ({ fields, error }) =>
    Effect.tryPromise(async () => {
      await report({
        error,
        path: `${RPC_PATH}#${fields.procedure}`,
        method: "POST",
        requestId: fields.requestId,
      });
    }).pipe(
      Effect.catchCause((cause) =>
        routeLog.error(
          "Failed to report exception to PostHog",
          { procedure: fields.procedure, requestId: fields.requestId },
          causeError(cause)
        )
      )
    );
};

/** Completes when the workerd request's signal aborts: the caller disconnected. */
const disconnected = (signal: AbortSignal): Effect.Effect<boolean> =>
  signal.aborted
    ? Effect.succeed(true)
    : Effect.callback<boolean>((resume) => {
        const onAbort = () => {
          resume(Effect.succeed(true));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        return Effect.sync(() => {
          signal.removeEventListener("abort", onAbort);
        });
      });

/**
 * The one writer of RPC response headers: `Cache-Control: private, no-store` and the server
 * version on every response, and an HTTP status mirrored from a lone procedure's outcome
 * (batches stay 200). The Effect client decodes the body whatever the status, so mirroring only
 * gives Workers Logs and Cloudflare analytics a truthful status column.
 */
const finishResponse = (
  response: HttpServerResponse.HttpServerResponse,
  exchange: RpcExchangeState,
  releaseVersion: string
): HttpServerResponse.HttpServerResponse => {
  const [only, ...others] = exchange.outcomes;
  const status =
    only !== undefined && others.length === 0 ? only.status : response.status;
  return response.pipe(
    HttpServerResponse.setStatus(status),
    HttpServerResponse.setHeaders({
      "cache-control": "private, no-store",
      [SERVER_VERSION_HEADER]: releaseVersion,
    })
  );
};

const rpcRoute =
  (httpEffect: ProductRpcHttpEffect, options: RpcRouteOptions) =>
  (httpRequest: HttpServerRequest.HttpServerRequest) =>
    Effect.gen(function* serveRpc() {
      if (httpRequest.method !== "POST") {
        return HttpServerResponse.empty({ status: METHOD_NOT_ALLOWED_STATUS });
      }
      const request = yield* HttpServerRequest.toWeb(httpRequest).pipe(
        Effect.orDie
      );
      const exchange = makeRpcExchange(
        request,
        createRequestContext(request).requestId,
        request.headers.get(RPC_HEADERS.client)
      );
      const now = options.now ?? Date.now;
      const outcomeLines = { report: options.report, now };
      const answered = yield* Effect.raceFirst(
        httpEffect.pipe(
          Effect.provideService(
            HttpServerRequest.HttpServerRequest,
            httpRequest
          ),
          Effect.provideService(RpcExchange, exchange),
          Effect.scoped,
          Effect.map(Option.some)
        ),
        disconnected(request.signal).pipe(Effect.as(Option.none()))
      );
      // Leaving the race interrupted the protocol: reads stop, writes finish uninterruptibly.
      // Their lines are written once they have, kept alive past the response by waitUntil.
      const writeUnsentOutcomes = Effect.suspend(() =>
        Effect.forEach(
          exchange.takeAllFinished(),
          (finished) => writeProcedureOutcome(exchange, finished, outcomeLines),
          { discard: true }
        )
      );
      if (Option.isNone(answered)) {
        const execution = yield* Cloudflare.WorkerExecutionContext;
        yield* execution.waitUntil(
          Effect.andThen(exchange.settled.await, writeUnsentOutcomes)
        );
        return HttpServerResponse.empty({ status: CLIENT_CLOSED_STATUS });
      }
      yield* writeUnsentOutcomes;
      if (exchange.calls.size === 0) {
        // The body was not an RPC request at all; the protocol answered with a defect.
        yield* writeProcedureOutcome(
          exchange,
          {
            call: {
              procedure: "",
              requestId: exchange.requestId,
              client: exchange.client,
              priority: "interactive",
              kind: null,
              startedAt: now(),
              accounting: null,
            },
            outcome: faultOutcomeOf(
              new RequestRejected({
                message: "The request body is not an RPC request.",
                reason: "invalid-payload",
              })
            ),
          },
          outcomeLines
        );
      }
      return finishResponse(answered.value, exchange, options.releaseVersion);
    });

/** The per-request handler: what the Worker's fetch runs for `POST /api/rpc`. */
export type RpcRoute = ReturnType<typeof rpcRoute>;

/** Builds the product RPC server in `scope` (the isolate's lifetime) and returns its route. */
export const makeRpcRoute = (
  options: RpcRouteOptions
): Effect.Effect<RpcRoute, never, Scope.Scope> =>
  Effect.map(makeProductRpcServer(options), (httpEffect) =>
    rpcRoute(httpEffect, options)
  );

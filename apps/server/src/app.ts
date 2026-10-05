import type { ApplicationRuntime } from "@pcobooster/api/application/runtime";
import { NATIVE_SIGN_IN_START_PATH } from "@pcobooster/api/auth/native-sign-in";
import type { BoundaryLog } from "@pcobooster/api/logging";
import {
  createPostHogExceptionReporter,
  requestErrorSchema,
} from "@pcobooster/api/modules/analytics/posthog-exception";
import type { ReportRequestError } from "@pcobooster/api/modules/analytics/posthog-exception";
import { productHandlers } from "@pcobooster/api/rpc";
import type { ServerDependencies } from "@pcobooster/api/server";
import { RpcRequest } from "@pcobooster/api/transport/rpc/implementation";
import { createScheduleRouter } from "@pcobooster/api/transport/rpc/schedule";
import type { ScheduleRouterDependencies } from "@pcobooster/api/transport/rpc/schedule";
import { ProductRpc } from "@pcobooster/contracts/router";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import type { HttpClient } from "effect/http/HttpClient";
import { RpcSerialization, RpcServer } from "effect/rpc";

import { createContext } from "./context";

type AuthHandler = (request: Request) => Promise<Response> | Response;
export type AuthWriteLimiter = (clientIp: string) => Promise<boolean>;
export const AUTH_RATE_LIMIT_PERIOD_SECONDS = 60;
const nativeSignInStart = `/api/auth${NATIVE_SIGN_IN_START_PATH}`;

const isAuthRequest = (request: Request, path: string): boolean =>
  (path === "/api/auth" || path.startsWith("/api/auth/")) &&
  (request.method === "GET" || request.method === "POST");
const isAuthWrite = (request: Request, path: string): boolean =>
  request.method === "POST" || path === nativeSignInStart;
const isRpcRequest = (request: Request, path: string): boolean =>
  (path === "/api/rpc" || path === "/api/rpc/") && request.method === "POST";

export interface ServerAppBindings {
  readonly runtime: ApplicationRuntime<HttpClient>;
}
export interface ServerApp {
  readonly fetch: (
    request: Request,
    bindings: ServerAppBindings
  ) => Promise<Response>;
  readonly request: (
    input: string | Request,
    init: RequestInit | undefined,
    bindings: ServerAppBindings
  ) => Promise<Response>;
}
export interface CreateServerAppOptions {
  readonly allowAuthWrite?: AuthWriteLimiter;
  readonly server: ServerDependencies;
  readonly authHandler?: AuthHandler;
  readonly log: Pick<BoundaryLog, "error">;
  readonly reportError?: ReportRequestError | null;
  /** Explicit synthetic capability injection for end-to-end scheduling tests. */
  readonly scheduleDependencies?: ScheduleRouterDependencies;
}

/** Ordinary HTTP routes and the native Effect RPC HTTP runtime share the Worker fetch boundary. */
export const createServerApp = ({
  allowAuthWrite,
  server,
  authHandler = async (request) => await server.auth.handler(request),
  log,
  scheduleDependencies,
  reportError = createPostHogExceptionReporter({
    apiKey: server.config.postHogProjectKey,
    fetch: globalThis.fetch,
  }),
}: CreateServerAppOptions): ServerApp => {
  const schedule = createScheduleRouter(scheduleDependencies);
  const handlersLayer = ProductRpc.toLayer({
    ...productHandlers,
    "schedule.assign": schedule.assign,
    "schedule.remove": schedule.remove,
    "schedule.updateStatus": schedule.updateStatus,
  });
  const fetch = async (
    request: Request,
    { runtime }: ServerAppBindings
  ): Promise<Response> => {
    const path = new URL(request.url).pathname;
    const responseHeaders = new Headers({
      "Cache-Control": "private, no-store",
    });
    if (request.headers.get("Origin") === server.config.publicOrigin) {
      responseHeaders.set(
        "Access-Control-Allow-Origin",
        server.config.publicOrigin
      );
      responseHeaders.set("Access-Control-Allow-Credentials", "true");
      responseHeaders.set("Vary", "Origin");
    }
    const finish = (response: Response): Response => {
      const headers = new Headers(response.headers);
      for (const [name, value] of responseHeaders) {
        if (name === "set-cookie") {
          headers.append(name, value);
        } else {
          headers.set(name, value);
        }
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    };
    if (request.method === "OPTIONS") {
      responseHeaders.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      responseHeaders.set(
        "Access-Control-Allow-Headers",
        "Content-Type,Authorization,x-pcobooster-account,x-pcobooster-demo,x-pcobooster-priority,x-pcobooster-client,x-request-id"
      );
      return finish(new Response(null, { status: 204 }));
    }
    if (isAuthRequest(request, path)) {
      const ip = request.headers.get("cf-connecting-ip");
      if (
        isAuthWrite(request, path) &&
        ip !== null &&
        allowAuthWrite !== undefined &&
        !(await allowAuthWrite(ip))
      ) {
        return finish(
          Response.json(
            { error: "Too many requests" },
            {
              status: 429,
              headers: {
                "Retry-After": String(AUTH_RATE_LIMIT_PERIOD_SECONDS),
              },
            }
          )
        );
      }
      return finish(await authHandler(request));
    }
    if (request.method === "GET") {
      if (path === "/") {
        return finish(new Response("OK"));
      }
      if (path === "/health") {
        return finish(Response.json({ status: "ok" }));
      }
      if (path === "/api/health") {
        return finish(
          Response.json({ status: "ok", version: server.config.releaseVersion })
        );
      }
      if (path === "/version" || path === "/api/version") {
        return finish(Response.json({ version: server.config.releaseVersion }));
      }
    }
    if (!isRpcRequest(request, path)) {
      return finish(Response.json({ error: "Not found" }, { status: 404 }));
    }
    // Every HTTP invocation has one procedure and one 40-request Planning Center budget.
    // Native clients send one message; reject hand-built batches that could exceed Workers Free limits.
    try {
      const messages: unknown = await request.clone().json();
      const singleMessage: unknown = Array.isArray(messages)
        ? messages[0]
        : messages;
      if (
        (Array.isArray(messages) && messages.length !== 1) ||
        !Schema.is(Schema.Struct({ _tag: Schema.Literal("Request") }))(
          singleMessage
        )
      ) {
        return finish(
          Response.json(
            { error: "Send exactly one RPC request per HTTP invocation" },
            { status: 400 }
          )
        );
      }
    } catch {
      return finish(
        Response.json({ error: "Invalid RPC request" }, { status: 400 })
      );
    }
    const context = createContext({ request, runtime, server });
    const onUnexpectedError = async (
      unexpectedFailure: Error,
      procedure?: string
    ): Promise<void> => {
      const failure = requestErrorSchema.parse(unexpectedFailure);
      const fields = {
        requestId: context.requestId,
        method: request.method,
        path,
        procedure,
      };
      log.error("Effect RPC request failed", fields, failure);
      if (reportError === null) {
        return;
      }
      try {
        await reportError({
          error: failure,
          ...fields,
          path:
            procedure === undefined
              ? path
              : `/api/rpc/${procedure.replaceAll(".", "/")}`,
        });
      } catch (error) {
        log.error(
          "Failed to report exception to PostHog",
          fields,
          requestErrorSchema.parse(error)
        );
      }
    };
    const response = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* serveRpc() {
          const http = yield* RpcServer.toHttpEffect(ProductRpc, {
            disableFatalDefects: true,
          });
          return HttpServerResponse.toWeb(
            yield* Effect.provideService(
              http,
              HttpServerRequest.HttpServerRequest,
              HttpServerRequest.fromWeb(request)
            )
          );
        })
      ).pipe(
        Effect.provide(handlersLayer),
        Effect.provide(RpcSerialization.layerJson),
        Effect.provideService(RpcRequest, {
          ...context,
          resHeaders: responseHeaders,
          onUnexpectedError,
        })
      ),
      { signal: request.signal }
    );
    return finish(response);
  };
  return {
    fetch,
    request: async (input, init, bindings) =>
      await fetch(
        input instanceof Request
          ? input
          : new Request(new URL(input, "http://localhost"), init),
        bindings
      ),
  };
};

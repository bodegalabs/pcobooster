import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import type { AnyRouter } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ResponseHeadersPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import type { ApplicationRuntime } from "@pcobooster/api/application/runtime";
import { NATIVE_SIGN_IN_START_PATH } from "@pcobooster/api/auth/native-sign-in";
import {
  createPostHogExceptionReporter,
  requestErrorSchema,
} from "@pcobooster/api/modules/analytics/posthog-exception";
import type { ReportRequestError } from "@pcobooster/api/modules/analytics/posthog-exception";
import type { ServerDependencies } from "@pcobooster/api/server";
import type { HttpClient } from "effect/unstable/http/HttpClient";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as requestLogger } from "hono/logger";
import { z } from "zod";

import { createContext } from "./context";

const privateNoStore = "private, no-store";
const requestLogContextSchema = z.object({
  request: z.instanceof(Request),
  requestId: z.string(),
});
type RequestLogContext = z.infer<typeof requestLogContextSchema>;

interface ErrorLogger {
  error: (
    bindings: {
      err: unknown;
      requestId?: string;
      method?: string;
      path?: string;
    },
    message: string
  ) => void;
}

const preventSharedCaching = (response: Response): Response => {
  response.headers.set("Cache-Control", privateNoStore);
  return response;
};

type AuthHandler = (request: Request) => Promise<Response> | Response;

/** Whether the client at this IP may make another auth write now (a Workers rate limit). */
export type AuthWriteLimiter = (clientIp: string) => Promise<boolean>;

/** The window, in seconds, the API Worker's auth rate limit counts over. */
export const AUTH_RATE_LIMIT_PERIOD_SECONDS = 60;

/** A GET that writes: each native sign-in start stores an OAuth state row. */
const NATIVE_SIGN_IN_START = `/api/auth${NATIVE_SIGN_IN_START_PATH}`;

/** Auth requests the per-IP limit counts: every POST, and the native sign-in start. */
const isAuthWrite = (request: Request): boolean =>
  request.method === "POST" ||
  (request.method === "GET" &&
    new URL(request.url).pathname === NATIVE_SIGN_IN_START);

/** What the Worker hands each request: a runtime bound to that request's Effect fiber. */
export interface ServerAppBindings {
  readonly runtime: ApplicationRuntime<HttpClient>;
}

export type ServerApp = Hono<{ Bindings: ServerAppBindings }>;

export interface CreateServerAppOptions {
  /**
   * Limits auth writes per client IP: every POST (sign-in, sign-out, the native sign-in
   * exchange) and the native sign-in start. Session reads, which every page makes, and OAuth
   * callbacks are never limited. Omitted in tests and wherever no limit applies.
   */
  allowAuthWrite?: AuthWriteLimiter;
  server: ServerDependencies;
  /** Defaults to Better Auth's handler; tests substitute their own. */
  authHandler?: AuthHandler;
  enableRequestLogging?: boolean;
  log: ErrorLogger;
  /**
   * Sends unexpected failures to error tracking, which alerts on new issues. Defaults to
   * PostHog when the stage has a project key (production only); null disables it.
   */
  reportError?: ReportRequestError | null;
  router: AnyRouter;
}

export const createServerApp = ({
  allowAuthWrite,
  server,
  authHandler = async (request) => await server.auth.handler(request),
  enableRequestLogging = true,
  log,
  reportError = createPostHogExceptionReporter({
    apiKey: server.config.postHogProjectKey,
    fetch: globalThis.fetch,
  }),
  router,
}: CreateServerAppOptions): ServerApp => {
  const app: ServerApp = new Hono();

  /** Logs every failed procedure and reports the unexpected ones; never throws. */
  const handleProcedureError = async (
    message: string,
    failure: Error,
    requestContext: RequestLogContext | null
  ): Promise<void> => {
    if (requestContext === null) {
      log.error({ err: failure }, message);
      return;
    }
    const { request, requestId } = requestContext;
    const { method } = request;
    const { pathname: path } = new URL(request.url);
    log.error({ err: failure, requestId, method, path }, message);
    if (reportError === null) {
      return;
    }
    try {
      // Awaited so the Worker keeps the capture alive; it only delays failed responses.
      await reportError({ error: failure, path, method, requestId });
    } catch (error) {
      log.error(
        { err: error, requestId, method, path },
        "Failed to report exception to PostHog"
      );
    }
  };

  if (enableRequestLogging) {
    app.use("/*", requestLogger());
  }

  app.use(
    "/*",
    cors({
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
      origin: server.config.publicOrigin,
    })
  );

  const isOverAuthWriteLimit = async (request: Request): Promise<boolean> => {
    // Set by Cloudflare at the edge and forwarded unchanged by the product Worker.
    const clientIp = request.headers.get("cf-connecting-ip");
    if (
      !isAuthWrite(request) ||
      allowAuthWrite === undefined ||
      clientIp === null
    ) {
      return false;
    }
    return !(await allowAuthWrite(clientIp));
  };

  const handleAuthRequest = async (request: Request): Promise<Response> => {
    if (await isOverAuthWriteLimit(request)) {
      return Response.json(
        { error: "Too many requests" },
        {
          headers: { "Retry-After": String(AUTH_RATE_LIMIT_PERIOD_SECONDS) },
          status: 429,
        }
      );
    }
    return await authHandler(request);
  };

  app.on(
    ["GET", "POST"],
    "/api/auth/*",
    async (c) => await handleAuthRequest(c.req.raw)
  );
  app.on(
    ["GET", "POST"],
    "/api/auth",
    async (c) => await handleAuthRequest(c.req.raw)
  );

  const apiHandler = new OpenAPIHandler(router, {
    plugins: [
      new ResponseHeadersPlugin(),
      new OpenAPIReferencePlugin({
        schemaConverters: [new ZodToJsonSchemaConverter()],
      }),
    ],
    interceptors: [
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- oRPC exposes error interceptors as callbacks.
      onError(async (error, { context }) => {
        const parsed = requestLogContextSchema.safeParse(context);
        await handleProcedureError(
          "OpenAPI request failed",
          requestErrorSchema.parse(error),
          parsed.success ? parsed.data : null
        );
      }),
    ],
  });

  const rpcHandler = new RPCHandler(router, {
    plugins: [new ResponseHeadersPlugin()],
    interceptors: [
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- oRPC exposes error interceptors as callbacks.
      onError(async (error, { context }) => {
        const parsed = requestLogContextSchema.safeParse(context);
        await handleProcedureError(
          "oRPC request failed",
          requestErrorSchema.parse(error),
          parsed.success ? parsed.data : null
        );
      }),
    ],
  });

  const handleRpcRequest = async (
    request: Request,
    { runtime }: ServerAppBindings
  ): Promise<Response> => {
    const result = await rpcHandler.handle(request, {
      context: createContext({ request, runtime, server }),
      prefix: "/api/rpc",
    });

    return preventSharedCaching(
      result.matched
        ? result.response
        : Response.json({ error: "Not found" }, { status: 404 })
    );
  };

  const handleOpenApiRequest = async (
    request: Request,
    { runtime }: ServerAppBindings
  ): Promise<Response> => {
    const result = await apiHandler.handle(request, {
      context: createContext({ request, runtime, server }),
      prefix: "/api/reference",
    });

    return preventSharedCaching(
      result.matched
        ? result.response
        : Response.json({ error: "Not found" }, { status: 404 })
    );
  };

  app.all("/api/rpc", async (c) => await handleRpcRequest(c.req.raw, c.env));
  app.all("/api/rpc/*", async (c) => await handleRpcRequest(c.req.raw, c.env));
  app.all(
    "/api/reference",
    async (c) => await handleOpenApiRequest(c.req.raw, c.env)
  );
  app.all(
    "/api/reference/*",
    async (c) => await handleOpenApiRequest(c.req.raw, c.env)
  );

  app.get("/", (c) => c.text("OK"));
  app.get("/health", (c) => c.json({ status: "ok" }));

  return app;
};

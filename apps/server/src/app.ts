import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import type { AnyRouter } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ResponseHeadersPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as requestLogger } from "hono/logger";
import { z } from "zod";

import { createContext } from "./context";

type AuthHandler = (request: Request) => Promise<Response> | Response;
const privateNoStore = "private, no-store";
const requestLogContextSchema = z.object({
  request: z.instanceof(Request),
  requestId: z.string(),
});

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

export interface CreateServerAppOptions {
  authHandler: AuthHandler;
  corsOrigin: string;
  enableRequestLogging?: boolean;
  log: ErrorLogger;
  router: AnyRouter;
}

export const createServerApp = ({
  authHandler,
  corsOrigin,
  enableRequestLogging = true,
  log,
  router,
}: CreateServerAppOptions): Hono => {
  const app = new Hono();

  if (enableRequestLogging) {
    app.use("/*", requestLogger());
  }

  app.use(
    "/*",
    cors({
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
      origin: corsOrigin,
    })
  );

  app.on(
    ["GET", "POST"],
    "/api/auth/*",
    async (c) => await authHandler(c.req.raw)
  );
  app.on(
    ["GET", "POST"],
    "/api/auth",
    async (c) => await authHandler(c.req.raw)
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
      onError((error, { context }) => {
        const parsed = requestLogContextSchema.safeParse(context);
        if (!parsed.success) {
          log.error({ err: error }, "OpenAPI request failed");
          return;
        }
        const rpcContext = parsed.data;
        log.error(
          {
            err: error,
            requestId: rpcContext.requestId,
            method: rpcContext.request.method,
            path: new URL(rpcContext.request.url).pathname,
          },
          "OpenAPI request failed"
        );
      }),
    ],
  });

  const rpcHandler = new RPCHandler(router, {
    plugins: [new ResponseHeadersPlugin()],
    interceptors: [
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- oRPC exposes error interceptors as callbacks.
      onError((error, { context }) => {
        const parsed = requestLogContextSchema.safeParse(context);
        if (!parsed.success) {
          log.error({ err: error }, "oRPC request failed");
          return;
        }
        const rpcContext = parsed.data;
        log.error(
          {
            err: error,
            requestId: rpcContext.requestId,
            method: rpcContext.request.method,
            path: new URL(rpcContext.request.url).pathname,
          },
          "oRPC request failed"
        );
      }),
    ],
  });

  const handleRpcRequest = async (request: Request): Promise<Response> => {
    const result = await rpcHandler.handle(request, {
      context: createContext({ request }),
      prefix: "/api/rpc",
    });

    return preventSharedCaching(
      result.matched
        ? result.response
        : Response.json({ error: "Not found" }, { status: 404 })
    );
  };

  const handleOpenApiRequest = async (request: Request): Promise<Response> => {
    const result = await apiHandler.handle(request, {
      context: createContext({ request }),
      prefix: "/api/reference",
    });

    return preventSharedCaching(
      result.matched
        ? result.response
        : Response.json({ error: "Not found" }, { status: 404 })
    );
  };

  app.all("/api/rpc", async (c) => await handleRpcRequest(c.req.raw));
  app.all("/api/rpc/*", async (c) => await handleRpcRequest(c.req.raw));
  app.all("/api/reference", async (c) => await handleOpenApiRequest(c.req.raw));
  app.all(
    "/api/reference/*",
    async (c) => await handleOpenApiRequest(c.req.raw)
  );

  app.get("/", (c) => c.text("OK"));
  app.get("/health", (c) => c.json({ status: "ok" }));

  return app;
};

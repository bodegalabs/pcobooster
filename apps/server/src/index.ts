import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ResponseHeadersPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { auth } from "@worship-admin/api/auth";
import { logger } from "@worship-admin/api/logger";
import { appRouter } from "@worship-admin/api/orpc";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as requestLogger } from "hono/logger";

import { createContext } from "./context";
import { registerRestRoutes } from "./router";

const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3001";

const app = new Hono();
const log = logger.for("server");

app.use("/*", requestLogger());
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
  async (c) => await auth.handler(c.req.raw)
);
app.on(
  ["GET", "POST"],
  "/api/auth",
  async (c) => await auth.handler(c.req.raw)
);

const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new ResponseHeadersPlugin(),
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- oRPC exposes error interceptors as callbacks.
    onError((error) => {
      log.error({ err: error }, "OpenAPI request failed");
    }),
  ],
});

const rpcHandler = new RPCHandler(appRouter, {
  plugins: [new ResponseHeadersPlugin()],
  interceptors: [
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- oRPC exposes error interceptors as callbacks.
    onError((error) => {
      log.error({ err: error }, "oRPC request failed");
    }),
  ],
});

const handleRpcRequest = async (request: Request): Promise<Response> => {
  const result = await rpcHandler.handle(request, {
    context: createContext({ request }),
    prefix: "/api/rpc",
  });

  return result.matched
    ? result.response
    : Response.json({ error: "Not found" }, { status: 404 });
};

const handleOpenApiRequest = async (request: Request): Promise<Response> => {
  const result = await apiHandler.handle(request, {
    context: createContext({ request }),
    prefix: "/api/reference",
  });

  return result.matched
    ? result.response
    : Response.json({ error: "Not found" }, { status: 404 });
};

app.all("/api/rpc", async (c) => await handleRpcRequest(c.req.raw));
app.all("/api/rpc/*", async (c) => await handleRpcRequest(c.req.raw));
app.all("/api/reference", async (c) => await handleOpenApiRequest(c.req.raw));
app.all("/api/reference/*", async (c) => await handleOpenApiRequest(c.req.raw));

registerRestRoutes(app);

app.get("/", (c) => c.text("OK"));
app.get("/health", (c) => c.json({ status: "ok" }));

export type App = typeof app;
export default app;

import { NATIVE_SIGN_IN_START_PATH } from "@pcobooster/api/auth/native-sign-in";
import type { ServerDependencies } from "@pcobooster/api/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as requestLogger } from "hono/logger";

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

/** Better Auth and liveness; product procedures are the Effect RPC route (`rpc-route.ts`). */
export type ServerApp = Hono;

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
}

export const createServerApp = ({
  allowAuthWrite,
  server,
  authHandler = async (request) => await server.auth.handler(request),
  enableRequestLogging = true,
}: CreateServerAppOptions): ServerApp => {
  const app: ServerApp = new Hono();

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

  app.get("/", (c) => c.text("OK"));
  app.get("/health", (c) => c.json({ status: "ok" }));

  return app;
};

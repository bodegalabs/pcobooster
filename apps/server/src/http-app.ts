/**
 * The API Worker's one HTTP router, built once per isolate: the product API (`/api/v1`, Effect
 * HttpApi), Better Auth (`/api/auth/*`, with its per-IP write limit), liveness (`/`, `/health`),
 * and, for every route and every answer including errors and preflights, the CORS policy and
 * the cache policy. The RPC route (`/api/rpc`) is dispatched by the Worker before this router
 * until the port to HttpApi finishes.
 */
import { NATIVE_SIGN_IN_START_PATH } from "@pcobooster/api/auth/native-sign-in";
import { productApiLayer } from "@pcobooster/api/http/server";
import type { ProductApiOptions } from "@pcobooster/api/http/server";
import { SERVER_VERSION_HEADER } from "@pcobooster/contracts/rpc/procedure";
import { Context, Effect, Layer, Scope } from "effect";
import * as HttpEffect from "effect/unstable/http/HttpEffect";
import * as HttpMiddleware from "effect/unstable/http/HttpMiddleware";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServer from "effect/unstable/http/HttpServer";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { corsPolicy } from "./cors";

type AuthHandler = (request: Request) => Promise<Response> | Response;

/** Whether the client at this IP may make another auth write now (a Workers rate limit). */
export type AuthWriteLimiter = (clientIp: string) => Promise<boolean>;

/** The window, in seconds, the API Worker's auth rate limit counts over. */
export const AUTH_RATE_LIMIT_PERIOD_SECONDS = 60;

/** A GET that writes: each native sign-in start stores an OAuth state row. */
const NATIVE_SIGN_IN_START = `/api/auth${NATIVE_SIGN_IN_START_PATH}`;

const TOO_MANY_REQUESTS = 429;

/** Auth requests the per-IP limit counts: every POST, and the native sign-in start. */
const isAuthWrite = (request: Request): boolean =>
  request.method === "POST" ||
  (request.method === "GET" &&
    new URL(request.url).pathname === NATIVE_SIGN_IN_START);

export interface HttpAppOptions extends ProductApiOptions {
  /** The API's release, sent on every response for version-skew handling. */
  readonly releaseVersion: string;
  /**
   * Limits auth writes per client IP: every POST (sign-in, sign-out, the native sign-in
   * exchange) and the native sign-in start. Session reads, which every page makes, and OAuth
   * callbacks are never limited. Omitted in tests and wherever no limit applies.
   */
  readonly allowAuthWrite?: AuthWriteLimiter;
  /** Defaults to Better Auth's handler; tests substitute their own. */
  readonly authHandler?: AuthHandler;
}

const authRoute = ({
  allowAuthWrite,
  authHandler,
}: {
  readonly allowAuthWrite: AuthWriteLimiter | undefined;
  readonly authHandler: AuthHandler;
}) =>
  Effect.gen(function* serveAuth() {
    const httpRequest = yield* HttpServerRequest.HttpServerRequest;
    const request = yield* HttpServerRequest.toWeb(httpRequest).pipe(
      Effect.orDie
    );
    // Set by Cloudflare at the edge and forwarded unchanged by the product Worker.
    const clientIp = request.headers.get("cf-connecting-ip");
    const limited =
      isAuthWrite(request) &&
      allowAuthWrite !== undefined &&
      clientIp !== null &&
      !(yield* Effect.promise(async () => await allowAuthWrite(clientIp)));
    if (limited) {
      return HttpServerResponse.jsonUnsafe(
        { error: "Too many requests" },
        {
          status: TOO_MANY_REQUESTS,
          headers: { "retry-after": String(AUTH_RATE_LIMIT_PERIOD_SECONDS) },
        }
      );
    }
    const response = yield* Effect.promise(
      async () => await authHandler(request)
    );
    return HttpServerResponse.fromWeb(response);
  });

/**
 * `Cache-Control: private, no-store` and the API's release on every response, applied as each is
 * sent (errors, 404s, and Better Auth's answers included). Every answer is per caller, so this
 * replaces whatever a route set, Better Auth's bare `no-store` among them.
 */
const cachePolicy = (releaseVersion: string) =>
  HttpRouter.middleware(
    (httpApp) =>
      Effect.andThen(
        HttpEffect.appendPreResponseHandler((_request, response) =>
          Effect.succeed(
            HttpServerResponse.setHeaders(response, {
              "cache-control": "private, no-store",
              [SERVER_VERSION_HEADER]: releaseVersion,
            })
          )
        ),
        httpApp
      ),
    { global: true }
  );

/** Every route the Worker serves through this router, with its global middleware. */
export const httpAppLayer = (options: HttpAppOptions) => {
  const { origin, allowMethods, allowHeaders } = corsPolicy(
    options.server.config.publicOrigin
  );
  const auth = authRoute({
    allowAuthWrite: options.allowAuthWrite,
    authHandler:
      options.authHandler ??
      (async (request) => await options.server.auth.handler(request)),
  });
  return Layer.mergeAll(
    productApiLayer(options),
    HttpRouter.add("GET", "/api/auth/*", auth),
    HttpRouter.add("POST", "/api/auth/*", auth),
    HttpRouter.add("GET", "/", HttpServerResponse.text("OK")),
    HttpRouter.add(
      "GET",
      "/health",
      HttpServerResponse.jsonUnsafe({ status: "ok" })
    ),
    // Registered first, so it runs outermost and answers preflights before anything else.
    HttpRouter.middleware(
      HttpMiddleware.cors({
        allowedOrigins: (requestOrigin) => requestOrigin === origin,
        allowedMethods: allowMethods,
        allowedHeaders: allowHeaders,
        credentials: true,
      }),
      { global: true }
    ),
    cachePolicy(options.releaseVersion)
  ).pipe(Layer.provide(HttpServer.layerServices));
};

/** What the Worker runs for each request this router serves. */
export type HttpApp = Effect.Success<ReturnType<typeof makeHttpApp>>;

/**
 * Builds the router in `scope` (the isolate's lifetime) and returns its per-request effect.
 *
 * The build sees only that scope. `HttpApiBuilder.group` captures every service of the fiber that
 * builds it and provides them to each handler; the Worker builds the router inside its first
 * request, whose services (Alchemy's HTTP client, tracer, and execution context) belong to that
 * request's I/O context. Captured, they would serve every later request, which workerd answers by
 * hanging. Each request supplies its own instead (`procedure-scope.ts` reads them).
 */
export const makeHttpApp = (options: HttpAppOptions) =>
  Effect.updateContext(
    HttpRouter.toHttpEffect(httpAppLayer(options)),
    (context: Context.Context<Scope.Scope>) =>
      Context.make(Scope.Scope, Context.get(context, Scope.Scope))
  );

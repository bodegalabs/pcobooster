/**
 * The API Worker's one HTTP router, built once per isolate before any request: the product API
 * (`/api/v1`, Effect HttpApi), Better Auth (`/api/auth/*`, with its per-IP write limit), the iOS
 * app's over-the-air updates (`/api/updates/*`, whose protocol Expo fixes), and liveness (`/`,
 * `/health`). Around it, in this order from the outside in:
 * - the cache policy: `Cache-Control: private, no-store` and the release header on every
 *   response, preflights and unknown paths included;
 * - CORS: only the product origin, with credentials;
 * - disconnects: a product call whose caller leaves stops if it reads and finishes if it writes.
 *
 * Nothing request-scoped is built in: each request brings the isolate's server and error
 * reporter (`IsolateServer`), the stage's update bucket (`MobileUpdates`), and, in the Worker, its
 * auth rate limit (`AuthWriteLimit`).
 */
import { NATIVE_SIGN_IN_START_PATH } from "@pcobooster/api/auth/native-sign-in";
import {
  updateAssetRoute,
  updateCheckRoute,
} from "@pcobooster/api/http/mobile-updates";
import { IsolateServer } from "@pcobooster/api/http/procedure-scope";
import { productApiLayer } from "@pcobooster/api/http/server";
import type { ProductApiOptions } from "@pcobooster/api/http/server";
import { unmatchedProductRequest } from "@pcobooster/api/http/unmatched";
import { SERVER_VERSION_HEADER } from "@pcobooster/contracts/http/client-version";
import { API_PREFIX } from "@pcobooster/contracts/http/route";
import {
  assetPath,
  UPDATE_CHECK_PATH,
} from "@pcobooster/contracts/mobile-updates";
import { Context, Effect, Layer, Option, Scope } from "effect";
import * as HttpEffect from "effect/unstable/http/HttpEffect";
import * as HttpMiddleware from "effect/unstable/http/HttpMiddleware";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServer from "effect/unstable/http/HttpServer";
import * as HttpServerError from "effect/unstable/http/HttpServerError";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { corsPolicy } from "./cors";
import { surviveDisconnect } from "./disconnect";
import type { AfterDisconnect } from "./disconnect";

type AuthHandler = (request: Request) => Promise<Response> | Response;

/** Whether the client at this IP may make another auth write now (a Workers rate limit). */
export type AuthWriteLimiter = (clientIp: string) => Promise<boolean>;

/**
 * The Worker's auth rate limit, read from its binding inside each request. Requests without it
 * (tests, and wherever no limit applies) are never limited.
 */
export class AuthWriteLimit extends Context.Service<
  AuthWriteLimit,
  AuthWriteLimiter
>()("@pcobooster/server/AuthWriteLimit") {}

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

export interface HttpAppOptions<
  AfterDisconnectServices,
> extends ProductApiOptions {
  /** The API's origin for browsers: the one CORS allows. */
  readonly publicOrigin: string;
  /** Keeps a disconnected call's write alive; the Worker uses `waitUntil`. */
  readonly afterDisconnect: AfterDisconnect<AfterDisconnectServices>;
  /** Defaults to the request's Better Auth; tests substitute their own. */
  readonly authHandler?: AuthHandler;
}

/**
 * Better Auth, after the per-IP limit on auth writes: every POST (sign-in, sign-out, the native
 * sign-in exchange) and the native sign-in start. Session reads, which every page makes, and
 * OAuth callbacks are never limited.
 */
const authRoute = (authHandler: AuthHandler | undefined) =>
  Effect.gen(function* serveAuth() {
    const httpRequest = yield* HttpServerRequest.HttpServerRequest;
    const request = yield* HttpServerRequest.toWeb(httpRequest).pipe(
      Effect.orDie
    );
    const { server } = yield* IsolateServer;
    const allowAuthWrite = yield* Effect.serviceOption(AuthWriteLimit);
    // Set by Cloudflare at the edge and forwarded unchanged by the product Worker.
    const clientIp = request.headers.get("cf-connecting-ip");
    const limited =
      isAuthWrite(request) &&
      Option.isSome(allowAuthWrite) &&
      clientIp !== null &&
      !(yield* Effect.promise(
        async () => await allowAuthWrite.value(clientIp)
      ));
    if (limited) {
      return HttpServerResponse.jsonUnsafe(
        { error: "Too many requests" },
        {
          status: TOO_MANY_REQUESTS,
          headers: { "retry-after": String(AUTH_RATE_LIMIT_PERIOD_SECONDS) },
        }
      );
    }
    const handle =
      authHandler ??
      (async (input: Request) => await server.auth.handler(input));
    const response = yield* Effect.promise(async () => await handle(request));
    return HttpServerResponse.fromWeb(response);
  });

/** Every route the router serves. */
const routesLayer = <Services>(options: HttpAppOptions<Services>) => {
  const auth = authRoute(options.authHandler);
  return Layer.mergeAll(
    productApiLayer(options),
    HttpRouter.add(
      "*",
      `${API_PREFIX}/*`,
      unmatchedProductRequest(options.now)
    ),
    HttpRouter.add("GET", "/api/auth/*", auth),
    HttpRouter.add("POST", "/api/auth/*", auth),
    HttpRouter.add("GET", UPDATE_CHECK_PATH, updateCheckRoute),
    HttpRouter.add("GET", assetPath(":hash"), updateAssetRoute),
    HttpRouter.add("GET", "/", HttpServerResponse.text("OK")),
    HttpRouter.add(
      "GET",
      "/health",
      HttpServerResponse.jsonUnsafe({ status: "ok" })
    )
  ).pipe(Layer.provide(HttpServer.layerServices));
};

/**
 * `Cache-Control: private, no-store` and the API's release on every response, applied as each is
 * sent. Registered before CORS runs, so preflights CORS answers itself get it too. Every answer is
 * per caller, so this replaces whatever a route set, Better Auth's bare `no-store` among them.
 */
const cachePolicy = <Failure, Requirements>(
  app: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    Failure,
    Requirements
  >
) =>
  Effect.gen(function* applyCachePolicy() {
    const { server } = yield* IsolateServer;
    yield* HttpEffect.appendPreResponseHandler((_request, response) =>
      Effect.succeed(
        HttpServerResponse.setHeaders(response, {
          "cache-control": "private, no-store",
          [SERVER_VERSION_HEADER]: server.config.releaseVersion,
        })
      )
    );
    return yield* app;
  });

/** What the Worker runs for each request this router serves. */
export type HttpApp<Services> = Effect.Success<
  ReturnType<typeof makeHttpApp<Services>>
>;

/**
 * Builds the router in `scope` (the isolate's lifetime) and returns its per-request effect.
 *
 * The build sees only that scope. `HttpApiBuilder.group` captures every service of the fiber that
 * builds it and provides them to each handler, so a service the build could see would override
 * the request's own (workerd hangs a request that uses another invocation's I/O). Each request
 * supplies its own instead.
 */
export const makeHttpApp = <Services>(options: HttpAppOptions<Services>) => {
  const { origin, allowMethods, allowHeaders, exposeHeaders } = corsPolicy(
    options.publicOrigin
  );
  const cors = HttpMiddleware.cors({
    allowedOrigins: (requestOrigin) => requestOrigin === origin,
    allowedMethods: allowMethods,
    allowedHeaders: allowHeaders,
    exposedHeaders: exposeHeaders,
    credentials: true,
  });
  return Effect.updateContext(
    HttpRouter.toHttpEffect(routesLayer(options)),
    (context: Context.Context<Scope.Scope>) =>
      Context.make(Scope.Scope, Context.get(context, Scope.Scope))
  ).pipe(
    Effect.map((router) =>
      cachePolicy(
        cors(
          surviveDisconnect(options.afterDisconnect)(
            router.pipe(
              Effect.catchIf(
                (failure) =>
                  HttpServerError.isHttpServerError(failure) &&
                  failure.reason._tag === "RouteNotFound",
                (failure) =>
                  Effect.gen(function* rejectedRouterPath() {
                    const request = yield* HttpServerRequest.HttpServerRequest;
                    const { pathname } = new URL(request.url, "http://api");
                    if (
                      pathname === API_PREFIX ||
                      pathname.startsWith(`${API_PREFIX}/`)
                    ) {
                      return yield* unmatchedProductRequest(options.now);
                    }
                    return yield* Effect.fail(failure);
                  })
              )
            )
          )
        )
      )
    )
  );
};

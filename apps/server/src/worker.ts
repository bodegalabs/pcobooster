import { applicationRuntimeFor } from "@pcobooster/api/application/runtime";
import { deploymentTier } from "@pcobooster/api/config/feature-flags";
import type { ServerEnvironment } from "@pcobooster/api/config/server-config";
import { resolveServerConfig } from "@pcobooster/api/config/server-config";
import { logger } from "@pcobooster/api/logger";
import { appRouter } from "@pcobooster/api/orpc";
import { PlanningCenterPacing } from "@pcobooster/api/planning-center/pacing";
import { PlanningCenterRatePacer } from "@pcobooster/api/planning-center/rate-pacer";
import type { SharedReadStore } from "@pcobooster/api/planning-center/services/shared-read-store";
import { createServerDependencies } from "@pcobooster/api/server";
import type { FeatureFlagSource } from "@pcobooster/api/server";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { Config, Context, Effect, Layer, Redacted } from "effect";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { AUTH_RATE_LIMIT_PERIOD_SECONDS, createServerApp } from "./app";
import { Database } from "./database";
import { FeatureFlagApp } from "./feature-flags";
import { apiWorkerObservability, apiWorkerTelemetry } from "./observability";
import { PlanningCenterCache } from "./planning-center-cache";
import { cachedAcrossRequests } from "./shared-initialization";
import { currentStageSettings } from "./stage";

const PREVIEW_SECRET_PLACEHOLDER = "minted-by-alchemy-random-at-runtime";

/**
 * Auth writes (sign-in, sign-out, native sign-in start and exchange; see `createServerApp`) each
 * client IP may make per minute. A whole church signing in from one network stays well under it;
 * a script hammering sign-in does not. Cloudflare counts per location, so it is a brake on abuse,
 * not an exact quota.
 */
const AUTH_WRITES_PER_PERIOD = 30;

const secret = (name: string) =>
  Config.Redacted(name).pipe(Config.map(Redacted.value));
const optionalSecret = (name: string) =>
  secret(name).pipe(Config.withDefault(""));
const optionalString = (name: string) =>
  Config.String(name).pipe(Config.withDefault(""));

/**
 * Settings each stage reads. Every `Config` read here, in the Worker's construction phase, is
 * bound to the Worker at deploy time and read back from its environment at runtime.
 */
const readEnvironment = Effect.gen(function* readEnvironment() {
  const { production, local, publicOrigin, previewOriginPattern } =
    yield* currentStageSettings;
  // Production keeps its Infisical secret so existing sessions stay valid; each preview mints
  // its own, stored in Alchemy state and discarded with the stage.
  const configuredSecret =
    production || local ? yield* secret("BETTER_AUTH_SECRET") : undefined;
  const authSecret: Effect.Effect<string> =
    configuredSecret === undefined
      ? (yield* (yield* Alchemy.Random("BetterAuthSecret")).text).pipe(
          Effect.map(Redacted.value)
        )
      : Effect.succeed(configuredSecret);
  const environment: Omit<ServerEnvironment, "BETTER_AUTH_SECRET"> = {
    NODE_ENV: local ? "development" : "production",
    APP_ENV: production ? "production" : "preview",
    // Bound as a Worker prop (`apiProps`); see there for why it is not read from GITHUB_SHA here.
    PCOBOOSTER_VERSION: yield* optionalString("PCOBOOSTER_VERSION"),
    BETTER_AUTH_URL: publicOrigin,
    OAUTH_PREVIEW_ORIGIN_PATTERN: previewOriginPattern,
    OAUTH_PROXY_SECRET: local
      ? ""
      : yield* optionalSecret("OAUTH_PROXY_SECRET"),
    OAUTH_PROXY_PRODUCTION_URL: local ? "" : "https://pcobooster.com",
    PLANNING_CENTER_OAUTH_CLIENT_ID: yield* secret(
      "PLANNING_CENTER_OAUTH_CLIENT_ID"
    ),
    PLANNING_CENTER_OAUTH_CLIENT_SECRET: yield* secret(
      "PLANNING_CENTER_OAUTH_CLIENT_SECRET"
    ),
    PLANNING_CENTER_TIME_ZONE: yield* Config.String(
      "PLANNING_CENTER_TIME_ZONE"
    ).pipe(Config.withDefault("America/Los_Angeles")),
    // Production only: the read-only demo and the product's PostHog project.
    DEMO_ACCESS_KEY: production ? yield* optionalSecret("DEMO_ACCESS_KEY") : "",
    DEMO_PLANNING_CENTER_CLIENT: production
      ? yield* optionalSecret("DEMO_PLANNING_CENTER_CLIENT")
      : "",
    DEMO_PLANNING_CENTER_PAT: production
      ? yield* optionalSecret("DEMO_PLANNING_CENTER_PAT")
      : "",
    POSTHOG_PROJECT_KEY: production
      ? yield* optionalSecret("POSTHOG_PROJECT_KEY")
      : "",
    // Local only: the dev auth bypass, its personal access token, and presentation mode.
    DEV_AUTH_BYPASS: local ? yield* optionalString("DEV_AUTH_BYPASS") : "",
    PLANNING_CENTER_CLIENT: local
      ? yield* optionalSecret("PLANNING_CENTER_CLIENT")
      : "",
    PLANNING_CENTER_PAT: local
      ? yield* optionalSecret("PLANNING_CENTER_PAT")
      : "",
    PRESENTATION_MODE: local ? yield* optionalString("PRESENTATION_MODE") : "",
    PRESENTATION_SEED: local ? yield* optionalSecret("PRESENTATION_SEED") : "",
  };
  // Validate now, while Alchemy deploys, so a bad setting fails the deploy instead of the
  // first request. A preview's minted secret only exists at runtime, so it stands in here.
  yield* Effect.try({
    try: () =>
      resolveServerConfig({
        ...environment,
        BETTER_AUTH_SECRET: configuredSecret ?? PREVIEW_SECRET_PLACEHOLDER,
      }),
    catch: (error) =>
      new Error(`Invalid API Worker settings: ${String(error)}`, {
        cause: error,
      }),
  }).pipe(Effect.orDie);
  return authSecret.pipe(
    Effect.map((BETTER_AUTH_SECRET): ServerEnvironment => ({
      ...environment,
      BETTER_AUTH_SECRET,
    }))
  );
});

/** Hono serves Better Auth, oRPC, and the OpenAPI reference; see `app.ts`. */
export default class Api extends Cloudflare.Worker<Api>()(
  "Api",
  Effect.gen(function* apiProps() {
    const { stage, apiDevPort } = yield* currentStageSettings;
    return {
      name: `pcobooster-${stage}-api`,
      main: import.meta.url,
      workersDev: false,
      compatibility: { date: "2026-09-01", flags: ["nodejs_compat"] },
      observability: apiWorkerObservability(),
      dev: { host: "127.0.0.1", port: apiDevPort, strictPort: true },
      env: {
        // CI deploys the checked-out commit; post-deploy verification expects it from health.
        // Alchemy's change detection hashes `env` props but not the `Config` reads made in
        // init, so reading GITHUB_SHA there would leave a web-only deploy serving the old one.
        PCOBOOSTER_VERSION: yield* optionalString("GITHUB_SHA"),
      },
    };
  }),
  Effect.gen(function* api() {
    const database = yield* Cloudflare.D1.QueryDatabase(yield* Database);
    const planningCenterCache = yield* Cloudflare.KV.ReadWriteNamespace(
      yield* PlanningCenterCache
    );
    const tier = deploymentTier(yield* currentStageSettings);
    // `alchemy dev` has no local Flagship: its binding would proxy to a live app, which needs
    // Cloudflare credentials and cloud resources. The local stage serves registry values.
    const flags =
      tier === "local"
        ? undefined
        : yield* Cloudflare.Flagship.ReadFlags(yield* FeatureFlagApp(tier));
    const authRateLimit = yield* Cloudflare.RateLimit("AUTH_RATE_LIMIT", {
      namespaceId: 1001,
      simple: {
        limit: AUTH_WRITES_PER_PERIOD,
        period: AUTH_RATE_LIMIT_PERIOD_SECONDS,
      },
    });
    const resolveEnvironment = yield* readEnvironment;
    // One pacer per isolate shares each credential's Planning Center budget across requests.
    const pacer = new PlanningCenterRatePacer();
    // The D1, KV, and Flagship bindings and a runtime-minted secret are only readable inside a
    // request, so the app is built by the first one and shared by the rest of the isolate's
    // lifetime. Not `Effect.cached`: requests that arrive while the first one builds must not
    // resume inside it; see `cachedAcrossRequests`.
    const app = yield* cachedAcrossRequests(
      Effect.gen(function* buildApp() {
        const config = resolveServerConfig(yield* resolveEnvironment);
        const binding = yield* database.raw;
        const featureFlagSource: FeatureFlagSource =
          flags === undefined
            ? { kind: "registry", tier: "local" }
            : { kind: "flagship", binding: yield* flags.raw };
        const namespace = yield* planningCenterCache.raw;
        const rateLimit = yield* authRateLimit.raw;
        const planningCenterReadStore: SharedReadStore = {
          get: async (key) => await namespace.get(key, "text"),
          put: async (key, value, { expirationTtl }) => {
            await namespace.put(key, value, { expirationTtl });
          },
        };
        const server = createServerDependencies(
          config,
          binding,
          featureFlagSource,
          planningCenterReadStore
        );
        // Better Auth starts initializing (including OIDC discovery) when created. workerd ties
        // that I/O to the current request, so it must settle before this request ends or every
        // later request would wait on it forever.
        yield* Effect.promise(async () => {
          await server.auth.$context;
        });
        return createServerApp({
          allowAuthWrite: async (clientIp) => {
            const outcome = await rateLimit.limit({ key: clientIp });
            return outcome.success;
          },
          server,
          log: logger.for("server"),
          router: appRouter,
        });
      })
    );
    return {
      fetch: Effect.gen(function* fetch() {
        const request = yield* HttpServerRequest.toWeb(
          yield* HttpServerRequest.HttpServerRequest
        ).pipe(Effect.orDie);
        const handler = yield* app;
        // Procedures run on this request's fiber context (Alchemy's HTTP client, logger, and
        // per-event tracer), so their spans land in this invocation's Workers trace.
        const services = yield* Effect.context<HttpClient.HttpClient>();
        const runtime = applicationRuntimeFor(
          Context.add(services, PlanningCenterPacing, pacer)
        );
        const response = yield* Effect.promise(
          async () => await handler.fetch(request, { runtime })
        );
        return HttpServerResponse.fromWeb(response);
      }),
    };
  }).pipe(
    Effect.provide(
      Layer.unwrap(currentStageSettings.pipe(Effect.map(apiWorkerTelemetry)))
    ),
    Effect.provide(Cloudflare.D1.QueryDatabaseBinding),
    Effect.provide(Cloudflare.KV.ReadWriteNamespaceBinding),
    Effect.provide(Cloudflare.Flagship.ReadFlagsBinding),
    Effect.provide(Cloudflare.Workers.RateLimitBinding)
  )
) {}

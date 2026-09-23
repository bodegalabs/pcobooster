import { createHmac } from "node:crypto";
import path from "node:path";

import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import * as State from "alchemy/State";
import { Config, Effect, Layer, Redacted } from "effect";

import { prepareCloudflareBuild } from "./scripts/cloudflare/prepare";

const optionalSecret = (name: string) =>
  Config.Redacted(name).pipe(Config.withDefault(Redacted.make("")));

const canAttachDomains = (production: boolean) =>
  production && process.env.CLOUDFLARE_CUSTOM_DOMAINS === "1";

const productionSecrets = (production: boolean) => ({
  DEMO_ACCESS_KEY: production ? optionalSecret("DEMO_ACCESS_KEY") : "",
  DEMO_PLANNING_CENTER_CLIENT: production
    ? optionalSecret("DEMO_PLANNING_CENTER_CLIENT")
    : "",
  DEMO_PLANNING_CENTER_PAT: production
    ? optionalSecret("DEMO_PLANNING_CENTER_PAT")
    : "",
  NEXT_PUBLIC_POSTHOG_KEY: production
    ? optionalSecret("NEXT_PUBLIC_POSTHOG_KEY")
    : "",
});

const developmentSecrets = (local: boolean) => ({
  DEV_AUTH_BYPASS: local
    ? Config.String("DEV_AUTH_BYPASS").pipe(Config.withDefault(""))
    : "",
  PLANNING_CENTER_CLIENT: local ? optionalSecret("PLANNING_CENTER_CLIENT") : "",
  PLANNING_CENTER_PAT: local ? optionalSecret("PLANNING_CENTER_PAT") : "",
  PRESENTATION_MODE: local
    ? Config.String("PRESENTATION_MODE").pipe(Config.withDefault(""))
    : "",
  PRESENTATION_SEED: local ? optionalSecret("PRESENTATION_SEED") : "",
});

export default Alchemy.Stack(
  "pcobooster",
  {
    providers: Cloudflare.providers(),
    state: Layer.unwrap(
      Alchemy.Stage.pipe(
        Effect.map((stage) =>
          stage === "local" ? State.localState() : Cloudflare.state()
        )
      )
    ),
  },
  Effect.gen(function* infrastructure() {
    const stage = yield* Alchemy.Stage;
    const production = stage === "prod";
    const local = stage === "local";
    if (!/^(?:prod|staging|migration|local|pr-\d+)$/u.test(stage)) {
      return yield* Effect.die(
        new Error(`Unsupported deployment stage: ${stage}`)
      );
    }
    process.env.ADMIN_BASE_PATH = production ? "" : "/admin";
    yield* Effect.promise(async () => {
      await prepareCloudflareBuild(stage);
    });
    const workersSubdomain = yield* Config.String(
      "CLOUDFLARE_WORKERS_SUBDOMAIN"
    ).pipe(Config.withDefault("jakebodea"));
    const productOrigin = local
      ? "http://127.0.0.1:3001"
      : `https://pcobooster-${stage}-web.${workersSubdomain}.workers.dev`;
    const publicOrigin = production ? "https://pcobooster.com" : productOrigin;
    const attachDomains = canAttachDomains(production);
    const zone = production
      ? yield* Cloudflare.Zone.Zone("Zone", {
          name: "pcobooster.com",
          type: "full",
        }).pipe(RemovalPolicy.retain())
      : undefined;
    if (zone !== undefined) {
      for (const [id, issuer] of [
        ["Google", "pki.goog"],
        ["Sectigo", "sectigo.com"],
        ["LetsEncrypt", "letsencrypt.org"],
      ]) {
        yield* Cloudflare.DNS.Record(`CAA${id}`, {
          zoneId: zone.zoneId,
          name: "pcobooster.com",
          type: "CAA",
          content: `0 issue "${issuer}"`,
        });
      }
    }
    const authSecret = yield* Config.Redacted("BETTER_AUTH_SECRET");
    const stageAuthSecret =
      production || local
        ? authSecret
        : Redacted.make(
            createHmac("sha256", Redacted.value(authSecret))
              .update(stage)
              .digest("hex")
          );
    const database = yield* Cloudflare.D1.Database("Database", {
      name: `pcobooster-${stage}`,
      primaryLocationHint: "wnam",
      migrations: "./.alchemy/d1-migrations",
    }).pipe(RemovalPolicy.retain(production));

    const api = yield* Cloudflare.Worker("Api", {
      name: `pcobooster-${stage}-api`,
      main: "./apps/server/src/index.ts",
      workersDev: false,
      compatibility: { date: "2026-09-01", flags: ["nodejs_compat"] },
      dev: { host: "127.0.0.1", port: 3000, strictPort: true },
      env: {
        DB: database,
        NODE_ENV: local ? "development" : "production",
        APP_ENV: production ? "production" : "preview",
        BETTER_AUTH_URL: publicOrigin,
        CORS_ORIGIN: publicOrigin,
        AUTH_COOKIE_DOMAIN: production ? "pcobooster.com" : "",
        OAUTH_PROXY_SECRET: local ? "" : optionalSecret("OAUTH_PROXY_SECRET"),
        OAUTH_PROXY_PRODUCTION_URL: local ? "" : "https://pcobooster.com",
        OAUTH_PREVIEW_ORIGIN_PATTERN: `https://pcobooster-*-web.${workersSubdomain}.workers.dev`,
        BETTER_AUTH_SECRET: stageAuthSecret,
        PLANNING_CENTER_OAUTH_CLIENT_ID: Config.Redacted(
          "PLANNING_CENTER_OAUTH_CLIENT_ID"
        ),
        PLANNING_CENTER_OAUTH_CLIENT_SECRET: Config.Redacted(
          "PLANNING_CENTER_OAUTH_CLIENT_SECRET"
        ),
        PCOBOOSTER_ADMIN_EMAILS: Config.Redacted("PCOBOOSTER_ADMIN_EMAILS"),
        PEOPLE_PAGE_ENABLED: Config.String("PEOPLE_PAGE_ENABLED"),
        ...productionSecrets(production),
        ...developmentSecrets(local),
        PLANNING_CENTER_TIME_ZONE: Config.String(
          "PLANNING_CENTER_TIME_ZONE"
        ).pipe(Config.withDefault("America/Los_Angeles")),
      },
    });
    const admin = yield* Cloudflare.Website.Nextjs("Admin", {
      name: `pcobooster-${stage}-admin`,
      rootDir: path.join(import.meta.dirname, "apps/admin"),
      workersDev: production,
      domain: attachDomains
        ? { name: "admin.pcobooster.com", zone }
        : undefined,
      compatibility: { date: "2026-09-01", flags: ["nodejs_compat"] },
      dev: { mode: "hmr", port: 3003 },
      memo: {
        include: ["**/*"],
        exclude: [
          "node_modules/**",
          "dist/**",
          ".next/**",
          ".open-next/**",
          ".turbo/**",
          "*.tsbuildinfo",
        ],
        lockfile: true,
      },
      env: {
        API: api,
        NODE_ENV: "production",
        PRODUCT_ORIGIN: publicOrigin,
        ADMIN_BASE_PATH: production ? "" : "/admin",
      },
    });
    const web = yield* Cloudflare.Website.Nextjs("Web", {
      name: `pcobooster-${stage}-web`,
      rootDir: path.join(import.meta.dirname, "apps/web"),
      domain: attachDomains
        ? { name: "pcobooster.com", aliases: ["www.pcobooster.com"], zone }
        : undefined,
      compatibility: { date: "2026-09-01", flags: ["nodejs_compat"] },
      dev: { mode: "hmr", port: 3001 },
      memo: {
        include: ["**/*"],
        exclude: [
          "node_modules/**",
          "dist/**",
          ".next/**",
          ".open-next/**",
          ".turbo/**",
          "*.tsbuildinfo",
        ],
        lockfile: true,
      },
      env: {
        API: api,
        ADMIN: admin,
        NODE_ENV: "production",
        PRODUCT_ORIGIN: publicOrigin,
      },
    });
    return {
      web: web.url,
      admin: production ? admin.url : `${publicOrigin}/admin`,
      databaseId: database.databaseId,
      nameServers: zone?.nameServers,
    };
  })
);

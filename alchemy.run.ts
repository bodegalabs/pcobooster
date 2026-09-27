import { readdirSync } from "node:fs";
import path from "node:path";

import { parseAdminEmails } from "@pcobooster/api/config/server-config";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import * as State from "alchemy/State";
import { Config, Effect, Layer } from "effect";

import { Database } from "./apps/server/src/database";
import { workerObservability } from "./apps/server/src/observability";
import { currentStageSettings } from "./apps/server/src/stage";
import Api from "./apps/server/src/worker";
import { prepareCloudflareBuild } from "./scripts/cloudflare/prepare";
import {
  allowUniversalSslIssuers,
  formerDomainRedirect,
} from "./scripts/cloudflare/zones";

const workspacePackages = readdirSync(
  path.join(import.meta.dirname, "packages"),
  { withFileTypes: true }
).flatMap((entry) => (entry.isDirectory() ? [`packages/${entry.name}`] : []));

/**
 * What a product or admin rebuild depends on. The app root's explicit globs also hash the
 * gitignored `cloudflare-build-inputs.json` stamp (`scripts/cloudflare/prepare.ts`), which
 * carries the stage and inlined variables that Alchemy's memo cannot see. Every workspace
 * package, the build scripts, and the root configuration are listed as workspaces: an explicit
 * list replaces Alchemy's own detection of imported packages, and each entry is hashed with its
 * gitignore rules, so `node_modules` and build output never count.
 */
const viteMemo = (
  excludeFromApp: readonly string[],
  extraWorkspaces: readonly string[] = []
) => ({
  include: ["**/*"],
  exclude: [
    "node_modules/**",
    "dist/**",
    ".tanstack/**",
    ".turbo/**",
    ".wrangler/**",
    "*.tsbuildinfo",
    ...excludeFromApp,
  ],
  lockfile: true,
  workspaces: [
    ...[...workspacePackages, "scripts", ...extraWorkspaces].map(
      (directory) => ({ cwd: `../../${directory}` })
    ),
    {
      cwd: "../..",
      include: ["package.json", "turbo.json", "tsconfig.json"],
      lockfile: true,
    },
  ],
});

const canAttachDomains = (production: boolean) =>
  production && process.env.CLOUDFLARE_CUSTOM_DOMAINS === "1";

/** The only person staging admits. */
const stagingOwnerEmail = "jakebodea@gmail.com";

/**
 * Cloudflare Access in front of staging's product Worker, which serves the app, the API, and
 * admin. It covers the `workers.dev` URL and version preview URLs; the API and admin Workers have
 * no public URL outside production. The deploy-check service token (`alchemy.ci.ts`) lets CI
 * verify each deploy without a login.
 */
const stagingAccess = Effect.gen(function* stagingAccess() {
  const serviceTokenId = yield* Config.String(
    "STAGING_ACCESS_SERVICE_TOKEN_ID"
  );
  return {
    name: "pcobooster staging",
    sessionDuration: "168h",
    policies: [
      {
        decision: "allow" as const,
        include: [{ email: stagingOwnerEmail }],
      },
      {
        decision: "non_identity" as const,
        include: [{ serviceToken: serviceTokenId }],
      },
    ],
  };
});

/**
 * Cloudflare Access in front of the production admin Worker, admitting the same allowlist the
 * API enforces on every `admin.*` procedure, so a bug in the app's own check cannot expose it.
 * Off until `CLOUDFLARE_ADMIN_ACCESS=1` reaches the production deploy; see
 * docs/admin.md#cloudflare-access for the steps that must come first. Preview and local admin
 * Workers are reached only through the product's service binding, which Access never gates.
 */
const adminAccess = (production: boolean) =>
  Effect.gen(function* adminAccessPolicy() {
    const emails = parseAdminEmails(
      yield* Config.String("PCOBOOSTER_ADMIN_EMAILS").pipe(
        Config.withDefault("")
      )
    );
    const policy: Cloudflare.Workers.WorkerAccessApplication = {
      name: "pcobooster admin",
      sessionDuration: "24h",
      previews: false,
      policies: [
        { decision: "allow", include: emails.map((email) => ({ email })) },
      ],
    };
    const enabled = production && process.env.CLOUDFLARE_ADMIN_ACCESS === "1";
    return enabled ? policy : undefined;
  });

export default Alchemy.Stack(
  "pcobooster",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Drizzle.providers()),
    state: Layer.unwrap(
      Alchemy.Stage.pipe(
        Effect.map((stage) =>
          stage === "local" ? State.localState() : Cloudflare.state()
        )
      )
    ),
  },
  Effect.gen(function* infrastructure() {
    const { stage, production, local, staging, publicOrigin } =
      yield* currentStageSettings;
    if (stage === "test") {
      return yield* Effect.die(
        new Error(
          "The test stage belongs to the API stack test, not this stack"
        )
      );
    }
    process.env.ADMIN_BASE_PATH = production ? "" : "/admin";
    yield* Effect.promise(async () => {
      await prepareCloudflareBuild(stage);
    });
    const attachDomains = canAttachDomains(production);
    const zone = production
      ? yield* Cloudflare.Zone.Zone("Zone", {
          name: "pcobooster.com",
          type: "full",
        }).pipe(RemovalPolicy.retain())
      : undefined;
    if (zone !== undefined) {
      yield* allowUniversalSslIssuers("", zone, "pcobooster.com");
    }
    // Serves nothing until the registrar delegates the domain to this zone's nameservers.
    const formerZone = production
      ? yield* formerDomainRedirect(publicOrigin)
      : undefined;
    const database = yield* Database;
    // Effect-native: it reads its own settings and binds the database (`apps/server/src/worker.ts`).
    const api = yield* Api;
    // TanStack Start; its Vite `base` (and router basepath) come from ADMIN_BASE_PATH above.
    const admin = yield* Cloudflare.Website.Vite("Admin", {
      name: `pcobooster-${stage}-admin`,
      rootDir: path.join(import.meta.dirname, "apps/admin"),
      workersDev: production,
      domain: attachDomains
        ? { name: "admin.pcobooster.com", zone }
        : undefined,
      access: yield* adminAccess(production),
      compatibility: { date: "2026-09-01", flags: ["nodejs_compat"] },
      observability: workerObservability(production),
      dev: { host: "127.0.0.1", port: 3003, strictPort: true },
      memo: viteMemo([]),
      env: {
        API: api,
        PRODUCT_ORIGIN: publicOrigin,
      },
    });
    // TanStack Start. Its build stages the marketing site into `public/marketing` first.
    const web = yield* Cloudflare.Website.Vite("Web", {
      name: `pcobooster-${stage}-web`,
      rootDir: path.join(import.meta.dirname, "apps/web"),
      domain: attachDomains
        ? { name: "pcobooster.com", aliases: ["www.pcobooster.com"], zone }
        : undefined,
      access: staging ? yield* stagingAccess : undefined,
      compatibility: { date: "2026-09-01", flags: ["nodejs_compat"] },
      observability: workerObservability(production),
      dev: { host: "127.0.0.1", port: 3001, strictPort: true },
      // The build stages the marketing site, which the product does not import.
      memo: viteMemo(["public/marketing/**"], ["apps/marketing"]),
      env: {
        API: api,
        ADMIN: admin,
        PRODUCT_ORIGIN: publicOrigin,
        // The deployed commit, served at `/version` for post-deploy verification. As an env
        // prop it is part of the Worker's change hash, so every commit redeploys it.
        PCOBOOSTER_VERSION: Config.String("GITHUB_SHA").pipe(
          Config.withDefault("")
        ),
        // Local stage only, like the API's; production builds ignore it regardless.
        DEV_AUTH_BYPASS: local
          ? Config.String("DEV_AUTH_BYPASS").pipe(Config.withDefault(""))
          : "",
      },
    });
    return {
      web: web.url,
      admin: production ? admin.url : `${publicOrigin}/admin`,
      databaseId: database.databaseId,
      nameServers: zone?.nameServers,
      formerDomainNameServers: formerZone?.nameServers,
    };
  })
);

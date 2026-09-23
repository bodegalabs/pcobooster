# Cloudflare and Alchemy migration research

Research date: September 23, 2026. This is a recommendation and source record, not a claim that the migration or deployment has completed. The application is unused and in active development, but the user explicitly requires preservation of existing accounts and history. Production data must be exported, transformed, imported, and reconciled; only preview databases should start with fictional seed data.

## Recommendation

Move to Cloudflare Workers and D1, managed by an exactly pinned Alchemy v2 release. Keep the existing Turborepo, Next.js, Hono, oRPC, Drizzle, and Better Auth boundaries. Upgrade application Effect to the current v4 release candidate, as the user explicitly permits. Use complete `pr-<number>` Alchemy stages for previews, with their own API Worker and D1 database. Preserve Infisical as the secret source.

The important qualifications are concrete:

1. Alchemy v2 and Effect v4 are prereleases. Pin versions and treat upgrades as changes requiring validation.
2. Alchemy's current native Next.js integration pins an OpenNext version older than this application's `proxy.ts` support. Prefer `Website.Nextjs` with a deliberate OpenNext 1.20.6 override: source inspection supports compatibility, but both app builds and workerd execution must prove it.
3. Native Cloudflare Worker Previews currently route service bindings to the target Worker's production deployment. They are unsuitable for this application's complete multi-Worker preview without further indirection.
4. Registration transfer cannot finish now: the domain was registered September 18, 2026. Hosting and authoritative DNS can move now; the 60-day registration lock expires no earlier than November 17, 2026 at 19:52:51 UTC.

These points are supported in the sections below. The topology and sequencing are engineering recommendations based on the inspected repository.

## Current repository seams

The inspected checkout has Next.js `^16.3.5`, React `19.3.0`, Better Auth `1.7.5`, Drizzle ORM `^0.45.2`, and application Effect `3.22.2`. `apps/server/src/index.ts` composes Hono with Better Auth and the oRPC router. `apps/web/next.config.ts` rewrites local `/api/*` requests to the API and stages the static marketing build for deployment. Admin remains a separate Next.js application.

The database is relatively small in scope: Better Auth users/accounts/sessions/verifications, Planning Center account identities, and activity events. `packages/api/src/db/schema.ts` uses PostgreSQL types, and the admin reports contain PostgreSQL casts, arrays, and interval arithmetic. This is a real SQL migration, but does not require relocating the application's Planning Center domain model into the database.

The existing application runtime uses `ManagedRuntime`, two `Context.Tag` services, and `Data.TaggedError` classes. It does not have a large Effect Schema migration. Most domain functions already use `Effect.gen` and injected service interfaces.

## Version decisions

The npm registry was queried directly rather than inferring package versions from search results.

| Component | Observed release | Recommendation |
| --- | --- | --- |
| Alchemy | `latest` is `2.0.0-beta.79` | Pin this version for the initial migration; use its v2 API |
| Effect | `latest` is `3.22.2`; `rc` is `4.0.0-rc.117` | Pin `4.0.0-rc.117` consistently across application and infrastructure |
| OpenNext Cloudflare | `1.20.6` | Pin it for Next.js 16.3.5 |
| Alchemy frontend frameworks | `2.0.0-beta.79` | Optional; its exact OpenNext peer is `1.20.1`, so do not adopt blindly |
| Drizzle ORM | Existing `0.45.2` | Retain for plain `drizzle-orm/d1`; no need to take an unrelated ORM prerelease |

Alchemy v2's required Effect peer is `>=4.0.0-rc.115 || >=4.0.0`; its integrated Drizzle peers are optional and pin `1.0.0-rc.5-ab785fc`. Those optional wrappers are not needed to create D1 and pass its binding to existing Drizzle/Better Auth code. Sources: [Alchemy registry metadata](https://registry.npmjs.org/alchemy/2.0.0-beta.79), [Effect dist tags](https://registry.npmjs.org/-/package/effect/dist-tags), [OpenNext registry metadata](https://registry.npmjs.org/@opennextjs/cloudflare/1.20.6), [frontend integration metadata](https://registry.npmjs.org/@alchemy.run/frontend-frameworks/2.0.0-beta.79).

Alchemy's current documentation explicitly describes v2 as beta and warns of occasional breaking changes. Its API is `Alchemy.Stack`, `Effect.gen`, and `yield* Cloudflare.Worker(...)`; old `await alchemy(...)`, `bindings`, and `D1Database` examples belong to v1. For a new migration, v2 fits the requested Effect infrastructure direction; selecting v1 would defer another infrastructure migration. Sources: [Alchemy](https://alchemy.run/), [v1 migration guide](https://alchemy.run/migrating-from-v1).

### Effect v4 changes actually relevant here

| Existing API | v4 replacement |
| --- | --- |
| `Context.Tag(id)<Self, Shape>()` | `Context.Service<Self, Shape>()(id)` |
| `Effect.catchAll` | `Effect.catch` |
| `Effect.either` | `Effect.result` |
| `Either.right` / `Either.left` | `Result.succeed` / `Result.fail` |
| `Effect.zipRight` | `Effect.andThen` |
| `Cause.isInterruptedOnly` | `Cause.hasInterruptsOnly` |
| `Cause.failureOption` | `Cause.findErrorOption` |
| `Cause.failures` | Filter `cause.reasons` with `Cause.isFailReason`, then extract `.error` |
| `Cause.defects` | Filter `cause.reasons` with `Cause.isDieReason`, then extract `.defect` |

The cause structure is now a flat list of fail/die/interrupt reasons. Update `transport/orpc/execute.ts` carefully: preserve its distinction between one typed application fault, an unexpected defect, and cancellation. Preserve the existing tests proving canceled reads and already-started provider writes. Sources: [services migration](https://github.com/Effect-TS/effect-smol/blob/main/migration/services.md), [error handling](https://github.com/Effect-TS/effect-smol/blob/main/migration/error-handling.md), [cause migration](https://github.com/Effect-TS/effect-smol/blob/main/migration/cause.md), [API rename map](https://github.com/Effect-TS/effect-smol/blob/main/migration/v3-to-v4.md).

`ManagedRuntime` remains available. `Runtime<R>` and `Effect.runtime` were removed, but this repository's runtime wrapper already uses the managed variant. Keep the wrapper unless compilation or execution proves a necessary change. All Effect ecosystem packages should use matching v4 release versions. Sources: [runtime migration](https://github.com/Effect-TS/effect-smol/blob/main/migration/runtime.md), [overall migration guide](https://github.com/Effect-TS/effect-smol/blob/main/MIGRATION.md).

## Target deployment topology

| Resource | Responsibility | Exposure |
| --- | --- | --- |
| Product Worker | OpenNext web app and staged marketing assets | `pcobooster.com` |
| API Worker | Existing Hono/Better Auth/oRPC composition | Service binding from product/admin; public ingress only if required |
| Admin Worker | Existing admin Next.js app | `admin.pcobooster.com` |
| D1 database | Auth, identities, activity events | API Worker binding only |
| Alchemy state Worker | Shared infrastructure state | Alchemy remote state, separate from application data |
| PR stage copies | Product, admin, API and D1 per PR | Stage-specific hostnames or workers.dev |

Route browser `/api/*` from the product Worker to `env.API.fetch(request)`, retaining the original URL, headers, method, and body. This keeps Better Auth and oRPC on the browser origin. Use service bindings instead of internet requests between the Workers. Admin server calls should use its bound API too. A catch-all Next route handler using `getCloudflareContext()` or a supported custom Worker wrapper can perform forwarding; choose one and test cookies and streaming. Sources: [Cloudflare HTTP service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/), [OpenNext bindings](https://opennext.js.org/cloudflare/bindings), [custom Worker](https://opennext.js.org/cloudflare/howtos/custom-worker).

Recommendation: initially retain the static marketing build inside the product deployment. It already has an independent source/build boundary, and an additional network service adds no demonstrated migration benefit. Preserve public-path behavior for `/`, `/about`, and marketing assets. Worker asset routing must not bypass auth or proxy behavior on application paths.

No app-owned R2 bucket is presently required. Add cache storage only if actual Next.js ISR/revalidation needs it. Start with the OpenNext static-assets cache if appropriate; it serves prerendered cache data but does not persist revalidation writes. Enable writable cache storage only with a verified need and its required bindings. Source: [Alchemy Next.js cache setup](https://alchemy.run/cloudflare/frontend/nextjs/).

### Next.js compatibility: trust releases over the stale overview

OpenNext's overview claims support for Next 16 while still saying Node middleware is unsupported. The project subsequently released **experimental Node `proxy.ts` support in 1.20.3 on August 26**, along with Next 16.3 Turbopack WASM and instrumentation fixes. `1.20.6` includes these changes and declares Next `>=16.3.3` compatibility. Preserve `proxy.ts` initially and prove it in workerd and deployed Workers. Sources: [overview](https://opennext.js.org/cloudflare), [1.20.3 release](https://github.com/opennextjs/opennextjs-cloudflare/releases/tag/%40opennextjs%2Fcloudflare%401.20.3), [Node middleware implementation PR](https://github.com/opennextjs/opennextjs-cloudflare/pull/1309), [1.20.6 package](https://registry.npmjs.org/@opennextjs/cloudflare/1.20.6).

Alchemy's `Website.Nextjs` source runs OpenNext, a final bundling pass, static cache population, and adds `nodejs_compat`. The integration package pins OpenNext **1.20.1**, which predates that support. Two implementation options:

- Preferred: intentionally override the frontend package's exact OpenNext peer with 1.20.6, run both app builds, workerd previews, and deployed flows. Record this version mismatch rather than silently ignoring it.
- Fallback if that fails: build with `@opennextjs/cloudflare@1.20.6`, produce the final deployable Worker modules, and give them to `Cloudflare.Worker` with `bundle: false`, assets, and appropriate module rules.

The published beta.79 native runner resolves OpenNext from the app's dependency tree, then calls its private build functions. Comparing the published packages confirms that `ensure-cf-config.js` is identical in OpenNext 1.20.1 and 1.20.6, and the five-argument `build(options, config, projectOpts, wranglerConfig, allowUnsupportedNextVersions)` signature is unchanged. Its implementation change adds Node middleware bundling. The runner's three private AWS dependency files (`build/compileConfig.js`, `build/helper.js`, and `logger.js`) are identical between `@opennextjs/aws` 4.0.2 and 4.1.4, the respective dependencies of those OpenNext versions. This makes the override a reasonable first implementation; it is source compatibility evidence, not runtime verification. Sources: [Alchemy runner](https://github.com/alchemy-run/alchemy/blob/main/packages/frontend-frameworks/src/nextjs/runner.mjs), published [OpenNext 1.20.1](https://registry.npmjs.org/@opennextjs/cloudflare/1.20.1) and [1.20.6](https://registry.npmjs.org/@opennextjs/cloudflare/1.20.6) tarballs, [AWS 4.0.2](https://registry.npmjs.org/@opennextjs/aws/4.0.2) and [4.1.4](https://registry.npmjs.org/@opennextjs/aws/4.1.4) tarballs.

Set the OpenNext `buildCommand` explicitly to the appropriate Bun build command. The native runner defaults to `npx next build` and does not automatically execute the app's `build` script. Ensure the marketing staging step is included when building the product. Source: [Alchemy runner](https://github.com/alchemy-run/alchemy/blob/main/packages/frontend-frameworks/src/nextjs/runner.mjs).

Do not confuse `.open-next/worker.js` with a guaranteed completely self-contained upload. The normal Wrangler deployment performs a final bundling pass. If using the generic resource, prove the resulting module closure and WASM assets are complete; do not rebundle runtime-ready artifacts with an arbitrary bundler. Alchemy explicitly supports `bundle: false` for external prebuilt Workers. Sources: [Nextjs resource source](https://github.com/alchemy-run/alchemy/blob/main/packages/alchemy/src/Cloudflare/Website/Nextjs.ts), [framework build pipeline](https://github.com/alchemy-run/alchemy/blob/main/packages/frontend-frameworks/src/nextjs/Nextjs.ts), [Worker source](https://github.com/alchemy-run/alchemy/blob/main/packages/alchemy/src/Cloudflare/Workers/Worker.ts). These exact files were also inspected in published beta.79 tarballs.

Keep a pinned Workers compatibility date plus `nodejs_compat`. Verify compressed Worker size: Free is 3 MiB and Paid is 10 MiB. Node middleware can materially increase the bundle. A paid Workers plan may be required by the actual built app, independent of low user traffic. Source: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

### Native Next.js memoization in this monorepo

The beta.79 frontend source provider recursively walks only `rootDir`, then filters that file list with `memo.include`/`exclude`. It does not discover workspace dependencies; its build result sets `additionalWorkspaces: undefined`. Therefore `rootDir: "./apps/web"` misses changes in `packages/contracts`, models, design tokens, configuration, and marketing sources. Adding `../../packages/**` to `memo.include` does not work because the directory walker never visits those files. The default nearest-lockfile inclusion is also disabled as soon as either `include` or `exclude` is specified, unless `lockfile: true` is explicit. Source: published beta.79 [Next.js source provider](https://github.com/alchemy-run/alchemy/blob/main/packages/frontend-frameworks/src/nextjs/source.ts), specifically `listProjectFiles`, `hashInputTree`, and `makeProvider`.

Smallest reliable workaround: before each plan/deploy, generate a deterministic `cloudflare-build-inputs.json` inside each app root containing a digest of that app's external build inputs. Keep the native resource and add `memo: { lockfile: true }`; its default app-root hashing will include the generated file. Hash actual file contents and stable relative names, not only Git HEAD, so local uncommitted changes also invalidate the build. Cover shared packages, root configuration, root build scripts, and marketing source for the product. Include the non-secret build settings that affect emitted output: stage-specific admin `basePath`, public URLs, and `NEXT_PUBLIC_*` values. Ambient environment values are not part of `hashInputTree`.

Keep this generated stamp out of Git, but do not place it under `.alchemy`, `.turbo`, `dist`, or another always-pruned directory. Exclude its own contents from the external digest. A content-identical rerun must leave the same stamp; a shared-contract/token change, marketing edit, lockfile change, or preview/production admin-mode change must alter the computed input hash. Native memoization is only a deploy optimization; it does not replace Turborepo's build graph. This recommendation avoids patching a second prerelease dependency.

## D1 and Better Auth

Use `drizzle(binding, { schema })` from `drizzle-orm/d1`, SQLite table definitions, and Better Auth's Drizzle adapter with `provider: "sqlite"`. The published Better Auth 1.7.5 adapter exposes `transaction?: boolean` and defaults it to false. Set `transaction: false` explicitly for D1; do not imply the existing interactive PostgreSQL transaction behavior remains. Sources: [Drizzle D1](https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1), [Better Auth Drizzle](https://better-auth.com/docs/adapters/drizzle), [Better Auth adapter source](https://github.com/better-auth/better-auth/blob/main/packages/drizzle-adapter/src/drizzle-adapter.ts), plus installed `@better-auth/drizzle-adapter@1.7.5` declarations and implementation.

Recommended type conversions:

| PostgreSQL | SQLite/Drizzle |
| --- | --- |
| `pgTable` | `sqliteTable` |
| `boolean` | `integer(..., { mode: "boolean" })` |
| Timestamp with timezone | `integer(..., { mode: "timestamp_ms" })` |
| `jsonb` | `text(..., { mode: "json" })` with the existing JSON type |
| `bigserial` activity ID | Integer primary key with auto increment |
| PostgreSQL provider arrays | JSON aggregation or typed application aggregation |
| `now() - interval ...` | Bound epoch-millisecond cutoffs computed once per report |
| `::int` casts | SQLite numeric expressions or Drizzle typed projections |

Choose one persisted timestamp unit, including SQL defaults and raw report comparisons. Milliseconds align with `Date.getTime()` and preserve the existing precision. Validate raw query output before turning it into dates. SQLite supports JSON and aggregate filtering; remove PostgreSQL-only syntax without unnecessarily replacing supported SQL. Source: [Drizzle SQLite types](https://orm.drizzle.team/docs/sqlite/column-types), [D1 SQL](https://developers.cloudflare.com/d1/sql-api/sql-statements/).

D1 `batch()` executes statements as a transaction and rolls back the sequence on failure, but this is not a callback transaction that can pause for application logic. Keep foreign keys, unique indexes, and explicit failure handling. Start without read replication: normal D1 bindings continue using the primary, while replica consistency requires the Sessions API. Sources: [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/), [read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/).

D1 is appropriate for this small metadata/auth database, with known constraints: 100 bound parameters per statement, single-threaded queries per database, and a 10 GB paid per-database maximum. Keep bulk inserts below the parameter cap. Preserve indexes and avoid full scans for admin reports. Source: [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

Create a fresh SQLite schema baseline and preserve production data through a separate export/transform/import. Keep historical PostgreSQL migrations clearly archived until retiring the old database; do not attempt to run them against D1. Preserve primary keys, users, linked accounts, Planning Center identities, and activity history. Transform timestamps to the chosen SQLite unit, booleans to integers, and JSON values to canonical JSON text. Preserve account token fields securely; retaining the existing Better Auth secret is necessary when transferring values encrypted or signed with it. Whether existing sessions remain valid must be tested, not assumed.

Make the transfer repeatable and non-destructive: export from one consistent PostgreSQL snapshot, record secret-free per-table counts and reconciliation digests, import to a new D1 database, verify all IDs and foreign keys, and compare reporting output. Keep the sensitive dump outside Git and normal logs. Avoid concurrent writes during the final snapshot/cutover or explicitly reconcile a final delta. A successful empty-database login is insufficient evidence for this migration's data-preservation requirement.

### Exact Alchemy v2 resource shape

Illustrative composition using the inspected beta.79 API:

```ts
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
  "pcobooster",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const database = yield* Cloudflare.D1.Database("Database", {
      primaryLocationHint: "wnam",
      migrations: "../../packages/api/migrations",
    });
    const api = yield* Cloudflare.Worker("Api", {
      main: "../../apps/server/src/worker.ts",
      compatibility: { date: "2026-09-23", flags: ["nodejs_compat"] },
      env: {
        DB: database,
        BETTER_AUTH_SECRET: Config.Redacted("BETTER_AUTH_SECRET"),
      },
    });
    return { apiUrl: api.url, databaseId: database.databaseId };
  })
);
```

Paths above assume an infrastructure package two directories below the repository root; resolve paths deliberately in the implementation. `migrations` is the v2 input property; `migrationsDir` is an output, not the input shown in old tutorials. Alchemy maintains `__alchemy_migrations` and can adopt another tool's history by one-way conversion. Do not subsequently alternate Alchemy and Wrangler migration ownership. Source: [D1 resource source](https://github.com/alchemy-run/alchemy/blob/main/packages/alchemy/src/Cloudflare/D1/Database.ts), inspected in beta.79.

Worker `env` accepts native resources, ordinary values, or Effect Config values. `Config.Redacted` is secret text; plain string literals become ordinary environment text. A Worker resource bound through `env` becomes a native service binding. API composition should receive `env.DB` through an explicit factory/dependency boundary; avoid a mutable process-global database or per-request mutation of `process.env`. Source: [Worker source](https://github.com/alchemy-run/alchemy/blob/main/packages/alchemy/src/Cloudflare/Workers/Worker.ts).

## Preview lifecycle and local development

Cloudflare's new native Worker Previews launched September 22 and require Wrangler 4.135.0. D1, KV, and R2 are isolated only if each Preview uses different resources. Crucially, a service binding from a Preview still calls the target Worker's production deployment. Source: [Worker Previews](https://developers.cloudflare.com/workers/previews/), [binding isolation and limitations](https://developers.cloudflare.com/workers/previews/resources/).

Use `alchemy deploy --stage pr-123` to provision a complete stack with distinct physical resources; all service bindings refer to resources created inside that stage. On close/merge, `alchemy destroy --stage pr-123` removes the stack. Keep permanent `prod` outside cleanup inputs. Alchemy's remote state must be shared across laptops and CI. Source: [Alchemy CI tutorial](https://alchemy.run/cloudflare/tutorial/part-5/), [stages](https://alchemy.run/environments/stages), [Alchemy preview comparison](https://alchemy.run/cloudflare/compute/previews/).

Recommended CI behavior:

- Run the existing strict CI and both relevant builds before deployment.
- Allow preview deployment only for trusted repository branches; fork PR checks should not obtain deployment or Infisical credentials.
- Serialize apply/destroy for each stage without canceling an in-flight infrastructure operation.
- Give every PR an empty D1 migrated from checked-in SQL and fictional seed data; never clone production sessions/tokens automatically.
- Publish deployment URLs and commit SHA only after smoke checks pass. Record stage, D1 ID, and Worker version IDs for proof.
- On close, validate a strict `pr-<digits>` stage pattern before destroy. Make cleanup rerunnable and add a stale-stage audit for failed jobs.

Keep local fast Next.js development where useful, but verify deployment bundles in workerd. Alchemy's local mode can emulate resources, with explicit opt-in to remote resources; OpenNext HMR executes in Node and is not evidence of Workers runtime compatibility. Source: [Alchemy local development](https://alchemy.run/environments/local-development), [Next.js local modes](https://alchemy.run/cloudflare/frontend/nextjs/).

Preview authentication needs deliberate Planning Center OAuth callback handling. A distinct database alone does not make writes to the external Planning Center account isolated. Initially use fictional presentation data for routine PR review, and a controlled authenticated staging hostname with an explicitly registered callback for real API contract/OAuth validation. Preserve read-only demo enforcement. The OAuth application's callback inventory must be checked live; the existing production callback remains `https://pcobooster.com/api/auth/callback/planning-center`.

### Authenticated PR previews: supported mechanism, remaining validation gap

Better Auth 1.7.5's `oAuthProxy` supports a shared production callback with separate preview databases. The production instance exchanges the authorization code, then transfers an encrypted profile and provider tokens to the preview. The preview creates its own account/session. Use a dedicated shared `OAUTH_PROXY_SECRET`; keep production and preview `BETTER_AUTH_SECRET` values distinct. Sources: [OAuth proxy guide](https://better-auth.com/docs/plugins/oauth-proxy), [versioned plugin source](https://github.com/better-auth/better-auth/blob/v1.7.5/packages/better-auth/src/plugins/oauth-proxy/index.ts).

This repository already uses `genericOAuth` and `authClient.signIn.social`, the routes the proxy hooks recognize. There is no need to change the production callback registration. A candidate plugin addition on participating production and trusted-preview deployments is:

```ts
import { oAuthProxy } from "better-auth/plugins/oauth-proxy";

oAuthProxy({
  productionURL: "https://pcobooster.com",
  currentURL: deploymentOrigin,
  secret: oauthProxySecret,
  maxAge: 60,
});
```

Here `deploymentOrigin` must be the configured public origin of that exact stage, also used for `baseURL`; do not infer it from arbitrary forwarded headers. The registered provider callback stays `/api/auth/callback/planning-center` on production, while preview completion is `/api/auth/callback/planning-center/oauth-proxy` on the preview origin. Ordinary production sign-in skips the proxy. Source: [versioned proxy implementation and URL resolution](https://github.com/better-auth/better-auth/tree/v1.7.5/packages/better-auth/src/plugins/oauth-proxy), [generic OAuth routes](https://better-auth.com/docs/plugins/generic-oauth).

Configure `trustedOrigins` with exact deployed origins where possible. Better Auth supports glob patterns such as `https://pcobooster-pr-*-web.OWNED-ACCOUNT.workers.dev`; the account and Worker-name namespace must be owned and reserved for this deployment. A `*` is not a numeric PR validator. Validate `pr-<digits>` before provisioning and generate an exact origin list, or add a server-side numeric hostname check if exact enumeration is impractical. Never trust all `workers.dev` hosts. Keep origin and CSRF checks enabled. Source: [Better Auth options](https://better-auth.com/docs/reference/options), [versioned origin matcher](https://github.com/better-auth/better-auth/blob/v1.7.5/packages/better-auth/src/auth/trusted-origins.ts).

**Do not enable this as already verified:** source comparison found that the 1.7.5 proxy callback bypasses three checks present in the regular callback: it does not validate an authorization response's `iss`, does not enforce `provider.requiresIdTokenNonce`, and does not pass `stateData.idTokenNonce` to `provider.getUserInfo` as `expectedIdTokenNonce`. The verifier compares the ID-token nonce only when an expected nonce is supplied. Planning Center's discovery advertises an issuer, JWKS, and RS256, so the regular generic provider normally uses nonce binding. This is a verified source discrepancy, not a demonstrated exploit. Resolve it with an upstream fix or a narrowly maintained patch and regression tests before claiming equivalent authenticated PR behavior; do not turn off nonce binding. Sources: [proxy callback](https://github.com/better-auth/better-auth/blob/v1.7.5/packages/better-auth/src/plugins/oauth-proxy/index.ts), [regular callback](https://github.com/better-auth/better-auth/blob/v1.7.5/packages/better-auth/src/api/routes/callback.ts), [ID-token verifier](https://github.com/better-auth/better-auth/blob/v1.7.5/packages/core/src/oauth2/verify-id-token.ts), [Planning Center discovery](https://api.planningcenteronline.com/.well-known/openid-configuration).

The selected implementation below addresses these gaps without changing the production callback or building a new OAuth protocol. Until it is integrated and a deployed round trip passes, do not claim ordinary PR sign-in is available. Validation must prove the production database does not gain preview accounts/sessions; the preview database does; its cookie is host-only and secure; expired/replayed state and mismatched nonce/issuer are rejected; and logout leaves production untouched.

### Selected implementation: patched proxy and same-origin admin preview

The current Planning Center configuration is OIDC: it specifies discovery and `openid`, `services`, and `people` scopes. Pinning authorization/token/userinfo endpoints does not turn it into plain OAuth while discovery succeeds. Planning Center documents ID tokens and requires clients to compare any nonce they sent. The conditional response-`iss` check applies only if the provider returns that response parameter; the signed ID token's issuer/audience/signature checks continue through Better Auth's generic provider. Do not remove discovery or `openid` to avoid the missing nonce forwarding. Sources: existing `packages/api/src/auth.ts`; [Planning Center authentication](https://api.planningcenteronline.com/docs/overview/authentication), [generic provider implementation](https://github.com/better-auth/better-auth/blob/v1.7.5/packages/better-auth/src/plugins/generic-oauth/index.ts).

| Approach | Finding | Decision |
| --- | --- | --- |
| Register every PR callback directly | Public `OauthApplication` API documents GET list/read only; it exposes no callback mutation. The add-ons CLI requires its callback to already match the application's configured list. Dashboard changes can support fixed staging, but no supported unattended registration API was found. | Do not make every PR depend on browser-session automation |
| Better Auth proxy with a focused pinned patch | Already implements code exchange, encrypted transfer, stage-local session creation, state consumption, and provider integration | Preferred implementation |
| New central callback Worker/protocol | Would need receiver routing, replay/state storage, encryption/key ownership, token exchange, and equivalent OIDC checks | Unnecessary new auth surface for this migration |

Sources: [Planning Center OauthApplication API](https://api.planningcenteronline.com/docs/apps/api/versions/2025-09-30/vertices/oauth_application), [add-ons CLI callback requirements](https://api.planningcenteronline.com/docs/overview/add-ons/add-ons-cli). The logged-in application's exact callback list and maximum size were not inspected; this does not assert the dashboard has no editing capability.

Apply the minimal correction with Bun's dependency patch workflow, pinned to `better-auth@1.7.5`: `bun patch better-auth@1.7.5`, edit its `dist/plugins/oauth-proxy/index.mjs`, then `bun patch --commit better-auth@1.7.5`. Commit the generated patch and lockfile changes, and keep regression tests that exercise the installed patched package. Source: [Bun patch](https://bun.sh/docs/pm/cli/patch).

The patch needs these exact changes in the proxy callback hook:

```ts
// Add to oauthCallbackQuerySchema and its parsed destructuring.
iss: z.string().optional();
const { code, error, user: userData, iss } = query.data;

// After resolving provider, before validateAuthorizationCode.
if (iss && provider.issuer && iss !== provider.issuer) {
  throw redirectOnError(ctx, errorURL, "issuer_mismatch");
}
if (provider.requiresIdTokenNonce && !stateData.idTokenNonce) {
  throw redirectOnError(ctx, errorURL, "nonce_binding_missing");
}

// Add inside the existing provider.getUserInfo argument.
...(stateData.idTokenNonce
  ? { expectedIdTokenNonce: stateData.idTokenNonce }
  : {}),
```

These are insertion excerpts, not one standalone program. Preserve the existing code verifier, token exchange, user-profile handling, and account-key resolution.

Also validate both sides of the profile transfer. This helper restricts completion destinations to the receiving instance's own origin:

```ts
const isSameOriginCallback = (value, origin) => {
  try {
    const target = new URL(value, origin);
    return target.origin === origin && !target.username && !target.password;
  } catch {
    return false;
  }
};

// Immediately after decrypting/parsing payload, before using payload.errorURL.
const completionOrigin = new URL(ctx.context.baseURL).origin;
if (
  [payload.callbackURL, payload.errorURL, payload.newUserURL].some(
    (value) =>
      value !== undefined && !isSameOriginCallback(value, completionOrigin)
  )
) {
  throw redirectOnError(ctx, defaultErrorURL, "invalid_callback_url");
}
```

On the broker side, move construction of `proxyCallbackURL` to just after parsing `stateData`, before exchanging tokens. Catch invalid URLs; reject credentials in the URL, origins outside `ctx.context.isTrustedOrigin(...)`, and paths other than `${basePath}/callback/${providerId}/oauth-proxy`. Validate `stateData.errorURL` against that receiver's origin and normalize it to an absolute URL before redirecting. The receiver must reject a payload pointing to production even if production is present in its broader `trustedOrigins` list. Thus an encrypted payload is not permission for a cross-origin completion redirect. Keep preview client `errorCallbackURL` absolute to its own origin so broker failures return to the correct app.

```js
let proxyCallbackURL;
try {
  proxyCallbackURL = new URL(stateData.callbackURL);
} catch {
  throw redirectOnError(
    ctx,
    `${ctx.context.baseURL}/error`,
    "invalid_callback_url"
  );
}
const completionPath = `${ctx.context.options.basePath || "/api/auth"}/callback/${ctx.params.id}/oauth-proxy`;
if (
  proxyCallbackURL.username ||
  proxyCallbackURL.password ||
  !ctx.context.isTrustedOrigin(proxyCallbackURL.origin) ||
  proxyCallbackURL.pathname !== completionPath ||
  (stateData.errorURL &&
    !isSameOriginCallback(stateData.errorURL, proxyCallbackURL.origin))
) {
  throw redirectOnError(
    ctx,
    `${ctx.context.baseURL}/error`,
    "invalid_callback_url"
  );
}
const errorURL = new URL(
  stateData.errorURL || "/auth",
  proxyCallbackURL.origin
).toString();
```

Remove the later duplicate `const proxyCallbackURL = ...`; reuse the validated instance when attaching the encrypted profile.

Configure production as a broker only. It needs the plugin hooks to process proxied authorization responses, but does not need either plugin completion endpoint:

```ts
const proxy = oAuthProxy({
  productionURL: "https://pcobooster.com",
  currentURL: deploymentOrigin,
  secret: oauthProxySecret,
  maxAge: 60,
});
const proxyPlugin = production ? { ...proxy, endpoints: {} } : proxy;
```

This preserves the normal core production callback and removes both `/callback/:id/oauth-proxy` and the legacy alias from production. Do not disable only one concrete provider path: the completion route is parameterized. A production host should never accept preview-key-encrypted profile data as authority to create a production session. Keep the shared proxy key restricted to trusted repository deployments; do not give it to fork PRs. This role separation was exercised with the real 1.7.5 package in the isolated harness described below.

For admin previews, expose the admin Worker under the product preview's `/admin` path:

1. Build `apps/admin` with `basePath: "/admin"` in preview stages and `basePath: ""` for production. This is a build-time setting; include it in the memoization stamp. Existing `next/link` paths get the prefix automatically.
2. Create the admin Worker first, bind it as `ADMIN` to the product Worker, and forward `/admin` plus `/admin/*` through a product route handler at `app/admin/[[...path]]/route.ts`. Preserve the full URL/path, method, headers, body, streaming response, cookies, and cache headers. Forward `/admin/_next/*` as well as HTML and RSC navigation requests. The same service-binding approach is already used for `/api`.
3. Keep the product's host-only auth cookie. Admin receives that cookie on the same host and forwards it to the stage API service binding, which uses the stage's D1. On a 401, redirect to the product's `/auth?next=/admin`; the existing return-path sanitizer allows `/admin`. The API's admin allowlist remains authoritative.
4. Publish the preview admin URL as `${productOrigin}/admin`. The admin Worker can have public `workers.dev` ingress disabled for preview stages because only its service binding is needed. Production remains at `admin.pcobooster.com` with its existing cookie sharing and an empty base path.

The native `Website.Nextjs` resource omits custom `main`/`script` properties. A supported Next route handler is the smallest integration here; a custom Worker wrapper would require a different source-build integration. Verify direct page load, CSS/font assets, account-row navigation, RSC fetches, unauthenticated return-to-admin, and forbidden-user behavior. Sources: [Next.js basePath](https://nextjs.org/docs/app/api-reference/config/next-config-js/basePath), [route handlers](https://nextjs.org/docs/app/getting-started/route-handlers), inspected installed Next.js documentation, and the published Alchemy Nextjs resource type.

#### Synthetic verification performed

Temporary files outside the repository:

- `/tmp/pcobooster-alchemy-research/oauth-proxy-flow.mjs`: reproduces the stock behavior with two Better Auth instances, separate in-memory databases, different main secrets, and a shared synthetic proxy key.
- `/tmp/pcobooster-alchemy-research/prepare-oauth-proxy-patch.py`: copies the installed package into a temporary directory and applies the proposed changes without touching the installed package.
- `/tmp/pcobooster-alchemy-research/oauth-proxy-1.7.5.patch`: complete exact diff of that isolated dependency patch.
- `/tmp/pcobooster-alchemy-research/oauth-proxy-patched-flow.mjs`: exercises that patched copy.

All six patched scenarios passed: valid login returns to `/admin`, forwards the expected nonce, creates one preview user/session and no production rows; wrong issuer and missing required nonce fail before token exchange; a provider rejects mismatched nonce; an untrusted broker receiver fails before exchange; and a cross-origin completion target fails even when that origin is otherwise trusted. Current and legacy completion endpoints return 404 on the production instance while its broker flow works. The tests use only synthetic data, no real provider/network calls. The provider spy establishes nonce forwarding; repository tests should additionally verify a signed OIDC token against test JWKS, plus state replay/expiry and live Planning Center/workerd flows. This is evidence for the narrow implementation, not a claim of completed deployment or comprehensive auth audit.

### Preview cookies and demo credentials

Production currently sets `Domain=pcobooster.com` to share sign-in with `admin.pcobooster.com`. A preview beneath any `*.pcobooster.com` host receives that production cookie even when its own cookies are host-only. Therefore prefer stage-specific `workers.dev` hostnames outside the production cookie domain. On previews, leave `AUTH_COOKIE_DOMAIN` unset and disable Better Auth `crossSubDomainCookies`. Preserve production's existing admin SSO separately. This also means a host-only product preview login does not automatically sign into a separate admin preview; use a same-origin admin route or explicitly design and verify its own login before promising admin preview authentication. Sources: existing `packages/api/src/auth.ts` and `docs/admin.md`; [Better Auth cookie settings](https://better-auth.com/docs/concepts/cookies), [cookie Domain semantics](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#domain).

The existing demo is not a fictional database: `DEMO_PLANNING_CENTER_CLIENT` and `DEMO_PLANNING_CENTER_PAT` read a real Planning Center organization through an application-level read-only adapter. Do not automatically copy production demo credentials into every PR. Keep the production demo configured to preserve current behavior; use separately scoped staging credentials for controlled preview/demo verification, ideally a dedicated test organization. Only enable those secrets on trusted protected stages. A per-stage `DEMO_ACCESS_KEY` limits shared link/session reuse, but the underlying PAT still grants whatever Planning Center permissions its owner has. Routine PRs should use fictional fixtures until a live demo stage is deliberately enabled. Sources: existing `packages/api/src/auth/demo-access.ts`, `packages/api/src/application/planning-center-access.ts`, and `docs/demo.md`.

## Infisical and credential ownership

Infisical has a first-party **Cloudflare Workers** sync, not just Pages. It targets a `scriptId` and supports environment/path selection and automatic synchronization. Its API additionally exposes `disableSecretDeletion` and `syncNonSecretBindings`. Sources: [Workers sync guide](https://infisical.com/docs/integrations/secret-syncs/cloudflare-workers), [create sync API](https://infisical.com/docs/api-reference/endpoints/secret-syncs/cloudflare-workers/create).

Recommendation: for this migration, use Infisical at deployment time to inject an allowlisted set of application secrets into Alchemy `Config.Redacted` bindings. This gives ephemeral PR resources one owner and avoids creating/destroying a separate sync object for every Worker. Keep stage URLs, D1 bindings, and public frontend build variables in deployment configuration. Cloudflare/Infisical administration tokens must never be bound to application Workers.

If automatic post-deploy secret sync is desired later, make Infisical the single owner of those secret bindings and verify that Alchemy preserves them. Do not have Alchemy and auto-sync race to overwrite the same names. Do not turn on non-secret binding replacement without verifying it preserves API and D1 bindings. `NEXT_PUBLIC_*` build values still need a rebuilt frontend when changed; runtime Worker secret synchronization does not rewrite JavaScript already emitted to the browser.

Alchemy supports profile-based local authentication and environment credentials in CI; remote state must be bootstrapped before shared CI applies. Use account-scoped deployment permissions for Workers, D1 and the chosen state resources; DNS/domain permissions belong in the appropriate infrastructure operation. Source: [Alchemy Cloudflare setup](https://alchemy.run/cloudflare/setup), [CI credentials](https://alchemy.run/cloudflare/tutorial/part-5/).

### Alchemy authentication and state bootstrap

Alchemy beta.79 does not import Wrangler's OAuth credentials. Its Cloudflare provider has its own OAuth client and credential files; it rejects stored OAuth issued to a different client. Restoring a Wrangler login therefore does not authenticate Alchemy. Sources: [Cloudflare auth provider](https://github.com/alchemy-run/alchemy/blob/main/packages/alchemy/src/Cloudflare/Auth/AuthProvider.ts), [OAuth client](https://github.com/alchemy-run/alchemy/blob/main/packages/alchemy/src/Cloudflare/Auth/OAuthClient.ts), inspected in the beta.79 tarball.

With the pinned Alchemy CLI installed, connect the default profile using:

```sh
bun alchemy profile edit --add Cloudflare
```

The provider offers browser OAuth or stored credentials. For an already connected profile use `--reconfigure Cloudflare`; refreshing its current method is `bun alchemy profile refresh --provider Cloudflare`. A scoped API token can be configured without putting its value in command arguments:

```sh
bun alchemy profile edit --add Cloudflare --method stored \
  --set accountId=env:CLOUDFLARE_ACCOUNT_ID \
  --set apiToken=env:CLOUDFLARE_API_TOKEN
```

OAuth needs an interactive terminal/browser. CI uses environment credentials and does not consult local profiles. Source: [profile CLI](https://alchemy.run/cli/profile/).

Then initialize shared remote state explicitly, or accept the automatic bootstrap on the first deploy using `Cloudflare.state()`:

```sh
bun alchemy provider cloudflare bootstrap
```

This provisions the state Worker, Secrets Store, and state authentication secret. The command is idempotent: without `--force`, it adopts an existing Worker and refreshes its local state credentials. Keep these state credentials separate from application secrets and ensure CI can access the same state store. Source: [Cloudflare provider CLI](https://alchemy.run/cli/cloudflare/).

### GitHub Actions OIDC and least-privilege Infisical access

The repository currently has no GitHub Actions secrets. OIDC removes the need for an Infisical client secret: give the deployment job `id-token: write` and `contents: read`, authenticate a dedicated machine identity with GitHub's ID token, and retrieve the Cloudflare deployment credential from Infisical. Keep identity/project IDs in GitHub variables; they are identifiers rather than credentials. Sources: [Infisical GitHub OIDC](https://infisical.com/docs/documentation/platform/identities/oidc-auth/github), [official action](https://github.com/Infisical/secrets-action).

A read-only query of `repos/bodegalabs/pcobooster/actions/oidc/customization/sub` returned `use_default: true`, `use_immutable_subject: true`, and prefix `repo:bodegalabs@305914027/pcobooster@1125110564`. Therefore a job with GitHub environment `production` has the expected subject `repo:bodegalabs@305914027/pcobooster@1125110564:environment:production`; use `:environment:preview` for the preview identity. Do not configure the older subject that omits numeric IDs. GitHub environments replace the branch/PR suffix in the subject, so production must additionally bind the `ref` claim to `refs/heads/main`. Source: [GitHub OIDC claims](https://docs.github.com/en/actions/reference/security/oidc).

For each identity, set discovery URL and issuer to `https://token.actions.githubusercontent.com`, choose an explicit audience such as `https://app.infisical.com` in both the identity policy and action, and leave the CA certificate unset. Bind `repository_id` to `1125110564`, `repository_owner_id` to `305914027`, the exact environment subject, and `workflow_ref` to the intended workflow filename/ref. For production use its exact `.../.github/workflows/<filename>.yml@refs/heads/main`. Preview refs vary; combine its exact workflow filename with the required event and same-repository PR guard. A wildcard in `workflow_ref` does not make untrusted repository code safe. Source: [Infisical OIDC configuration](https://infisical.com/docs/documentation/platform/identities/oidc-auth/general).

The current public OpenAPI describes `POST /api/v1/auth/oidc-auth/identities/<identity-id>` with string fields `boundAudiences` and `boundSubject`, object `boundClaims`, and explicit `accessTokenTTL`/`accessTokenMaxTTL`. Set both TTLs to 3600 seconds rather than relying on differing documented defaults. Attach project membership through `POST /api/v1/projects/<project-id>/memberships/identities/<identity-id>`. These are setup APIs; this research did not execute them. Source: [live Infisical OpenAPI](https://app.infisical.com/api/docs/json).

The Free plan's project Viewer role can read every environment in that project. Export filters in a workflow do not constrain what its identity can request. Do not grant the preview identity Viewer in the existing mixed production/staging project. The newer **Folder-Level Access** UI replaces Additional Privileges, but is also a **paid Pro feature**: current official docs say so explicitly, and the backend checks `plan.secretsFolderRbac` before allowing grants. Sources: [project roles](https://infisical.com/docs/documentation/platform/access-controls/role-based-access-controls), [folder access documentation source](https://github.com/Infisical/infisical/blob/main/docs/documentation/platform/access-controls/folder-rbac.mdx), [license enforcement](https://github.com/Infisical/infisical/blob/main/backend/src/services/folder-permission/folder-permission-service.ts#L87).

On an entitled plan, use project No Access plus folder **Read** on a dedicated staging `/cloudflare-preview` folder containing only approved deploy secrets. A folder grant applies to that exact folder, does not inherit into children, and survives moves/renames. Granting staging `/` would still expose every root secret, including a colocated legacy `DATABASE_URL`. The current identity grant route is `POST /api/v1/projects/<project-id>/memberships/identities/<identity-id>/secret-folder-access`, body `{"environmentSlug":"staging","secretPath":"/cloudflare-preview","permission":"read","type":{"isTemporary":false}}`. Source: [official identity-folder tests](https://github.com/Infisical/infisical/blob/main/backend/e2e-test/routes/v1/identity-folder-access.spec.ts).

For Free, the practical supported boundary is a separate **preview deployment project** containing only an allowlisted set of preview application credentials and its Cloudflare deployment token. Give the identity organization No Access and project Viewer, with no membership in the original project. Free includes unlimited projects but only five identities, so check remaining identity capacity. A separate production deployment project likewise avoids exposing unrelated legacy credentials. An environment/path-scoped read-only service token is a fallback, but is long-lived, requires a GitHub secret, and cannot exclude a secret colocated in the selected folder. Sources: [current pricing](https://infisical.com/pricing), [service-token scopes](https://infisical.com/docs/documentation/platform/token).

Verified action configuration, placed in an already approved deployment job after the normal checkout/setup steps:

```yaml
permissions:
  contents: read
  id-token: write
# Set the job's environment to production or preview and bind OIDC accordingly.
steps:
  - name: Read deployment secrets
    uses: Infisical/secrets-action@d2e351f16c6ca20d17c85e6c992e04bdeb64e87d # v1.0.18
    with:
      method: oidc
      identity-id: ${{ vars.INFISICAL_IDENTITY_ID }}
      project-id: ${{ vars.INFISICAL_PROJECT_ID }}
      env-slug: ${{ vars.INFISICAL_ENV_SLUG }}
      domain: https://app.infisical.com
      oidc-audience: https://app.infisical.com
      secret-path: /
      include-imports: "false"
      recursive: "false"
      export-type: env
```

Use the deployment project's real environment slug and the actual Infisical regional domain. The action masks/export values without needing to print them. Set `secret-path` to the dedicated folder when using paid folder access. No deployment command is included here because the user now requires a separate confirmation before **each deployment**, including repeat attempts; CI setup approval does not authorize automatic deployment. Local runs should use the existing Alchemy profile and the requested `bun alchemy deploy` workflow, without asking the user to export Cloudflare credentials. The user chose continuing this migration rather than creating the guide's example app. Source for action inputs: [pinned action metadata](https://github.com/Infisical/secrets-action/blob/d2e351f16c6ca20d17c85e6c992e04bdeb64e87d/action.yaml).

### Alchemy CI state and Cloudflare token scope

Alchemy beta.79 resolves CI credentials from `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`; it does not use a developer's saved profile in CI. Infisical can supply these to the job automatically. Native `Cloudflare.state()` recovers its state bearer token using the account's Secrets Store and an ephemeral edge-preview Worker, then accesses the account's `alchemy-state-store` Worker. It does not require a separately supplied `ALCHEMY_PASSWORD`. Bootstrap the pinned state implementation interactively before CI; `--yes` can otherwise bootstrap or upgrade state during a deployment. Keep state credentials out of build artifacts and app Worker bindings. Sources: inspected beta.79 [credential resolution](https://github.com/alchemy-run/alchemy/blob/main/packages/alchemy/src/Auth/Resolve.ts), [provider environment inputs](https://github.com/alchemy-run/alchemy/blob/main/packages/alchemy/src/Cloudflare/Auth/AuthProvider.ts), [native state implementation](https://github.com/alchemy-run/alchemy/blob/main/packages/alchemy/src/Cloudflare/StateStore/State.ts).

For the current resources, scope account permissions to the selected Cloudflare account:

| Permission | Reason |
| --- | --- |
| Workers Scripts Write | App/state Worker deployment, service bindings, custom domains, edge preview used for state authentication |
| D1 Write | Stage database creation, migration, inspection, preview cleanup |
| Secrets Store Write | Native state bootstrap/upgrade; an already bootstrapped, fixed state version may permit Read, but that reduced policy needs an actual approved deploy test |

Sources: [Worker upload](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/), [custom domain attachment](https://developers.cloudflare.com/api/resources/workers/subresources/domains/methods/update/), [D1 creation](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/create/), [Secrets Store creation](https://developers.cloudflare.com/api/resources/secrets_store/subresources/stores/methods/create/).

Production additionally manages the `pcobooster.com` zone and CAA records. Limit DNS Write and zone read/edit permissions to that zone. The API currently labels zone creation's accepted scopes `Zone Zone Edit` or `Zone DNS Edit`; DNS record creation lists `DNS Write`, while the dashboard may display Edit. Native Worker custom domains use Workers Scripts Write; this stack does not need Workers Routes Write unless route resources are added. Do not copy the tutorial's unused R2, KV, Queues, Pages, Account Settings Write, or API Tokens Write permissions into the deployment token. Sources: [zone creation permissions](https://developers.cloudflare.com/api/resources/zones/methods/create/), [DNS permissions](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/create/), [Alchemy CI example](https://alchemy.run/cloudflare/tutorial/part-5/).

A separate Infisical identity limits secret retrieval but does not turn an account-wide Cloudflare Worker/D1 token into a per-PR token. Native state authentication also reaches the shared account state store. Treat same-account deploys as trusted-code execution: allow only same-repository PRs, keep fork code away from privileged jobs, and run cleanup from trusted workflow code. Do not combine `pull_request_target` credentials with checkout/execution of an untrusted PR head. A separate Cloudflare preview account is the stronger boundary if untrusted contributors must deploy previews. Sources: inspected Alchemy state and token-policy implementation; [GitHub privileged PR workflow guidance](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target).

## Domain registration and DNS

Live public registry inspection on September 23 returned:

| Field        | Value                                      |
| ------------ | ------------------------------------------ |
| Domain       | `PCOBOOSTER.COM`                           |
| Registration | `2026-09-18T19:52:51Z`                     |
| Expiration   | `2027-09-18T19:52:51Z`                     |
| Registrar    | Name.com, Inc.                             |
| Nameservers  | `NS1.VERCEL-DNS.COM`, `NS2.VERCEL-DNS.COM` |
| Status       | `client transfer prohibited`               |

Source: [Verisign authoritative RDAP](https://rdap.verisign.com/com/v1/domain/pcobooster.com). The observed registrar may be the underlying registrar for the Vercel domain purchase; the logged-in control surface should determine the actual management workflow.

Cloudflare requires the domain to be active on its authoritative DNS before registration transfer. It requires at least 60 days since initial registration or the previous transfer, no disqualifying recent registrant change, an unlocked domain, transfer authorization code, and payment method. Transfer generally adds a registration year. The earliest date implied by the registry is **November 17, 2026 at 19:52:51 UTC (11:52:51 AM PST)**; registrar eligibility must still be checked then. Source: [Cloudflare transfer requirements and steps](https://developers.cloudflare.com/registrar/get-started/transfer-domain-to-cloudflare/).

Proceed with DNS independently: inventory all records, add the zone, preserve existing mail/verification records and temporary Vercel targets, handle DNSSEC before the nameserver switch, and verify Cloudflare activation. Attach production Worker custom domains only after their deployed hostnames pass checks. Do not conflate DNS activation, Worker domain cutover, and registrar ownership. Source: [full DNS setup](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/), [Worker custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

Registration cannot be honestly marked complete during the current session. Record the lock and transfer runbook; once eligible, unlock, obtain authorization, initiate Cloudflare transfer, approve at the prior registrar if available, and verify the final registrar and renewal settings. A transfer still in progress is not completed ownership. Source: [transfer troubleshooting](https://developers.cloudflare.com/registrar/troubleshooting/).

### Vercel nameserver delegation while registration remains locked

The current registrar endpoint is `PATCH https://api.vercel.com/v1/registrar/domains/pcobooster.com/nameservers?teamId=<team-id>`, with bearer authentication and JSON `{"nameservers":["<assigned-cloudflare-ns1>","<assigned-cloudflare-ns2>"]}`. Use the exact nameservers assigned to this Cloudflare zone. Success is **204 with no response body**; do not call `response.json()` unconditionally. Sending `{"nameservers":[]}` restores Vercel's defaults. This is DNS delegation, independent of the blocked registrar transfer. Sources: [nameserver REST endpoint](https://vercel.com/docs/rest-api/domains-registrar/update-nameservers-for-a-domain), [official SDK implementation](https://github.com/vercel/sdk/blob/main/src/funcs/domainsRegistrarUpdateDomainNameservers.ts).

The dashboard equivalent is the team's Domains page → `pcobooster.com` → Nameservers → Edit. Vercel accepts up to four nameservers and offers Restore Original Nameservers. It documents up to 48 hours for nameserver propagation. Source: [Vercel nameserver management](https://vercel.com/docs/domains/managing-nameservers).

With a current CLI, write the reviewed non-secret JSON to a file and use the existing authenticated session:

```sh
bunx vercel@latest api /v1/registrar/domains/pcobooster.com/nameservers \
  -X PATCH --input /path/to/cloudflare-nameservers.json --scope <team-slug>
```

The installed Vercel CLI was `50.25.4` during research and did not expose the current `firewall` subcommand; use an explicitly current CLI for the commands in this section. `vercel api` supports `-X`, `--input`, and `--scope` and reuses its authenticated session. No token needs to appear in arguments. Source: [Vercel API CLI](https://vercel.com/docs/cli/api).

**Do this before the database freeze:** populate Cloudflare with all existing records, retaining Vercel application targets as DNS-only records, and compare answers from both authoritative providers. If DNSSEC is enabled, remove the old registrar DS configuration before changing delegation; enable Cloudflare DNSSEC after activation. Keep both zones intact while delegation propagates. Confirm registry delegation, Cloudflare zone activation, and representative recursive resolver answers before changing application targets. Lowering application-record TTL does not shorten cached parent nameserver delegation. Sources: [Cloudflare full setup](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/), [TTL distinction](https://developers.cloudflare.com/dns/manage-dns-records/reference/ttl/).

### Reversible write freeze and final data cutover

Use a brief maintenance window after DNS authority is stable. The migration's `REPEATABLE READ READ ONLY` transaction gives one consistent PostgreSQL snapshot; it does **not** block other clients from writing. The inspected importer closes that transaction before writing to D1. Consequently the source must remain frozen from before the snapshot until the old application is permanently retired from request handling. Source: [PostgreSQL repeatable-read semantics](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-REPEATABLE-READ), inspected `scripts/database/migrate-from-postgres.ts` and `scripts/database/data-transfer.ts`.

Vercel offers reversible production pausing:

| Operation | REST API | Result |
| --- | --- | --- |
| Pause | `POST /v1/projects/<project-id>/pause?teamId=<team-id>` | 200 `{}`; active production deployment blocked |
| Resume | `POST /v1/projects/<project-id>/unpause?teamId=<team-id>` | 200 `{}`; active production deployment unblocked |

Both requests have no body and use bearer authentication. The equivalent current CLI is `bunx vercel@latest api /v1/projects/<project-id>/pause -X POST --scope <team-slug>`; replace `pause` with `unpause` to resume. Paused production responds with 503 `DEPLOYMENT_PAUSED`; resume needs no redeploy and can take a few minutes. **The documented pause scope is only the active production deployment. It is insufficient evidence that old immutable URLs, previews, or other writers are blocked.** Sources: [pause API](https://vercel.com/docs/rest-api/projects/pause-a-project), [unpause API](https://vercel.com/docs/rest-api/projects/unpause-a-project), [project pause behavior](https://vercel.com/docs/projects/managing-projects#pausing-a-project).

Prefer a reversible first-priority WAF deny on **every Vercel project that can reach the source database**. With the CLI pointed at each correct linked project, inspect existing rules/drafts, then add a path-prefix `/` deny without host, environment, or method restrictions:

```sh
bunx vercel@latest firewall rules add "Cloudflare migration freeze" \
  --condition '{"type":"path","op":"pre","value":"/"}' \
  --action deny --yes
bunx vercel@latest firewall rules reorder "Cloudflare migration freeze" --first --yes
bunx vercel@latest firewall diff
bunx vercel@latest firewall publish --yes
```

Do not publish unrelated preexisting draft edits. Preserve the original configuration and the created rule ID. A first-position rule avoids earlier custom bypass rules; use the firewall status view and actual requests to verify effective ordering. Rollback is `firewall rules disable <rule-id> --yes`, followed by `firewall publish --yes`. These operations do not change database credentials. Sources: [firewall CLI](https://vercel.com/docs/cli/firewall), [rule conditions/actions](https://vercel.com/docs/vercel-firewall/vercel-waf/rule-configuration), [firewall evaluation](https://vercel.com/docs/vercel-firewall/firewall-concepts).

Operational sequence:

1. Finish disposable-stage build, auth, admin, and database verification. Keep application traffic away from production D1 until import/reconciliation completes; a login or session refresh can already modify it. Record old DNS targets, Vercel deployment IDs, firewall configuration, source database identity, and target D1 ID.
2. Freeze deployments and all writers: old API/product/admin ingress, any legacy project or preview using production Neon, cron/background jobs, and local tools using that source. Block **all methods**, because OAuth callbacks and session reads can write on GET. Probe the public custom domains, current immutable deployment URLs, an older production URL, and relevant preview URLs; verify the deny reaches the API rather than merely hiding the frontend. A Cloudflare-only maintenance page would not cover direct Vercel URLs.
3. Drain requests that started before the deny. Wait through the configured maximum execution lifetime of old functions/background work, and inspect source `pg_stat_activity` for remaining application transactions. Do not infer a write freeze from stable row counts alone. When inspecting activity, report connection/state/timing fields rather than SQL text or credentials. An idle connection is not itself a writer; an open application transaction must be explained before snapshotting. Source: [PostgreSQL activity monitoring](https://www.postgresql.org/docs/current/monitoring-stats.html#MONITORING-PG-STAT-ACTIVITY-VIEW).
4. Capture the final consistent source snapshot, import all application tables, and retain the secret-free per-table row counts and canonical SHA-256 receipts. Require exact normalized-row equality and a clean D1 foreign-key check. Before opening the new app, take a fresh source snapshot and reconcile again; if source receipts changed, find the remaining writer and repeat the freeze. The importer may resume identical partial imports, but refuses conflicting destination rows; do not delete conflicting production data to force a pass. These properties were verified by reading the current transfer implementation.
5. Attach/switch product and admin Worker domains and verify TLS, health, existing-account reads, then a real OAuth/session/admin flow. Keep the old Vercel deny in place while DNS caches expire and afterwards so no old URL resumes writing Neon. Preserve Neon and the old Vercel projects as retained recovery evidence until replacement verification is complete.
6. A rollback to Vercel is straightforward only **before D1 accepts new application writes**: restore traffic, disable the freeze rule, and unpause any paused projects. After D1 has accepted writes, first freeze Cloudflare and reconcile those writes back to PostgreSQL or explicitly resolve the data delta; blindly resuming the old application would fork account/history state. This is the operational boundary for data preservation, not a platform rollback guarantee.

The main implementation has additionally addressed the OAuth proxy's state-cookie bypass found in independent review. The earlier synthetic proxy harness is limited evidence; the final repository regression suite and live authenticated flow remain the verification authority for that correction.

## Completion evidence

Before cutting traffic, require: strict CI; SQLite/D1 migration and report tests; Effect cancellation/fault tests; OpenNext workerd smoke checks; deployed marketing and product route rendering; API health and oRPC responses; real Planning Center OAuth callback, persisted session and account selection; logout; admin authorization; demo read-only behavior; and an end-to-end PR lifecycle proving distinct API/D1 resources and cleanup.

After DNS cutover, repeat the authenticated flows on `pcobooster.com`, verify TLS and `admin.pcobooster.com`, and check caches do not store private responses. Only then remove active Vercel rewrites/deploy triggers and Neon runtime references. Preserve the old projects and secrets until their replacement and any desired export are verified; obsolete runtime code and local instructions should be removed from the final implementation. Registrar transfer remains separately pending its eligibility date.

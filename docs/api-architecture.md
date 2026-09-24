# API architecture

The product API is a contract-first oRPC service served by Hono inside an Alchemy Effect-native Cloudflare Worker (`apps/server/src/worker.ts`). Effect owns application execution below the transport boundary. Better Auth remains an ordinary HTTP handler because it defines its own protocol and routes.

## Package boundaries

- `packages/contracts` contains browser-safe oRPC contracts, transport DTO schemas, and safe error payload schemas. It must not import database, auth, Hono, framework, or Effect modules.
- `packages/planning-center-models` contains shared Planning Center data shapes plus pure calendar and scheduling rules. It is browser-safe and framework-independent.
- `packages/presentation-mode` contains the server-side presentation-mode guard, seed, and cache namespace shared by the API and the web build, which inlines the namespace.
- `packages/api` contains server-side application programs, typed faults, explicit feature modules, Better Auth and database integration, Planning Center adapters, and the oRPC implementation of the contracts.
- `apps/server` is the API Worker. It reads its settings with `Config` at startup, binds D1, builds the server dependencies once per isolate, mounts Better Auth and the oRPC handlers, supplies raw request context, and configures cross-origin and response-header behavior.
- `apps/web` consumes `packages/contracts` through the oRPC client and owns browser caches, hydration, navigation, and presentation helpers under `src/lib`. It must not import server-side modules from `packages/api`.

## Request flow

```text
apps/web
  -> oRPC contract client
  -> apps/server /api/rpc
  -> packages/api transport adapter
  -> Effect application program
  -> packages/api feature module
  -> Planning Center or database adapter
```

The Worker builds `ServerDependencies` (`packages/api/src/server.ts`: the typed `ServerConfig`, the Drizzle database, Better Auth, and the feature flag client) once per isolate. The Worker's construction phase acquires the D1 and Cloudflare Flagship bindings, as `Cloudflare.D1.QueryDatabase` and `Cloudflare.Flagship.ReadFlags`, and passes the raw bindings in. Programs evaluate flags per request with `featureFlags.isEnabled(name, subject)`, never from configuration; see [Feature flags](environment.md#feature-flags). The oRPC context carries them, and every execution provides them to the program as the `Server` service; `packages/api` never reads `process.env` or `cloudflare:workers`. One process-scoped `ApplicationRuntime` owns shared Effect layers. Every execution also provides a new `RequestContext`, including a request ID, cloned headers, method, URL, user-agent metadata, and abort signal. Credentials and other identity-sensitive values belong in request-scoped services; they must not be captured by a process-scoped layer or implicit async context. Planning Center clients bind one explicit credential to both their Authorization header and cache scope for their entire lifetime. A [demo session](demo.md) resolves to the demo credential through a read-only client that rejects writes before they leave the process, and always presents people with fictional details.

Application programs fail with tagged application faults rather than HTTP statuses. The oRPC adapter maps each expected fault to a declared contract error once. Planning Center HTTP, network, and malformed-response errors are classified at the provider boundary; unexpected adapter errors remain Effect defects. Defects and persistence failures are returned as opaque internal errors, with their original cause retained only for server-side logging.

The Fetch request abort signal is passed through Effect, feature modules, shared read caches, pagination, and Planning Center HTTP calls so disconnected clients stop reads and mutation preflight. Shared cache loads keep per-caller waiters: one disconnected caller does not cancel another, but the provider request is aborted and its result is not cached when no callers remain. At the provider-write boundary, the application checks the signal once more; after a write starts, execution waits for the provider result and required invalidation or audit work instead of reporting a cancellation while a hidden write continues.

The current Planning Center adapters return Promises and are lifted into Effect at the application boundary. This is an intentional migration seam: oRPC owns transport contracts, while Effect owns application execution and typed faults. Replacing Promise adapters with Effect-native services later does not require changing the contracts or Hono routes.

All oRPC and OpenAPI responses are marked `Cache-Control: private, no-store` at the Hono boundary. oRPC's response-header plugin preserves procedure-specific headers such as account-selection cookies.

## Migration invariants

Each migration layer owns a complete vertical slice: contract, application program, oRPC procedure, web caller, tests, and deletion of the replaced REST route. Do not leave a second business implementation behind as a compatibility path. Better Auth routes, liveness health checks, and the OpenAPI reference are the only intentional non-oRPC HTTP surfaces after cutover.

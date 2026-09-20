# API architecture

The product API is a contract-first oRPC service running on Hono and Bun. Effect owns application execution below the transport boundary. Better Auth remains an ordinary HTTP handler because it defines its own protocol and routes.

## Package boundaries

- `packages/contracts` contains browser-safe oRPC contracts, transport DTO schemas, and safe error payload schemas. It must not import database, auth, Hono, Next.js, or Effect modules.
- `packages/api` contains application programs, typed faults, domain behavior, infrastructure adapters, and the oRPC implementation of the contracts.
- `apps/server` mounts Better Auth and the oRPC handlers, supplies raw request context, and configures cross-origin and response-header behavior.
- `apps/web` consumes `packages/contracts` through the oRPC client. It must not import server-only modules from `packages/api`.

## Request flow

```text
apps/web
  -> oRPC contract client
  -> apps/server /api/rpc
  -> packages/api transport adapter
  -> Effect application program
  -> domain services and infrastructure adapters
```

One process-scoped `ApplicationRuntime` owns shared Effect layers. Every execution provides a new `RequestContext`, including a request ID, cloned headers, method, URL, user-agent metadata, and abort signal. Credentials and other identity-sensitive values belong in request-scoped services; they must not be captured by a process-scoped layer.

Application programs fail with tagged application faults rather than HTTP statuses. The oRPC adapter maps each expected fault to a declared contract error once. Defects and persistence failures are returned as opaque internal errors, with their original cause retained only for server-side logging.

The Fetch request abort signal is passed to Effect so disconnected clients interrupt application work. oRPC's response-header plugin owns response cookies and other procedure-specific response headers.

## Migration invariants

Each migration layer owns a complete vertical slice: contract, application program, oRPC procedure, web caller, tests, and deletion of the replaced REST route. Do not leave a second business implementation behind as a compatibility path. Better Auth routes, liveness health checks, and the OpenAPI reference are the only intentional non-oRPC HTTP surfaces after cutover.

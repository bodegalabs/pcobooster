/**
 * The product RPC server: handlers, both middlewares, and the decorated protocol, built once per
 * isolate. A handler is the application program; access, accounting, interruption by kind,
 * logging, and fault encoding come from the contract and its middleware.
 */
import "@pcobooster/api/rpc/services";
import type { PlanningCenterAccessDependencies } from "@pcobooster/api/application/planning-center-access";
import { CatalogHandlers } from "@pcobooster/api/rpc/handlers/catalog";
import { DemoHandlers } from "@pcobooster/api/rpc/handlers/demo";
import { FeedbackHandlers } from "@pcobooster/api/rpc/handlers/feedback";
import { HealthHandlers } from "@pcobooster/api/rpc/handlers/health";
import { IdentityHandlers } from "@pcobooster/api/rpc/handlers/identity";
import { PeopleHandlers } from "@pcobooster/api/rpc/handlers/people";
import { RunSheetHandlers } from "@pcobooster/api/rpc/handlers/run-sheet";
import { scheduleHandlers } from "@pcobooster/api/rpc/handlers/schedule";
import { SongHandlers } from "@pcobooster/api/rpc/handlers/songs";
import { PlanningCenterSessionLive } from "@pcobooster/api/rpc/planning-center-session";
import { ProcedureScopeLive } from "@pcobooster/api/rpc/procedure-scope";
import type { ProcedureScopeOptions } from "@pcobooster/api/rpc/procedure-scope";
import { classifyingProtocol } from "@pcobooster/api/rpc/protocol";
import type { OutcomeLineOptions } from "@pcobooster/api/rpc/protocol";
import type { ScheduleAuditDependencies } from "@pcobooster/api/rpc/schedule-audit";
import { ProductRpc } from "@pcobooster/contracts/rpc/product";
import { Effect, Layer, Tracer } from "effect";
import type { Scope } from "effect";
import type * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import type * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";

export type ProductRpcServerOptions = ProcedureScopeOptions &
  Omit<OutcomeLineOptions, "now"> & {
    /** How procedures resolve Planning Center access; the Worker passes none. */
    readonly access?: PlanningCenterAccessDependencies;
    /** Where schedule writes are audited; the Worker passes none (D1). */
    readonly scheduleAudit?: ScheduleAuditDependencies;
  };

/** Every namespace's handlers; one missing leaves `RpcServer.make` below unsatisfied. */
export const productHandlers = (options: ProductRpcServerOptions) =>
  Layer.mergeAll(
    HealthHandlers,
    IdentityHandlers,
    DemoHandlers,
    FeedbackHandlers,
    CatalogHandlers,
    PeopleHandlers,
    SongHandlers,
    RunSheetHandlers,
    scheduleHandlers(options.scheduleAudit)
  );

export const ProductRpcServerLive = (options: ProductRpcServerOptions) =>
  Layer.mergeAll(
    productHandlers(options),
    ProcedureScopeLive(options),
    PlanningCenterSessionLive(options.access)
  );

/** What each `/api/rpc` request runs: Effect's HTTP protocol over the shared server. */
export type ProductRpcHttpEffect = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  never,
  HttpServerRequest.HttpServerRequest | Scope.Scope
>;

/**
 * Starts the product RPC server in the current scope and returns the per-request HTTP effect:
 * the stock HTTP protocol, decorated (`classifyingProtocol`), behind a screen that answers
 * malformed bodies before RpcServer reads them. One handler's defect never fails other calls
 * (`disableFatalDefects`), and buffered JSON keeps one response per HTTP request.
 */
export const makeProductRpcServer = (
  options: ProductRpcServerOptions
): Effect.Effect<ProductRpcHttpEffect, never, Scope.Scope> =>
  Effect.gen(function* buildProductRpcServer() {
    const now = options.now ?? Date.now;
    const { protocol, httpEffect } =
      yield* RpcServer.makeProtocolWithHttpEffect();
    const classifying = classifyingProtocol(protocol, {
      isKnownTag: (tag) => ProductRpc.requests.has(tag),
      report: options.report,
      now,
      serialization: yield* RpcSerialization.RpcSerialization,
    });
    yield* RpcServer.make(ProductRpc, {
      disableFatalDefects: true,
      spanPrefix: "rpc",
    }).pipe(
      Effect.provideService(RpcServer.Protocol, classifying.protocol),
      Effect.provide(ProductRpcServerLive(options)),
      // The server outlives the request that builds it. A Worker's tracer is bound to one
      // invocation's async context (Alchemy's Cloudflare tracer runs every step inside it), so
      // the server's own fibers would keep running in that finished request and hang later
      // ones. Each procedure still traces with its own request's tracer: a handler runs in the
      // context of the request fiber that wrote it.
      Effect.withTracer(Tracer.nativeTracer),
      // Started now, so its receive loop is installed before the first request writes to it
      // and every request is handled on its own fiber, in its own workerd I/O context.
      Effect.forkScoped({ startImmediately: true })
    );
    return classifying.screenBody(httpEffect);
  }).pipe(Effect.provide(RpcSerialization.layerJson));

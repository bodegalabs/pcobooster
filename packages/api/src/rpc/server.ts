/**
 * The product RPC server: handlers, both middlewares, and the decorated protocol, built once per
 * isolate. A handler is the application program; access, accounting, interruption by kind,
 * logging, and fault encoding come from the contract and its middleware.
 */
import "@pcobooster/api/rpc/services";
import { getCatalogPlan } from "@pcobooster/api/application/catalog";
import {
  commitScheduledPerson,
  prepareScheduledPerson,
} from "@pcobooster/api/application/schedule";
import { PlanningCenterSessionLive } from "@pcobooster/api/rpc/planning-center-session";
import { ProcedureScopeLive } from "@pcobooster/api/rpc/procedure-scope";
import type { ProcedureScopeOptions } from "@pcobooster/api/rpc/procedure-scope";
import { classifyingProtocol } from "@pcobooster/api/rpc/protocol";
import type { OutcomeLineOptions } from "@pcobooster/api/rpc/protocol";
import { auditScheduleAssign } from "@pcobooster/api/rpc/schedule-audit";
import { preparedWrite } from "@pcobooster/api/rpc/write";
import { Server } from "@pcobooster/api/server";
import { ProductRpc } from "@pcobooster/contracts/rpc/product";
import { Effect, Layer } from "effect";
import type { Scope } from "effect";
import type * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import type * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";

export const ProductHandlersLive = ProductRpc.toLayer({
  health: () =>
    Server.pipe(
      Effect.map(({ config }) => ({
        status: "ok" as const,
        version: config.releaseVersion,
      }))
    ),
  "catalog.plan": (input) => getCatalogPlan(input),
  "schedule.assign": (input) =>
    auditScheduleAssign(
      input,
      preparedWrite(prepareScheduledPerson(input), (prepared) =>
        commitScheduledPerson(input, prepared)
      )
    ),
});

export type ProductRpcServerOptions = ProcedureScopeOptions &
  Omit<OutcomeLineOptions, "now">;

export const ProductRpcServerLive = (options: ProductRpcServerOptions) =>
  Layer.mergeAll(
    ProductHandlersLive,
    ProcedureScopeLive(options),
    PlanningCenterSessionLive()
  );

/** What each `/api/rpc` request runs: Effect's HTTP protocol over the shared server. */
export type ProductRpcHttpEffect = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  never,
  HttpServerRequest.HttpServerRequest | Scope.Scope
>;

/**
 * Starts the product RPC server in the current scope and returns the per-request HTTP effect.
 * `RpcServer.toHttpEffect` with its protocol decorated (`classifyingProtocol`). One handler's
 * defect never fails other calls (`disableFatalDefects`), and buffered JSON keeps one response
 * per HTTP request.
 */
export const makeProductRpcServer = (
  options: ProductRpcServerOptions
): Effect.Effect<ProductRpcHttpEffect, never, Scope.Scope> =>
  Effect.gen(function* buildProductRpcServer() {
    const now = options.now ?? Date.now;
    const { protocol, httpEffect } =
      yield* RpcServer.makeProtocolWithHttpEffect();
    yield* RpcServer.make(ProductRpc, {
      disableFatalDefects: true,
      spanPrefix: "rpc",
    }).pipe(
      Effect.provideService(
        RpcServer.Protocol,
        classifyingProtocol(protocol, {
          isKnownTag: (tag) => ProductRpc.requests.has(tag),
          report: options.report,
          now,
        })
      ),
      Effect.provide(ProductRpcServerLive(options)),
      // Started now, so its receive loop is installed before the first request writes to it
      // and every request is handled on its own fiber, in its own workerd I/O context.
      Effect.forkScoped({ startImmediately: true })
    );
    return httpEffect;
  }).pipe(Effect.provide(RpcSerialization.layerJson));

import {
  createRequestContext,
  RequestContext,
} from "@pcobooster/api/application/context";
import { PlanningCenterAccounting } from "@pcobooster/api/planning-center/accounting";
import { PlanningCenterPacing } from "@pcobooster/api/planning-center/pacing";
import type { PlanningCenterRatePacer } from "@pcobooster/api/planning-center/rate-pacer";
import { PlanningCenterRequestAccounting } from "@pcobooster/api/planning-center/request-accounting";
import { PLANNING_CENTER_REQUEST_CAP } from "@pcobooster/api/planning-center/request-budget";
import { procedureOutcome } from "@pcobooster/api/rpc/outcome";
import type { ProcedureCall } from "@pcobooster/api/rpc/outcome";
import { RpcExchange } from "@pcobooster/api/rpc/services";
import { Server, serverDependenciesForRequest } from "@pcobooster/api/server";
import type { ServerDependencies } from "@pcobooster/api/server";
import { InternalError } from "@pcobooster/contracts/faults/internal-error";
import { parseRequestPriority } from "@pcobooster/contracts/request-priority";
import {
  procedureKindOf,
  RPC_HEADERS,
} from "@pcobooster/contracts/rpc/procedure";
import { ProcedureScope } from "@pcobooster/contracts/rpc/procedure-scope";
import { Context, Effect, Exit, Layer, Option } from "effect";
import * as Headers from "effect/unstable/http/Headers";
import * as HttpClient from "effect/unstable/http/HttpClient";

export interface ProcedureScopeOptions {
  /** Built once per isolate; each procedure runs with `serverDependenciesForRequest`. */
  readonly server: ServerDependencies;
  /** The isolate's pacer: every procedure shares each credential's Planning Center budget. */
  readonly pacer: PlanningCenterRatePacer;
  /** Defaults to `PLANNING_CENTER_REQUEST_CAP`. */
  readonly requestBudget?: number;
  readonly now?: () => number;
}

/**
 * Reads a service the route put on the request fiber. RpcServer merges that fiber's context into
 * every handler fiber but cannot type it, so this is the one untyped read. Missing means the
 * procedure runs outside the `/api/rpc` route, which only a wiring bug causes: it dies, and the
 * die is answered as InternalError.
 */
const fromRequestFiber = <Identifier, Service>(
  key: Context.Key<Identifier, Service>
): Effect.Effect<Service> =>
  Effect.withFiber((fiber) =>
    Option.match(Context.getOption(fiber.context, key), {
      onNone: () =>
        Effect.die(
          new Error(`${key.key} is missing: the procedure ran outside /api/rpc`)
        ),
      onSome: Effect.succeed,
    })
  );

/**
 * The outermost middleware of every procedure. In order:
 * 1. marks the request id dispatched in the exchange (graft 2: a later defect for it is an
 *    encode failure, not a rejected request);
 * 2. builds the request context from the workerd request only, fresh Planning Center
 *    accounting with the call's priority, and the per-request server view;
 * 3. runs writes uninterruptibly (their kind comes from the contract), so a disconnect cannot
 *    cut a provider write or its audit short; `preparedWrite` reopens the prepare step;
 * 4. on exit, records the outcome for its one log line;
 * 5. answers anything that is not a ProductFault or an interrupt with InternalError, so no
 *    defect from a handler reaches the wire.
 */
export const ProcedureScopeLive = (
  options: ProcedureScopeOptions
): Layer.Layer<ProcedureScope> =>
  Layer.succeed(ProcedureScope)((effect, { rpc, headers, requestId }) =>
    Effect.gen(function* procedureScope() {
      const exchange = yield* fromRequestFiber(RpcExchange);
      const httpClient = yield* fromRequestFiber(HttpClient.HttpClient);
      const now = options.now ?? Date.now;
      const kind = procedureKindOf(rpc) ?? "read";
      const priority = parseRequestPriority(
        Option.getOrUndefined(Headers.get(headers, RPC_HEADERS.priority))
      );
      const accounting = new PlanningCenterRequestAccounting({
        requestBudget: options.requestBudget ?? PLANNING_CENTER_REQUEST_CAP,
        priority,
      });
      const rpcRequestId = String(requestId);
      const call: ProcedureCall = {
        procedure: rpc._tag,
        requestId: exchange.requestId,
        client: exchange.client,
        priority,
        kind,
        startedAt: now(),
        accounting,
      };
      exchange.dispatch(rpcRequestId);
      const program = effect.pipe(
        Effect.provideService(RequestContext, {
          ...createRequestContext(exchange.request),
          requestId: exchange.requestId,
        }),
        Effect.provideService(
          Server,
          serverDependenciesForRequest(options.server)
        ),
        Effect.provideService(PlanningCenterAccounting, accounting),
        Effect.provideService(HttpClient.HttpClient, httpClient),
        Effect.provideService(PlanningCenterPacing, options.pacer),
        Effect.annotateLogs({
          procedure: rpc._tag,
          requestId: exchange.requestId,
        }),
        Effect.onExit((exit) =>
          Effect.sync(() => {
            exchange.finish(rpcRequestId, {
              call,
              outcome: procedureOutcome(exit),
            });
          })
        ),
        Effect.catchCause((cause) =>
          procedureOutcome(Exit.failCause(cause)).kind === "unexpected"
            ? Effect.fail(new InternalError({}))
            : Effect.failCause(cause)
        )
      );
      return yield* kind === "write"
        ? Effect.uninterruptible(program)
        : program;
    })
  );

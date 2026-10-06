/**
 * Per-HTTP-request state of the RPC route, and the services its middleware provides.
 *
 * The `/api/rpc` route creates one `RpcExchange` per HTTP request and provides it on the request
 * fiber; RpcServer merges that fiber's context into every handler fiber, so ProcedureScope and the
 * protocol read the same instance. Nothing here outlives the HTTP request.
 */
import type { RequestContext } from "@pcobooster/api/application/context";
import type { PlanningCenterRequest } from "@pcobooster/api/application/planning-center-access";
import type { PlanningCenterAccounting } from "@pcobooster/api/planning-center/accounting";
import type {
  ProcedureCall,
  ProcedureOutcome,
} from "@pcobooster/api/rpc/outcome";
import type { ResponseCookies } from "@pcobooster/api/rpc/response-cookies";
import type { Server } from "@pcobooster/api/server";
import type { RequestPriority } from "@pcobooster/contracts/request-priority";
import { Context, Latch } from "effect";
import type * as Cookies from "effect/unstable/http/Cookies";
import type { HttpClient } from "effect/unstable/http/HttpClient";

declare module "@pcobooster/contracts/rpc/server-services" {
  interface RpcServerServices {
    readonly procedure:
      | RequestContext
      | Server
      | PlanningCenterAccounting
      | HttpClient
      | ResponseCookies;
    readonly planningCenter: PlanningCenterRequest;
  }
}

/** A procedure that has exited and whose outcome line is not written yet. */
export interface FinishedProcedure {
  readonly call: ProcedureCall;
  readonly outcome: ProcedureOutcome;
}

/**
 * One HTTP request's procedures. Each part has one writer:
 * - `request`, `requestId`, `client`: the route, from the workerd request. The request is the
 *   only source of credentials; RPC message headers ride in the body, so a cross-site body
 *   could otherwise override the browser's cookie.
 * - `calls`: the protocol, the tag and priority of each request id it received, so a request
 *   that never reached a handler is still logged by name.
 * - dispatched and finished procedures: ProcedureScope (`dispatch`, `finish`).
 * - `outcomes`: whoever writes a line (`recordLogged`); the route mirrors a lone outcome's
 *   status onto the HTTP response.
 * - `cookies`: procedures, through `ResponseCookies`; the route writes each as its own
 *   `Set-Cookie` line.
 */
export interface RpcExchangeState {
  readonly request: Request;
  readonly requestId: string;
  readonly client: string | null;
  readonly calls: Map<
    string,
    { readonly tag: string; readonly priority: RequestPriority }
  >;
  readonly outcomes: readonly ProcedureOutcome[];
  readonly cookies: readonly Cookies.Cookie[];
  readonly setCookie: (cookie: Cookies.Cookie) => void;
  /**
   * Open while no dispatched procedure is running. After the caller disconnects the route waits
   * on it, so a write and its audit finish inside the invocation.
   */
  readonly settled: Latch.Latch;
  /** ProcedureScope reached this request id: it was decoded and its handler started. */
  readonly dispatch: (rpcRequestId: string) => void;
  /**
   * Whether this request id reached a handler. A defect the protocol sends for an id that did
   * is an encode failure (500); for one that did not, a rejected request (400).
   */
  readonly wasDispatched: (rpcRequestId: string) => boolean;
  /** ProcedureScope: the handler exited; its line is written when its response is sent. */
  readonly finish: (rpcRequestId: string, procedure: FinishedProcedure) => void;
  /** The finished procedure whose line is still unwritten, once; later calls get undefined. */
  readonly takeFinished: (
    rpcRequestId: string
  ) => FinishedProcedure | undefined;
  /** Every finished procedure whose response was never sent (the caller left first). */
  readonly takeAllFinished: () => FinishedProcedure[];
  readonly recordLogged: (outcome: ProcedureOutcome) => void;
}

export const makeRpcExchange = (
  request: Request,
  requestId: string,
  client: string | null
): RpcExchangeState => {
  const outcomes: ProcedureOutcome[] = [];
  const cookies: Cookies.Cookie[] = [];
  const settled = Latch.makeUnsafe(true);
  const dispatched = new Set<string>();
  const finished = new Map<string, FinishedProcedure>();
  let running = 0;
  return {
    request,
    requestId,
    client,
    calls: new Map(),
    outcomes,
    cookies,
    setCookie: (cookie) => {
      cookies.push(cookie);
    },
    settled,
    dispatch: (rpcRequestId) => {
      dispatched.add(rpcRequestId);
      running += 1;
      settled.closeUnsafe();
    },
    wasDispatched: (rpcRequestId) => dispatched.has(rpcRequestId),
    finish: (rpcRequestId, procedure) => {
      finished.set(rpcRequestId, procedure);
      running -= 1;
      if (running === 0) {
        settled.openUnsafe();
      }
    },
    takeFinished: (rpcRequestId) => {
      const procedure = finished.get(rpcRequestId);
      finished.delete(rpcRequestId);
      return procedure;
    },
    takeAllFinished: () => {
      const procedures = [...finished.values()];
      finished.clear();
      return procedures;
    },
    recordLogged: (outcome) => {
      outcomes.push(outcome);
    },
  };
};

export class RpcExchange extends Context.Service<
  RpcExchange,
  RpcExchangeState
>()("@pcobooster/api/RpcExchange") {}

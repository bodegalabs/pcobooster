import { productFaultSchema } from "@pcobooster/contracts/faults";
import type { ProvidedBy } from "@pcobooster/contracts/rpc/server-services";
import { RpcMiddleware } from "effect/unstable/rpc";

/**
 * Outermost middleware on every procedure: request identity, Planning Center accounting and
 * priority, the outcome log line, and fault encoding. One middleware, because those steps share
 * one ordering that `.middleware()` call order would otherwise decide. Implemented by
 * `packages/api/src/rpc/procedure-scope.ts`; not required for clients.
 */
export class ProcedureScope extends RpcMiddleware.Service<
  ProcedureScope,
  { provides: ProvidedBy<"procedure"> }
>()("@pcobooster/ProcedureScope", { error: productFaultSchema }) {}

/**
 * Outermost on every product endpoint: request identity, the client version gate, Planning
 * Center accounting and priority, the outcome line, and fault encoding (decode failures answer
 * `RequestRejected`, defects `InternalError`). The server implements it
 * (`packages/api/src/http/procedure-scope.ts`); clients only need its error schemas, which
 * HttpApi merges into every endpoint it is declared on.
 */
import { productFaultSchema } from "@pcobooster/contracts/faults";
import type { ProvidedBy } from "@pcobooster/contracts/rpc/server-services";
import { HttpApiMiddleware } from "effect/unstable/httpapi";

/** Each fault on its own, so every one is encoded and decoded with its own status. */
export const productFaults = productFaultSchema.members;

export class ProcedureScope extends HttpApiMiddleware.Service<
  ProcedureScope,
  { provides: ProvidedBy<"procedure"> }
>()("@pcobooster/http/ProcedureScope", { error: productFaults }) {}

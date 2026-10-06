import { productFaultSchema } from "@pcobooster/contracts/faults";
import type { ProvidedBy } from "@pcobooster/contracts/rpc/server-services";
import { RpcMiddleware } from "effect/unstable/rpc";

/**
 * Declared on each namespace group whose procedures read or write Planning Center: resolves the
 * caller's access once per procedure, provides every capability bound to that credential, and
 * settles the shared read caches when the procedure ends. Implemented by
 * `packages/api/src/rpc/planning-center-session.ts`; not required for clients.
 */
export class PlanningCenterSession extends RpcMiddleware.Service<
  PlanningCenterSession,
  {
    provides: ProvidedBy<"planningCenter">;
    requires: ProvidedBy<"procedure">;
  }
>()("@pcobooster/PlanningCenterSession", { error: productFaultSchema }) {}

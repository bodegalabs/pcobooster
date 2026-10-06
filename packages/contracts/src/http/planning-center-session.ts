/**
 * On each group whose endpoints act on Planning Center as the caller: resolves the caller's
 * access once, answers `NotFound` while the endpoint's flag is off, provides every capability
 * bound to that credential, and settles the shared read caches when the call ends. The server
 * implements it (`packages/api/src/http/planning-center-session.ts`).
 */
import { productFaults } from "@pcobooster/contracts/http/procedure-scope";
import type { ProvidedBy } from "@pcobooster/contracts/rpc/server-services";
import { HttpApiMiddleware } from "effect/unstable/httpapi";

export class PlanningCenterSession extends HttpApiMiddleware.Service<
  PlanningCenterSession,
  {
    provides: ProvidedBy<"planningCenter">;
    requires: ProvidedBy<"procedure">;
  }
>()("@pcobooster/http/PlanningCenterSession", { error: productFaults }) {}

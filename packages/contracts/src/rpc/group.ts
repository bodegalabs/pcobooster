/**
 * The only two ways to declare a namespace of procedures. Both put `ProcedureScope` outermost,
 * so every procedure gets request identity, accounting, its outcome line, and fault encoding;
 * the server's handler layer for a namespace typechecks only because of it.
 */
import { PlanningCenterSession } from "@pcobooster/contracts/rpc/planning-center-session";
import { ProcedureScope } from "@pcobooster/contracts/rpc/procedure-scope";
import { RpcGroup } from "effect/unstable/rpc";
import type { Rpc } from "effect/unstable/rpc";

/** Procedures that act on Planning Center as the caller, inside one resolved access. */
export const planningCenterGroup = <const Rpcs extends readonly Rpc.Any[]>(
  ...rpcs: Rpcs
) =>
  RpcGroup.make(...rpcs)
    .middleware(PlanningCenterSession)
    .middleware(ProcedureScope);

/** Procedures that do not touch Planning Center as the caller (identity, demo, feedback). */
export const plainGroup = <const Rpcs extends readonly Rpc.Any[]>(
  ...rpcs: Rpcs
) => RpcGroup.make(...rpcs).middleware(ProcedureScope);

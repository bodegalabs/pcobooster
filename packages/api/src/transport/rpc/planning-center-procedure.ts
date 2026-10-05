import type { RequestContext } from "@pcobooster/api/application/context";
import type { ApplicationFault } from "@pcobooster/api/application/errors";
import { withPlanningCenterAccess } from "@pcobooster/api/application/planning-center-access";
import type { PlanningCenterRequest } from "@pcobooster/api/application/planning-center-access";
import type { Server } from "@pcobooster/api/server";
import type { RpcContext } from "@pcobooster/api/transport/rpc/context";
import { executeApplicationEffect } from "@pcobooster/api/transport/rpc/execute";
import type { Effect } from "effect";
import type { HttpClient } from "effect/http/HttpClient";

/** What a read handler passes on from its Effect RPC call. */
export interface PlanningCenterCall {
  readonly context: RpcContext;
  readonly signal?: AbortSignal;
}

/**
 * Runs a Planning Center read for one Effect RPC call: resolves the request's access, runs the
 * program with it, and settles the shared read caches before responding. Reads stop when the
 * caller disconnects; writes keep their own handlers and execution options.
 */
export const readWithPlanningCenter = async <Value>(
  program: Effect.Effect<
    Value,
    ApplicationFault,
    PlanningCenterRequest | RequestContext | Server | HttpClient
  >,
  { context, signal }: PlanningCenterCall
): Promise<Value> =>
  await executeApplicationEffect(
    withPlanningCenterAccess(program),
    context,
    signal
  );

import type { RequestContext } from "@pcobooster/api/application/context";
import type { ApplicationFault } from "@pcobooster/api/application/errors";
import { withPlanningCenterAccess } from "@pcobooster/api/application/planning-center-access";
import type { PlanningCenterAccess } from "@pcobooster/api/application/planning-center-access";
import type { Server } from "@pcobooster/api/server";
import type { RpcContext } from "@pcobooster/api/transport/orpc/context";
import { executeApplicationEffect } from "@pcobooster/api/transport/orpc/execute";
import { applicationRuntime } from "@pcobooster/api/transport/orpc/implementation";
import type { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http/HttpClient";

/** What a read handler passes on from its oRPC call. */
export interface PlanningCenterCall {
  readonly context: RpcContext;
  readonly signal?: AbortSignal;
}

/**
 * Runs a Planning Center read for one oRPC call: resolves the request's access, runs the
 * program with it, and settles the shared read caches before responding. Reads stop when the
 * caller disconnects; writes keep their own handlers and execution options.
 */
export const readWithPlanningCenter = async <Value>(
  program: Effect.Effect<
    Value,
    ApplicationFault,
    PlanningCenterAccess | RequestContext | Server | HttpClient
  >,
  { context, signal }: PlanningCenterCall
): Promise<Value> =>
  await executeApplicationEffect(
    applicationRuntime,
    withPlanningCenterAccess(program),
    context,
    signal
  );

import type { RequestContext } from "@pcobooster/api/application/context";
import type { ApplicationFault } from "@pcobooster/api/application/errors";
import {
  provideAccess,
  resolvePlanningCenterAccess,
} from "@pcobooster/api/application/planning-center-access";
import type {
  PlanningCenterAccessDependencies,
  PlanningCenterRequest,
} from "@pcobooster/api/application/planning-center-access";
import type { Server } from "@pcobooster/api/server";
import type { RpcContext } from "@pcobooster/api/transport/rpc/context";
import { executeApplicationEffect } from "@pcobooster/api/transport/rpc/execute";
import { Effect } from "effect";

/** Keep one request credential across interruptible preparation and a committed write. */
export const executePreparedPlanningCenterWrite = async <Preparation, Value>(
  context: RpcContext,
  signal: AbortSignal | undefined,
  prepare: Effect.Effect<
    Preparation,
    ApplicationFault,
    PlanningCenterRequest | RequestContext | Server
  >,
  commit: (
    prepared: Preparation
  ) => Effect.Effect<
    Value,
    ApplicationFault,
    PlanningCenterRequest | RequestContext
  >,
  dependencies?: PlanningCenterAccessDependencies
): Promise<Value> => {
  const access = await executeApplicationEffect(
    resolvePlanningCenterAccess(dependencies),
    context,
    signal
  );
  try {
    const prepared = await executeApplicationEffect(
      provideAccess(prepare, access),
      context,
      signal
    );
    return await executeApplicationEffect(
      provideAccess(commit(prepared), access),
      context,
      signal,
      { interruptOnAbort: false }
    );
  } finally {
    // Shared read-cache writes must finish inside the request that started them.
    await Effect.runPromise(access.services.settleReadCaches);
  }
};

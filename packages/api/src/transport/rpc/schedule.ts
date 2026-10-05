import {
  provideAccess,
  resolvePlanningCenterAccess,
} from "@pcobooster/api/application/planning-center-access";
import type { PlanningCenterAccessDependencies } from "@pcobooster/api/application/planning-center-access";
import {
  commitScheduledPerson,
  prepareScheduledPerson,
  removeScheduledPerson,
  updateScheduledPersonStatus,
} from "@pcobooster/api/application/schedule";
import { recordActivityEvent } from "@pcobooster/api/db/activity-events";
import type { ActivityEventInput } from "@pcobooster/api/db/activity-events";
import { boundaryLog } from "@pcobooster/api/logging";
import type { RpcContext } from "@pcobooster/api/transport/rpc/context";
import { executeApplicationEffect } from "@pcobooster/api/transport/rpc/execute";
import { defineHandler } from "@pcobooster/api/transport/rpc/implementation";
import { applyPrivateNoStore } from "@pcobooster/api/transport/rpc/response-headers";
import { scheduleActivityEvent } from "@pcobooster/api/transport/rpc/schedule-activity";
import type { ScheduleOperation } from "@pcobooster/api/transport/rpc/schedule-activity";
import { RpcError } from "@pcobooster/contracts/errors";
import type {
  ScheduleAssignInput,
  ScheduleRemoveInput,
  ScheduleUpdateStatusInput,
} from "@pcobooster/contracts/schedule";
import { scheduleAssignInputSchema } from "@pcobooster/contracts/schedule";
import { Effect, Result, Schema } from "effect";

type PlanningCenterAccess = Effect.Success<
  ReturnType<typeof resolvePlanningCenterAccess>
>;

const scheduleLog = boundaryLog("schedule");

export interface ScheduleRouterDependencies {
  readonly access?: PlanningCenterAccessDependencies;
  readonly recordActivity?: (event: ActivityEventInput) => Promise<void>;
}

export const createScheduleRouter = (
  dependencies: ScheduleRouterDependencies = {}
) => {
  const audited = async <Value>(
    operation: ScheduleOperation,
    input:
      | ScheduleAssignInput
      | ScheduleRemoveInput
      | ScheduleUpdateStatusInput,
    context: RpcContext,
    signal: AbortSignal,
    run: (access: PlanningCenterAccess) => Promise<Value>
  ): Promise<Value> => {
    applyPrivateNoStore(context.resHeaders);
    const access = await executeApplicationEffect(
      resolvePlanningCenterAccess(dependencies.access),
      context,
      signal
    );
    const { authentication } = access;
    const record = async (
      result:
        | { success: true; output: unknown }
        | { success: false; error: unknown }
    ) => {
      // Demo visitors are anonymous and cannot write, so there is nothing to audit.
      if (authentication.kind === "demo") {
        return;
      }
      const recordActivity =
        dependencies.recordActivity ??
        (async (event: ActivityEventInput) => {
          await recordActivityEvent(context.server, event);
        });
      try {
        await recordActivity(
          scheduleActivityEvent({
            operation,
            input,
            authentication,
            context,
            result,
          })
        );
      } catch (error) {
        scheduleLog.warn(
          "Failed to record scheduling activity event",
          {
            requestId: context.requestId,
            method: context.request.method,
            path: new URL(context.request.url).pathname,
          },
          error instanceof Error ? error : new Error(String(error))
        );
      }
    };
    try {
      if (
        operation === "assign" &&
        Result.isFailure(
          Schema.decodeUnknownResult(scheduleAssignInputSchema)(input)
        )
      ) {
        throw new RpcError({
          code: "BAD_REQUEST",
          status: 400,
          message: "Invalid scheduling input",
          data: { message: "Invalid scheduling input" },
        });
      }
      const result = await run(access);
      await record({ success: true, output: result });
      return result;
    } catch (error) {
      await record({ success: false, error });
      throw error;
    } finally {
      // Shared read-cache writes must finish inside the request that started them.
      await Effect.runPromise(access.services.settleReadCaches);
    }
  };

  const assign = defineHandler(
    "schedule.assign",
    async ({ input, context, signal }) =>
      await audited("assign", input, context, signal, async (access) => {
        const preparation = await executeApplicationEffect(
          provideAccess(prepareScheduledPerson(input), access),
          context,
          signal
        );
        return await executeApplicationEffect(
          provideAccess(commitScheduledPerson(input, preparation), access),
          context,
          signal,
          { interruptOnAbort: false }
        );
      })
  );
  const remove = defineHandler(
    "schedule.remove",
    async ({ input, context, signal }) =>
      await audited(
        "remove",
        input,
        context,
        signal,
        async (access) =>
          await executeApplicationEffect(
            provideAccess(removeScheduledPerson(input), access),
            context,
            signal,
            { interruptOnAbort: false }
          )
      )
  );
  const updateStatus = defineHandler(
    "schedule.updateStatus",
    async ({ input, context, signal }) =>
      await audited(
        "updateStatus",
        input,
        context,
        signal,
        async (access) =>
          await executeApplicationEffect(
            provideAccess(updateScheduledPersonStatus(input), access),
            context,
            signal,
            { interruptOnAbort: false }
          )
      )
  );
  return { assign, remove, updateStatus };
};

export const scheduleRouter = createScheduleRouter();

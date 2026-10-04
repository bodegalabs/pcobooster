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
import { executeApplicationEffect } from "@pcobooster/api/transport/orpc/execute";
import { rpc } from "@pcobooster/api/transport/orpc/implementation";
import { applyPrivateNoStore } from "@pcobooster/api/transport/orpc/response-headers";
import { scheduleActivityEvent } from "@pcobooster/api/transport/orpc/schedule-activity";
import type { ScheduleOperation } from "@pcobooster/api/transport/orpc/schedule-activity";
import { Effect } from "effect";

const scheduleLog = boundaryLog("schedule");

export interface ScheduleRouterDependencies {
  readonly access?: PlanningCenterAccessDependencies;
  readonly recordActivity?: (event: ActivityEventInput) => Promise<void>;
}

export const createScheduleRouter = (
  dependencies: ScheduleRouterDependencies = {}
) => {
  const audited = (operation: ScheduleOperation) =>
    rpc.schedule.use(async ({ context, next, signal }, input) => {
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
        // oxlint-disable-next-line node/callback-return -- oRPC next returns a result that must be audited before returning it.
        const result = await next({
          context: { planningCenterAccess: access },
        });
        await record({ success: true, output: result.output });
        return result;
      } catch (error) {
        await record({ success: false, error });
        throw error;
      } finally {
        // Shared read-cache writes must finish inside the request that started them.
        await Effect.runPromise(access.services.settleReadCaches);
      }
    });

  const assign = audited("assign").assign.handler(
    async ({ input, context, signal }) => {
      const preparation = await executeApplicationEffect(
        provideAccess(
          prepareScheduledPerson(input),
          context.planningCenterAccess
        ),
        context,
        signal
      );
      return await executeApplicationEffect(
        provideAccess(
          commitScheduledPerson(input, preparation),
          context.planningCenterAccess
        ),
        context,
        signal,
        { interruptOnAbort: false }
      );
    }
  );
  const remove = audited("remove").remove.handler(
    async ({ input, context, signal }) =>
      await executeApplicationEffect(
        provideAccess(
          removeScheduledPerson(input),
          context.planningCenterAccess
        ),
        context,
        signal,
        { interruptOnAbort: false }
      )
  );
  const updateStatus = audited("updateStatus").updateStatus.handler(
    async ({ input, context, signal }) =>
      await executeApplicationEffect(
        provideAccess(
          updateScheduledPersonStatus(input),
          context.planningCenterAccess
        ),
        context,
        signal,
        { interruptOnAbort: false }
      )
  );
  return { assign, remove, updateStatus };
};

export const scheduleRouter = createScheduleRouter();

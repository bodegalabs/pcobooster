import {
  PlanningCenterAccess,
  resolvePlanningCenterAccess,
} from "@worship-admin/api/application/planning-center-access";
import type { PlanningCenterAccessDependencies } from "@worship-admin/api/application/planning-center-access";
import {
  commitScheduledPerson,
  prepareScheduledPerson,
  removeScheduledPerson,
  updateScheduledPersonStatus,
} from "@worship-admin/api/application/schedule";
import { recordActivityEvent } from "@worship-admin/api/db/activity-events";
import type { ActivityEventInput } from "@worship-admin/api/db/activity-events";
import { logger } from "@worship-admin/api/logger";
import { executeApplicationEffect } from "@worship-admin/api/transport/orpc/execute";
import {
  applicationRuntime,
  rpc,
} from "@worship-admin/api/transport/orpc/implementation";
import { applyPrivateNoStore } from "@worship-admin/api/transport/orpc/response-headers";
import { scheduleActivityEvent } from "@worship-admin/api/transport/orpc/schedule-activity";
import type { ScheduleOperation } from "@worship-admin/api/transport/orpc/schedule-activity";
import { Effect } from "effect";

export interface ScheduleRouterDependencies {
  readonly access?: PlanningCenterAccessDependencies;
  readonly recordActivity: (event: ActivityEventInput) => Promise<void>;
}

const defaultDependencies: ScheduleRouterDependencies = {
  recordActivity: recordActivityEvent,
};

export const createScheduleRouter = (
  dependencies: ScheduleRouterDependencies = defaultDependencies
) => {
  const audited = (operation: ScheduleOperation) =>
    rpc.schedule.use(async ({ context, next, signal }, input) => {
      applyPrivateNoStore(context.resHeaders);
      const access = await executeApplicationEffect(
        applicationRuntime,
        resolvePlanningCenterAccess(dependencies.access),
        context,
        signal
      );
      const record = async (
        result:
          | { success: true; output: unknown }
          | { success: false; error: unknown }
      ) => {
        try {
          await dependencies.recordActivity(
            scheduleActivityEvent({
              operation,
              input,
              authentication: access.authentication,
              context,
              result,
            })
          );
        } catch (error) {
          logger
            .withRequest(context.request)
            .child({ requestId: context.requestId })
            .warn({ err: error }, "Failed to record scheduling activity event");
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
      }
    });

  const assign = audited("assign").assign.handler(
    async ({ input, context, signal }) => {
      const preparation = await executeApplicationEffect(
        applicationRuntime,
        Effect.provideService(
          prepareScheduledPerson(input),
          PlanningCenterAccess,
          context.planningCenterAccess
        ),
        context,
        signal
      );
      return await executeApplicationEffect(
        applicationRuntime,
        Effect.provideService(
          commitScheduledPerson(input, preparation),
          PlanningCenterAccess,
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
        applicationRuntime,
        Effect.provideService(
          removeScheduledPerson(input),
          PlanningCenterAccess,
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
        applicationRuntime,
        Effect.provideService(
          updateScheduledPersonStatus(input),
          PlanningCenterAccess,
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

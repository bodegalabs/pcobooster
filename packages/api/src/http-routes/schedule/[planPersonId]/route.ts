import {
  getActivityRequestContext,
  recordActivityEvent,
} from "@worship-admin/api/db/activity-events";
import { ApiError } from "@worship-admin/api/http/api-error";
import { handlePlanningCenterRoute } from "@worship-admin/api/http/planning-center-route";
import { isNonEmptyString } from "@worship-admin/api/json";
import type { JsonObject } from "@worship-admin/api/json";
import { logger } from "@worship-admin/api/logger";
import { planningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import { invalidateCandidateHistoryForPerson } from "@worship-admin/api/use-cases/planning-center/get-people-for-position";
import { z } from "zod";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  planPersonId: z.string().min(1),
});

const bodySchema = z.object({
  serviceTypeId: z.string().min(1).optional(),
  personId: z.string().min(1).optional(),
  planId: z.string().min(1).optional(),
});

export const DELETE = async (
  request: Request,
  { params }: { params: Promise<{ planPersonId: string }> }
) => {
  const activityRequestContext = getActivityRequestContext(request);
  const requestId = activityRequestContext.requestId ?? crypto.randomUUID();
  const log = logger.withRequest(request).child({ requestId });

  return await handlePlanningCenterRoute(request, async (authContext) => {
    let planPersonId: string | null = null;

    const recordRemoveEventSafely = async (event: {
      success: boolean;
      statusCode: number;
      errorCode: string | null;
      metadata?: JsonObject;
    }) => {
      try {
        await recordActivityEvent({
          eventType: "schedule_remove",
          actorUserId: authContext.session.user.id,
          actorAccountId: authContext.accountId,
          requestId,
          path: activityRequestContext.path,
          method: activityRequestContext.method,
          ipAddress: activityRequestContext.ipAddress,
          userAgent: activityRequestContext.userAgent,
          success: event.success,
          statusCode: event.statusCode,
          errorCode: event.errorCode,
          metadata: {
            planPersonId,
            ...event.metadata,
          },
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.warn({ err }, "Failed to record schedule remove activity event");
      }
    };

    try {
      const parsedParams = paramsSchema.safeParse(await params);
      if (!parsedParams.success) {
        throw new ApiError(
          400,
          "INVALID_REQUEST",
          "Invalid request",
          parsedParams.error.issues
        );
      }
      ({ planPersonId } = parsedParams.data);

      let body: z.infer<typeof bodySchema> = {};
      try {
        const json: unknown = await request.json();
        const parsedBody = bodySchema.safeParse(json);
        if (parsedBody.success) {
          body = parsedBody.data;
        }
      } catch {
        body = {};
      }

      await planningCenterPeopleService.deletePlanPerson(planPersonId, body);
      if (isNonEmptyString(body.personId)) {
        invalidateCandidateHistoryForPerson(body.personId);
      }

      log.info({ planPersonId }, "PlanPerson removed successfully");
      await recordRemoveEventSafely({
        success: true,
        statusCode: 200,
        errorCode: null,
        metadata: body,
      });

      return { success: true };
    } catch (error) {
      await recordRemoveEventSafely({
        success: false,
        statusCode: error instanceof ApiError ? error.status : 500,
        errorCode:
          error instanceof ApiError ? error.code : "INTERNAL_SERVER_ERROR",
      });

      throw error;
    }
  });
};

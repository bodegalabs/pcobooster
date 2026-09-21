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
  status: z.enum(["C", "U", "D"]),
  serviceTypeId: z.string().min(1).optional(),
  personId: z.string().min(1).optional(),
  planId: z.string().min(1).optional(),
});

export const PATCH = async (
  request: Request,
  { params }: { params: Promise<{ planPersonId: string }> }
) => {
  const activityRequestContext = getActivityRequestContext(request);
  const requestId = activityRequestContext.requestId ?? crypto.randomUUID();
  const log = logger.withRequest(request).child({ requestId });

  return await handlePlanningCenterRoute(request, async (authContext) => {
    const recordStatusEventSafely = async (event: {
      success: boolean;
      statusCode: number;
      errorCode: string | null;
      planPersonId: string | null;
      status: "C" | "U" | "D" | null;
      metadata?: JsonObject;
    }) => {
      try {
        await recordActivityEvent({
          eventType: "schedule_status_change",
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
            planPersonId: event.planPersonId,
            status: event.status,
            ...event.metadata,
          },
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.warn(
          { err },
          "Failed to record schedule status change activity event"
        );
      }
    };

    let planPersonId: string | null = null;
    let nextStatus: "C" | "U" | "D" | null = null;
    let requestBody: z.infer<typeof bodySchema> | null = null;

    try {
      const parsedParams = paramsSchema.safeParse(await params);
      if (!parsedParams.success) {
        log.warn(
          { issues: parsedParams.error.issues },
          "Invalid schedule status route params"
        );
        throw new ApiError(
          400,
          "INVALID_REQUEST",
          "Invalid request",
          parsedParams.error.issues
        );
      }
      ({ planPersonId } = parsedParams.data);

      const parsedBody = bodySchema.safeParse(await request.json());
      if (!parsedBody.success) {
        log.warn(
          { issues: parsedBody.error.issues },
          "Invalid schedule status request body"
        );
        throw new ApiError(
          400,
          "INVALID_REQUEST",
          "Invalid request",
          parsedBody.error.issues
        );
      }
      requestBody = parsedBody.data;
      nextStatus = requestBody.status;

      await planningCenterPeopleService.updatePlanPersonStatus(
        planPersonId,
        nextStatus,
        {
          personId: requestBody.personId,
          serviceTypeId: requestBody.serviceTypeId,
          planId: requestBody.planId,
        }
      );
      if (isNonEmptyString(requestBody.personId)) {
        invalidateCandidateHistoryForPerson(requestBody.personId);
      }

      log.info(
        { planPersonId, status: nextStatus },
        "PlanPerson status updated successfully"
      );

      await recordStatusEventSafely({
        success: true,
        statusCode: 200,
        errorCode: null,
        planPersonId,
        status: nextStatus,
        metadata: {
          personId: requestBody.personId ?? null,
          serviceTypeId: requestBody.serviceTypeId ?? null,
          planId: requestBody.planId ?? null,
        },
      });

      return { success: true };
    } catch (error) {
      await recordStatusEventSafely({
        success: false,
        statusCode: error instanceof ApiError ? error.status : 500,
        errorCode:
          error instanceof ApiError ? error.code : "INTERNAL_SERVER_ERROR",
        planPersonId,
        status: nextStatus,
      });

      throw error;
    }
  });
};

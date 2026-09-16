import { after } from "next/server";
import { z } from "zod";

import {
  getActivityRequestContext,
  recordActivityEvent,
} from "@/lib/db/activity-events";
import { ApiError } from "@/lib/http/api-error";
import { handlePlanningCenterRoute } from "@/lib/http/planning-center-route";
import { logger } from "@/lib/logger";
import { planningCenterPeopleService } from "@/lib/planning-center/services/people-service";
import { invalidateCandidateHistoryForPerson } from "@/lib/use-cases/planning-center/get-people-for-position";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  planPersonId: z.string().min(1),
});

const bodySchema = z.object({
  serviceTypeId: z.string().min(1).optional(),
  personId: z.string().min(1).optional(),
  planId: z.string().min(1).optional(),
});

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ planPersonId: string }> }
) {
  const activityRequestContext = getActivityRequestContext(request);
  const requestId = activityRequestContext.requestId ?? crypto.randomUUID();
  const log = logger.withRequest(request).child({ requestId });

  return handlePlanningCenterRoute(request, async (authContext) => {
    let planPersonId: string | null = null;

    const recordRemoveEventSafely = (event: {
      success: boolean;
      statusCode: number;
      errorCode: string | null;
      metadata?: Record<string, unknown>;
    }) => {
      after(async () => {
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
      });
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
      planPersonId = parsedParams.data.planPersonId;

      let body: z.infer<typeof bodySchema> = {};
      try {
        const json = await request.json();
        const parsedBody = bodySchema.safeParse(json);
        if (parsedBody.success) body = parsedBody.data;
      } catch {
        body = {};
      }

      await planningCenterPeopleService.deletePlanPerson(planPersonId, body);
      if (body.personId) {
        invalidateCandidateHistoryForPerson(body.personId);
      }

      log.info({ planPersonId }, "PlanPerson removed successfully");
      recordRemoveEventSafely({
        success: true,
        statusCode: 200,
        errorCode: null,
        metadata: body,
      });

      return { success: true };
    } catch (error) {
      if (error instanceof ApiError) {
        recordRemoveEventSafely({
          success: false,
          statusCode: error.status,
          errorCode: error.code,
        });
      } else {
        recordRemoveEventSafely({
          success: false,
          statusCode: 500,
          errorCode: "INTERNAL_SERVER_ERROR",
        });
      }

      throw error;
    }
  });
}

import {
  getActivityRequestContext,
  recordActivityEvent,
} from "@worship-admin/api/db/activity-events";
import { ApiError } from "@worship-admin/api/http/api-error";
import { handlePlanningCenterRoute } from "@worship-admin/api/http/planning-center-route";
import type { JsonObject } from "@worship-admin/api/json";
import { logger } from "@worship-admin/api/logger";
import { planningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import { isPresentationMode } from "@worship-admin/api/presentation-mode";
import { invalidateCandidateHistoryForPerson } from "@worship-admin/api/use-cases/planning-center/get-people-for-position";
import {
  schedulePerson,
  schedulePersonSchema,
} from "@worship-admin/api/use-cases/planning-center/schedule-person";
import type { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = schedulePersonSchema;

export const POST = async (request: Request) => {
  const activityRequestContext = getActivityRequestContext(request);
  const requestId = activityRequestContext.requestId ?? crypto.randomUUID();
  const log = logger.withRequest(request).child({ requestId });

  return await handlePlanningCenterRoute(request, async (authContext) => {
    const recordScheduleEventSafely = async (event: {
      success: boolean;
      statusCode: number;
      errorCode: string | null;
      input: z.infer<typeof bodySchema> | null;
      metadata?: JsonObject;
    }) => {
      try {
        await recordActivityEvent({
          eventType: "schedule_attempt",
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
          serviceTypeId: event.input?.serviceTypeId ?? null,
          personId: event.input?.personId ?? null,
          planId: event.input?.planId ?? null,
          teamId: event.input?.teamId ?? null,
          positionId: event.input?.positionId ?? null,
          metadata: event.metadata ?? null,
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.warn({ err }, "Failed to record schedule activity event");
      }
    };

    let requestBody: z.infer<typeof bodySchema> | null = null;

    try {
      const parsed = bodySchema.safeParse(await request.json());
      if (!parsed.success) {
        log.warn(
          { issues: parsed.error.issues },
          "Invalid schedule request body"
        );
        throw new ApiError(
          400,
          "INVALID_REQUEST",
          "Invalid request",
          parsed.error.issues
        );
      }
      requestBody = parsed.data;
      const { serviceTypeId, personId, planId, teamId, positionId, oneOff } =
        requestBody;

      const result = await schedulePerson(requestBody);
      const data = { id: result.id };
      if (!result.matchesTarget) {
        await recordScheduleEventSafely({
          success: false,
          statusCode: 409,
          errorCode: "POSITION_MISMATCH",
          input: requestBody,
          metadata: {
            selectedTeamName: result.target.teamName,
            selectedPositionName: result.target.positionName,
            createdTeamPositionName: result.createdPositionName,
            planPersonId: result.id,
          },
        });
        return Response.json(
          {
            error:
              "PlanPerson was created but did not match selected team/position. Please check split-team/time settings in Planning Center.",
            code: "POSITION_MISMATCH",
            details: {
              selected: {
                teamId,
                teamName: result.target.teamName,
                positionId,
                positionName: result.target.positionName,
              },
              created: {
                planPersonId: result.id,
                teamPositionName: result.createdPositionName,
              },
            },
          },
          { status: 409 }
        );
      }

      log.info(
        {
          serviceTypeId,
          personId,
          planId,
          teamId,
          positionId,
          planPersonId: data.id,
          oneOff,
        },
        "Person scheduled successfully"
      );

      await recordScheduleEventSafely({
        success: true,
        statusCode: 200,
        errorCode: null,
        input: requestBody,
        metadata: {
          planPersonId: data.id,
          oneOff,
        },
      });

      return { success: true, data: { id: data.id } };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const errorMessage = err.message || "";

      if (
        errorMessage.includes("has already been scheduled for this position")
      ) {
        if (requestBody) {
          planningCenterPeopleService.invalidateScheduleReadCaches({
            personId: requestBody.personId,
            serviceTypeId: requestBody.serviceTypeId,
            planId: requestBody.planId,
          });
          invalidateCandidateHistoryForPerson(requestBody.personId);
        }

        await recordScheduleEventSafely({
          success: false,
          statusCode: 409,
          errorCode: "ALREADY_SCHEDULED",
          input: requestBody,
        });

        log.info({ err }, "Person already scheduled for selected position");
        return Response.json(
          {
            error:
              "Person is already scheduled for this selected plan/team/position",
            code: "ALREADY_SCHEDULED",
            details: isPresentationMode() ? undefined : errorMessage,
          },
          { status: 409 }
        );
      }

      await recordScheduleEventSafely({
        success: false,
        statusCode: error instanceof ApiError ? error.status : 500,
        errorCode:
          error instanceof ApiError ? error.code : "INTERNAL_SERVER_ERROR",
        input: requestBody,
      });

      throw error;
    }
  });
};

import { after, NextResponse } from "next/server";
import { z } from "zod";
import { isPresentationMode } from "@/lib/presentation-mode";
import { ApiError } from "@/lib/http/api-error";
import { handlePlanningCenterRoute } from "@/lib/http/planning-center-route";
import { logger } from "@/lib/logger";
import { planningCenterPeopleService } from "@/lib/planning-center/services/people-service";
import { planningCenterCatalogService } from "@/lib/planning-center/services/catalog-service";
import { findIncluded } from "@/lib/planning-center/utils";
import {
  getActivityRequestContext,
  recordActivityEvent,
} from "@/lib/db/activity-events";
import { invalidateCandidateHistoryForPerson } from "@/lib/use-cases/planning-center/get-people-for-position";
import type { RawTeamPosition, RawTeam } from "@/lib/types";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  serviceTypeId: z.string().min(1),
  personId: z.string().min(1),
  planId: z.string().min(1),
  teamId: z.string().min(1),
  positionId: z.string().min(1),
  teamName: z.string().trim().min(1).optional(),
  positionName: z.string().trim().min(1).optional(),
  oneOff: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const activityRequestContext = getActivityRequestContext(request);
  const requestId = activityRequestContext.requestId ?? crypto.randomUUID();
  const log = logger.withRequest(request).child({ requestId });

  return handlePlanningCenterRoute(request, async (authContext) => {
    const recordScheduleEventSafely = (event: {
      success: boolean;
      statusCode: number;
      errorCode: string | null;
      input: z.infer<typeof bodySchema> | null;
      metadata?: Record<string, unknown>;
    }) => {
      after(async () => {
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
      });
    };

    let requestBody: z.infer<typeof bodySchema> | null = null;

    try {
      const parsed = bodySchema.safeParse(await request.json());
      if (!parsed.success) {
        log.warn({ issues: parsed.error.issues }, "Invalid schedule request body");
        throw new ApiError(400, "INVALID_REQUEST", "Invalid request", parsed.error.issues);
      }
      requestBody = parsed.data;
      const {
        serviceTypeId,
        personId,
        planId,
        teamId,
        positionId,
        oneOff,
      } = requestBody;

      const personAssignmentsPromise = oneOff
        ? Promise.resolve(null)
        : planningCenterPeopleService.getPersonTeamPositionAssignments(personId);
      const teamPositionsPromise =
        planningCenterCatalogService.getServiceTypeTeamPositionsWithTeams(serviceTypeId);
      const [{ data: teamPositions, included }, personAssignments] = await Promise.all([
        teamPositionsPromise,
        personAssignmentsPromise,
      ]);

      const selectedPosition = teamPositions.find((p) => p.id === positionId) as
        | (RawTeamPosition & { relationships?: { team?: { data?: { id: string } } } })
        | undefined;
      if (!selectedPosition && (!oneOff || !requestBody.positionName)) {
        throw new ApiError(400, "INVALID_REQUEST", "Selected position was not found for this service type");
      }
      const selectedPositionTeamId = selectedPosition?.relationships?.team?.data?.id;
      if (selectedPosition && (!selectedPositionTeamId || selectedPositionTeamId !== teamId)) {
        throw new ApiError(400, "INVALID_REQUEST", "Selected position does not belong to selected team");
      }

      const selectedTeam = findIncluded(included, "Team", teamId) as RawTeam | undefined;
      if (!selectedPosition && !selectedTeam) {
        throw new ApiError(400, "INVALID_REQUEST", "Selected team was not found for this service type");
      }
      const selectedTeamName =
        requestBody.teamName ||
        (selectedTeam?.attributes?.name as string | undefined) ||
        "";
      const selectedPositionName = selectedPosition?.attributes?.name || requestBody.positionName || "";

      if (!oneOff) {
        const hasPositionAssignment = personAssignments?.data.some((assignment) => {
          const rel = assignment.relationships?.team_position?.data;
          const assignmentPositionId = Array.isArray(rel) ? rel[0]?.id : rel?.id;
          return assignmentPositionId === positionId;
        }) ?? false;
        if (!hasPositionAssignment) {
          throw new ApiError(400, "INVALID_REQUEST", "Person is not assigned to the selected team position");
        }
      }

      const data = await planningCenterPeopleService.createPlanPerson(
        serviceTypeId,
        personId,
        planId,
        teamId,
        selectedPositionName
      );
      invalidateCandidateHistoryForPerson(personId);

      const createdTeamPositionName = (data.attributes.team_position_name as string | undefined) || "";
      if (selectedPositionName && createdTeamPositionName) {
        const selectedWithTeam = selectedTeamName
          ? `${selectedTeamName} - ${selectedPositionName}`
          : "";
        const positionMatches =
          createdTeamPositionName === selectedPositionName ||
          createdTeamPositionName === selectedWithTeam ||
          createdTeamPositionName.endsWith(` - ${selectedPositionName}`);
        const teamMatches =
          !selectedTeamName ||
          createdTeamPositionName === selectedPositionName ||
          createdTeamPositionName === selectedWithTeam ||
          createdTeamPositionName.startsWith(`${selectedTeamName} - `);

        if (!teamMatches || !positionMatches) {
          recordScheduleEventSafely({
            success: false,
            statusCode: 409,
            errorCode: "POSITION_MISMATCH",
            input: requestBody,
            metadata: {
              selectedTeamName,
              selectedPositionName,
              createdTeamPositionName,
              planPersonId: data.id,
            },
          });

          return NextResponse.json(
            {
              error:
                "PlanPerson was created but did not match selected team/position. Please check split-team/time settings in Planning Center.",
              code: "POSITION_MISMATCH",
              details: {
                selected: {
                  teamId,
                  teamName: selectedTeamName,
                  positionId,
                  positionName: selectedPositionName,
                },
                created: {
                  planPersonId: data.id,
                  teamPositionName: createdTeamPositionName,
                },
              },
            },
            { status: 409 }
          );
        }
      }

      log.info(
        { serviceTypeId, personId, planId, teamId, positionId, planPersonId: data.id, oneOff },
        "Person scheduled successfully"
      );

      recordScheduleEventSafely({
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

      if (errorMessage.includes("has already been scheduled for this position")) {
        if (requestBody) {
          planningCenterPeopleService.invalidateScheduleReadCaches({
            personId: requestBody.personId,
            serviceTypeId: requestBody.serviceTypeId,
            planId: requestBody.planId,
          });
          invalidateCandidateHistoryForPerson(requestBody.personId);
        }

        recordScheduleEventSafely({
          success: false,
          statusCode: 409,
          errorCode: "ALREADY_SCHEDULED",
          input: requestBody,
        });

        log.info({ err }, "Person already scheduled for selected position");
        return NextResponse.json(
          {
            error: "Person is already scheduled for this selected plan/team/position",
            code: "ALREADY_SCHEDULED",
            details: isPresentationMode() ? undefined : errorMessage,
          },
          { status: 409 }
        );
      }

      if (error instanceof ApiError) {
        recordScheduleEventSafely({
          success: false,
          statusCode: error.status,
          errorCode: error.code,
          input: requestBody,
        });
      } else {
        recordScheduleEventSafely({
          success: false,
          statusCode: 500,
          errorCode: "INTERNAL_SERVER_ERROR",
          input: requestBody,
        });
      }

      throw error;
    }
  });
}

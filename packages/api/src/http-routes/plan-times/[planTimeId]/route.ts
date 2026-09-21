import { ApiError } from "@worship-admin/api/http/api-error";
import { handlePlanningCenterRoute } from "@worship-admin/api/http/planning-center-route";
import { logger } from "@worship-admin/api/logger";
import { serializePlanTime } from "@worship-admin/api/plan-time-client";
import {
  deletePlanTime,
  updatePlanTime,
} from "@worship-admin/api/use-cases/planning-center/plan-times";
import {
  deletePlanTimeBodySchema,
  updatePlanTimeBodySchema,
} from "@worship-admin/api/use-cases/planning-center/schemas";
import { z } from "zod";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  planTimeId: z.string().min(1),
});

export const PATCH = async (
  request: Request,
  { params }: { params: Promise<{ planTimeId: string }> }
) => {
  const log = logger.withRequest(request);
  return await handlePlanningCenterRoute(request, async () => {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      log.warn(
        { issues: parsedParams.error.issues },
        "Invalid plan-time route params"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsedParams.error.issues
      );
    }

    const body: unknown = await request.json();
    const parsedBody = updatePlanTimeBodySchema.safeParse(body);
    if (!parsedBody.success) {
      log.warn(
        { issues: parsedBody.error.issues },
        "Invalid plan-time update body"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsedBody.error.issues
      );
    }

    const planTime = await updatePlanTime({
      serviceTypeId: parsedBody.data.service_type_id,
      planId: parsedBody.data.plan_id,
      planTimeId: parsedParams.data.planTimeId,
      name: parsedBody.data.name,
      startsAt: parsedBody.data.starts_at,
      endsAt: parsedBody.data.ends_at,
      timeType: parsedBody.data.time_type,
      assignedTeamIds: parsedBody.data.assigned_team_ids,
      assignedPositionIds: parsedBody.data.assigned_position_ids,
      assignedNeededPositionIds: parsedBody.data.assigned_needed_position_ids,
      clearedNeededPositionIds: parsedBody.data.cleared_needed_position_ids,
      assignedPlanPersonIds: parsedBody.data.assigned_plan_person_ids,
      clearedPlanPersonIds: parsedBody.data.cleared_plan_person_ids,
    });

    return serializePlanTime(planTime);
  });
};

export const DELETE = async (
  request: Request,
  { params }: { params: Promise<{ planTimeId: string }> }
) => {
  const log = logger.withRequest(request);
  return await handlePlanningCenterRoute(request, async () => {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      log.warn(
        { issues: parsedParams.error.issues },
        "Invalid plan-time route params"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsedParams.error.issues
      );
    }

    const body: unknown = await request.json();
    const parsedBody = deletePlanTimeBodySchema.safeParse(body);
    if (!parsedBody.success) {
      log.warn(
        { issues: parsedBody.error.issues },
        "Invalid plan-time delete body"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsedBody.error.issues
      );
    }

    await deletePlanTime({
      serviceTypeId: parsedBody.data.service_type_id,
      planId: parsedBody.data.plan_id,
      planTimeId: parsedParams.data.planTimeId,
    });

    return new Response(null, { status: 204 });
  });
};

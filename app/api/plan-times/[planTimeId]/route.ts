import { z } from "zod";

import { ApiError } from "@/lib/http/api-error";
import { handlePlanningCenterRoute } from "@/lib/http/planning-center-route";
import { logger } from "@/lib/logger";
import { serializePlanTime } from "@/lib/plan-time-client";
import {
  deletePlanTime,
  updatePlanTime,
} from "@/lib/use-cases/planning-center/plan-times";
import {
  deletePlanTimeBodySchema,
  updatePlanTimeBodySchema,
} from "@/lib/use-cases/planning-center/schemas";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  planTimeId: z.string().min(1),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ planTimeId: string }> }
) {
  const log = logger.withRequest(request);
  return handlePlanningCenterRoute(request, async () => {
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

    const body = await request.json();
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
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ planTimeId: string }> }
) {
  const log = logger.withRequest(request);
  return handlePlanningCenterRoute(request, async () => {
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

    const body = await request.json();
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
}

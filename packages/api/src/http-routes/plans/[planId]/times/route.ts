import { ApiError } from "@worship-admin/api/http/api-error";
import { handlePlanningCenterRoute } from "@worship-admin/api/http/planning-center-route";
import { logger } from "@worship-admin/api/logger";
import {
  serializePlanTime,
  serializePlanTimes,
} from "@worship-admin/api/plan-time-client";
import {
  createPlanTime,
  getPlanTimes,
} from "@worship-admin/api/use-cases/planning-center/plan-times";
import {
  createPlanTimeBodySchema,
  planTimesQuerySchema,
} from "@worship-admin/api/use-cases/planning-center/schemas";
import { z } from "zod";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  planId: z.string().min(1),
});

export const GET = async (
  request: Request,
  { params }: { params: Promise<{ planId: string }> }
) => {
  const log = logger.withRequest(request);
  return await handlePlanningCenterRoute(request, async () => {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      log.warn(
        { issues: parsedParams.error.issues },
        "Invalid plan-times route params"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsedParams.error.issues
      );
    }

    const { searchParams } = new URL(request.url);
    const parsedQuery = planTimesQuerySchema.safeParse({
      service_type_id: searchParams.get("service_type_id") ?? undefined,
    });
    if (!parsedQuery.success) {
      log.warn(
        { issues: parsedQuery.error.issues },
        "Invalid plan-times query params"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsedQuery.error.issues
      );
    }

    const planTimes = await getPlanTimes(
      parsedQuery.data.service_type_id,
      parsedParams.data.planId
    );
    return serializePlanTimes(planTimes);
  });
};

export const POST = async (
  request: Request,
  { params }: { params: Promise<{ planId: string }> }
) => {
  const log = logger.withRequest(request);
  return await handlePlanningCenterRoute(request, async () => {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      log.warn(
        { issues: parsedParams.error.issues },
        "Invalid plan-times route params"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsedParams.error.issues
      );
    }

    const body: unknown = await request.json();
    const parsedBody = createPlanTimeBodySchema.safeParse(body);
    if (!parsedBody.success) {
      log.warn(
        { issues: parsedBody.error.issues },
        "Invalid plan-time create body"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsedBody.error.issues
      );
    }

    const planTime = await createPlanTime({
      serviceTypeId: parsedBody.data.service_type_id,
      planId: parsedParams.data.planId,
      name: parsedBody.data.name,
      startsAt: parsedBody.data.starts_at,
      endsAt: parsedBody.data.ends_at,
      timeType: parsedBody.data.time_type,
      assignedTeamIds: parsedBody.data.assigned_team_ids,
      assignedPositionIds: parsedBody.data.assigned_position_ids,
    });

    return serializePlanTime(planTime);
  });
};

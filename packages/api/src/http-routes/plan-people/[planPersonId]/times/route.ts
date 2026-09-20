import { ApiError } from "@worship-admin/api/http/api-error";
import { handlePlanningCenterRoute } from "@worship-admin/api/http/planning-center-route";
import { logger } from "@worship-admin/api/logger";
import { updatePlanPersonTimes } from "@worship-admin/api/use-cases/planning-center/plan-person-times";
import { updatePlanPersonTimesBodySchema } from "@worship-admin/api/use-cases/planning-center/schemas";
import { z } from "zod";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  planPersonId: z.string().min(1),
});

export const PATCH = async (
  request: Request,
  { params }: { params: Promise<{ planPersonId: string }> }
) => {
  const log = logger.withRequest(request);
  return await handlePlanningCenterRoute(request, async () => {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      log.warn(
        { issues: parsedParams.error.issues },
        "Invalid plan-person route params"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsedParams.error.issues
      );
    }

    const body: unknown = await request.json();
    const parsedBody = updatePlanPersonTimesBodySchema.safeParse(body);
    if (!parsedBody.success) {
      log.warn(
        { issues: parsedBody.error.issues },
        "Invalid plan-person times update body"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsedBody.error.issues
      );
    }

    await updatePlanPersonTimes({
      serviceTypeId: parsedBody.data.service_type_id,
      planId: parsedBody.data.plan_id,
      personId: parsedBody.data.person_id,
      planPersonId: parsedParams.data.planPersonId,
      planTimeIds: parsedBody.data.plan_time_ids,
    });

    return { ok: true };
  });
};

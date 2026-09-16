import { z } from "zod";

import { ApiError } from "@/lib/http/api-error";
import { handlePlanningCenterRoute } from "@/lib/http/planning-center-route";
import { logger } from "@/lib/logger";
import { updatePlanPersonTimes } from "@/lib/use-cases/planning-center/plan-person-times";
import { updatePlanPersonTimesBodySchema } from "@/lib/use-cases/planning-center/schemas";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  planPersonId: z.string().min(1),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ planPersonId: string }> }
) {
  const log = logger.withRequest(request);
  return handlePlanningCenterRoute(request, async () => {
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

    const body = await request.json();
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
}

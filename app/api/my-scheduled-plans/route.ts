import { z } from "zod";

import { ApiError } from "@/lib/http/api-error";
import { handlePlanningCenterRoute } from "@/lib/http/planning-center-route";
import { logger } from "@/lib/logger";
import { getCurrentUserScheduledPlanIds } from "@/lib/use-cases/planning-center/get-current-user-scheduled-plans";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  planIds: z.array(z.string().min(1)).max(500),
});

export const POST = async (request: Request) => {
  const log = logger.withRequest(request);

  return await handlePlanningCenterRoute(request, async ({ account }) => {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      log.warn(
        { issues: parsed.error.issues },
        "Invalid my-scheduled-plans request body"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsed.error.issues
      );
    }

    const uniquePlanIds = [...new Set(parsed.data.planIds)];
    const scheduledPlanIds = await getCurrentUserScheduledPlanIds(
      request,
      account,
      uniquePlanIds
    );

    log.info(
      {
        requestedCount: uniquePlanIds.length,
        matchedCount: scheduledPlanIds.length,
      },
      "Resolved current-user scheduled plan IDs"
    );

    return { planIds: scheduledPlanIds };
  });
};

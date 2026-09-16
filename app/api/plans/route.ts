import { z } from "zod";

import { ApiError } from "@/lib/http/api-error";
import { handlePlanningCenterRoute } from "@/lib/http/planning-center-route";
import { logger } from "@/lib/logger";
import { getPlansForServiceType } from "@/lib/use-cases/planning-center/get-plans";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  service_type_id: z.string().min(1),
});

export const GET = async (request: Request) => {
  const log = logger.withRequest(request);
  return await handlePlanningCenterRoute(request, async () => {
    log.info("Fetching plans");
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      service_type_id: searchParams.get("service_type_id") ?? undefined,
    });
    if (!parsed.success) {
      log.warn({ issues: parsed.error.issues }, "Invalid plans query params");
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsed.error.issues
      );
    }
    const { service_type_id } = parsed.data;

    const plans = await getPlansForServiceType(service_type_id);

    log.info(
      { serviceTypeId: service_type_id, count: plans.length },
      "Plans fetched"
    );
    return plans;
  });
};

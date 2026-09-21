import { ApiError } from "@worship-admin/api/http/api-error";
import { handlePlanningCenterRoute } from "@worship-admin/api/http/planning-center-route";
import { logger } from "@worship-admin/api/logger";
import { getPlansForServiceType } from "@worship-admin/api/use-cases/planning-center/get-plans";
import { z } from "zod";

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

import { ApiError } from "@worship-admin/api/http/api-error";
import { handlePlanningCenterRoute } from "@worship-admin/api/http/planning-center-route";
import { logger } from "@worship-admin/api/logger";
import { warmPeopleHistoryForPlan } from "@worship-admin/api/use-cases/planning-center/get-people-for-position";
import { z } from "zod";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  service_type_id: z.string().min(1),
  date: z.string().min(1),
});

export const GET = async (request: Request) => {
  const log = logger.withRequest(request);
  return await handlePlanningCenterRoute(request, async () => {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      service_type_id: searchParams.get("service_type_id") ?? undefined,
      date: searchParams.get("date") ?? undefined,
    });

    if (!parsed.success) {
      log.warn(
        { issues: parsed.error.issues },
        "Invalid people warmup query params"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsed.error.issues
      );
    }

    const startedAt = performance.now();
    await warmPeopleHistoryForPlan({
      serviceTypeId: parsed.data.service_type_id,
      date: parsed.data.date,
    });

    log.info(
      {
        serviceTypeId: parsed.data.service_type_id,
        elapsedMs: Math.round(performance.now() - startedAt),
      },
      "People history warmed"
    );

    return { warmed: true };
  });
};

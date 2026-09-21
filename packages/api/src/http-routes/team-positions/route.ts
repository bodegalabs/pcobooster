import { ApiError } from "@worship-admin/api/http/api-error";
import { handlePlanningCenterRoute } from "@worship-admin/api/http/planning-center-route";
import { logger } from "@worship-admin/api/logger";
import { getNeededTeamPositionsForPlan } from "@worship-admin/api/use-cases/planning-center/get-team-positions";
import { presentTeamPositions } from "@worship-admin/api/use-cases/planning-center/presentation";
import { z } from "zod";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  service_type_id: z.string().min(1),
  plan_id: z.string().min(1),
  series_id: z.string().min(1).optional(),
});

export const GET = async (request: Request) => {
  const log = logger.withRequest(request);
  return await handlePlanningCenterRoute(request, async () => {
    log.info("Fetching team positions");

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      service_type_id: searchParams.get("service_type_id") ?? undefined,
      plan_id: searchParams.get("plan_id") ?? undefined,
      series_id: searchParams.get("series_id") ?? undefined,
    });

    if (!parsed.success) {
      log.warn(
        { issues: parsed.error.issues },
        "Invalid team-positions query params"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsed.error.issues
      );
    }

    const { service_type_id, plan_id, series_id } = parsed.data;
    const groupedPositions = await getNeededTeamPositionsForPlan(
      service_type_id,
      plan_id,
      series_id
    );

    log.info(
      {
        serviceTypeId: service_type_id,
        seriesId: series_id ?? null,
        planId: plan_id,
        teamCount: groupedPositions.length,
        positionCount: groupedPositions.reduce(
          (sum, g) => sum + g.positions.length,
          0
        ),
      },
      "Plan needed team positions fetched"
    );

    return await presentTeamPositions(groupedPositions);
  });
};

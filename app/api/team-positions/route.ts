import { presentTeamPositions } from "@/lib/use-cases/planning-center/presentation";
import { z } from "zod";
import { ApiError } from "@/lib/http/api-error";
import { handlePlanningCenterRoute } from "@/lib/http/planning-center-route";
import { logger } from "@/lib/logger";
import { getNeededTeamPositionsForPlan } from "@/lib/use-cases/planning-center/get-team-positions";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  service_type_id: z.string().min(1),
  plan_id: z.string().min(1),
  series_id: z.string().min(1).optional(),
});

export async function GET(request: Request) {
  const log = logger.withRequest(request);
  return handlePlanningCenterRoute(request, async () => {
    log.info("Fetching team positions");

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      service_type_id: searchParams.get("service_type_id") ?? undefined,
      plan_id: searchParams.get("plan_id") ?? undefined,
      series_id: searchParams.get("series_id") ?? undefined,
    });

    if (!parsed.success) {
      log.warn({ issues: parsed.error.issues }, "Invalid team-positions query params");
      throw new ApiError(400, "INVALID_REQUEST", "Invalid request", parsed.error.issues);
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
        positionCount: groupedPositions.reduce((sum, g) => sum + g.positions.length, 0),
      },
      "Plan needed team positions fetched"
    );

    return presentTeamPositions(groupedPositions);
  });
}

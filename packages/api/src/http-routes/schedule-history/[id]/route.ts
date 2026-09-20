import { ApiError } from "@worship-admin/api/http/api-error";
import { handlePlanningCenterRoute } from "@worship-admin/api/http/planning-center-route";
import { logger } from "@worship-admin/api/logger";
import { getScheduleHistory } from "@worship-admin/api/use-cases/planning-center/get-schedule-history";
import { z } from "zod";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string().min(1),
});

const querySchema = z.object({
  days: z.coerce.number().int().positive().optional(),
});

export const GET = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const log = logger.withRequest(request);
  return await handlePlanningCenterRoute(request, async () => {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      log.warn(
        { issues: parsedParams.error.issues },
        "Invalid schedule-history route params"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsedParams.error.issues
      );
    }
    const { id } = parsedParams.data;
    const { searchParams } = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      days: searchParams.get("days") ?? undefined,
    });
    if (!parsedQuery.success) {
      log.warn(
        { issues: parsedQuery.error.issues, personId: id },
        "Invalid schedule-history query params"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsedQuery.error.issues
      );
    }
    const lookbackDays = parsedQuery.data.days ?? 90;
    log.info({ personId: id, lookbackDays }, "Fetching schedule history");
    const { planPeople, frequency } = await getScheduleHistory(
      id,
      lookbackDays
    );

    log.info(
      {
        personId: id,
        planPeopleCount: planPeople.length,
        totalServed: frequency.totalServed,
      },
      "Schedule history fetched"
    );
    return {
      planPeople,
      frequency,
    };
  });
};

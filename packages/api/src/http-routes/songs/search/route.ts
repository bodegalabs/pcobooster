import { ApiError } from "@worship-admin/api/http/api-error";
import { handlePlanningCenterRoute } from "@worship-admin/api/http/planning-center-route";
import { logger } from "@worship-admin/api/logger";
import { songSearchQuerySchema } from "@worship-admin/api/use-cases/planning-center/schemas";
import { searchSongs } from "@worship-admin/api/use-cases/planning-center/search-songs";

export const dynamic = "force-dynamic";

export const GET = async (request: Request) => {
  const log = logger.withRequest(request);
  return await handlePlanningCenterRoute(request, async (ctx) => {
    const { searchParams } = new URL(request.url);
    const parsed = songSearchQuerySchema.safeParse({
      service_type_id: searchParams.get("service_type_id") ?? undefined,
      q: searchParams.get("q") ?? undefined,
    });

    if (!parsed.success) {
      log.warn(
        { issues: parsed.error.issues },
        "Invalid song search query params"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsed.error.issues
      );
    }

    return await searchSongs(
      ctx.accountId,
      parsed.data.service_type_id,
      parsed.data.q
    );
  });
};

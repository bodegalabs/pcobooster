import { ApiError } from "@worship-admin/api/http/api-error";
import { handlePlanningCenterRoute } from "@worship-admin/api/http/planning-center-route";
import { logger } from "@worship-admin/api/logger";
import { getSongOptions } from "@worship-admin/api/use-cases/planning-center/get-song-options";
import { songOptionsQuerySchema } from "@worship-admin/api/use-cases/planning-center/schemas";
import { z } from "zod";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  songId: z.string().min(1),
});

export const GET = async (
  request: Request,
  { params }: { params: Promise<{ songId: string }> }
) => {
  const log = logger.withRequest(request);
  return await handlePlanningCenterRoute(request, async () => {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      log.warn(
        { issues: parsedParams.error.issues },
        "Invalid song options route params"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsedParams.error.issues
      );
    }

    const { searchParams } = new URL(request.url);
    const parsedQuery = songOptionsQuerySchema.safeParse({
      service_type_id: searchParams.get("service_type_id") ?? undefined,
    });
    if (!parsedQuery.success) {
      log.warn(
        { issues: parsedQuery.error.issues },
        "Invalid song options query params"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsedQuery.error.issues
      );
    }

    return await getSongOptions(
      parsedParams.data.songId,
      parsedQuery.data.service_type_id
    );
  });
};

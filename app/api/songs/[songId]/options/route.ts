import { z } from "zod";

import { ApiError } from "@/lib/http/api-error";
import { handlePlanningCenterRoute } from "@/lib/http/planning-center-route";
import { logger } from "@/lib/logger";
import { getSongOptions } from "@/lib/use-cases/planning-center/get-song-options";
import { songOptionsQuerySchema } from "@/lib/use-cases/planning-center/schemas";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  songId: z.string().min(1),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ songId: string }> }
) {
  const log = logger.withRequest(request);
  return handlePlanningCenterRoute(request, async () => {
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

    return getSongOptions(
      parsedParams.data.songId,
      parsedQuery.data.service_type_id
    );
  });
}

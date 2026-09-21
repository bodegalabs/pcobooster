import { ApiError } from "@worship-admin/api/http/api-error";
import { handlePlanningCenterRoute } from "@worship-admin/api/http/planning-center-route";
import { logger } from "@worship-admin/api/logger";
import { getFutureBlockoutsForPerson } from "@worship-admin/api/use-cases/planning-center/get-person-blockouts";
import { presentBlockouts } from "@worship-admin/api/use-cases/planning-center/presentation";
import { z } from "zod";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string().min(1),
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
        "Invalid blockouts route params"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsedParams.error.issues
      );
    }
    const { id } = parsedParams.data;
    log.info({ personId: id }, "Fetching blockouts");
    const blockouts = await getFutureBlockoutsForPerson(id);

    log.info({ personId: id, count: blockouts.length }, "Blockouts fetched");
    return presentBlockouts(blockouts);
  });
};

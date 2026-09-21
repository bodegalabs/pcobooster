import { ApiError } from "@worship-admin/api/http/api-error";
import { handlePlanningCenterRoute } from "@worship-admin/api/http/planning-center-route";
import { logger } from "@worship-admin/api/logger";
import { reorderPlanItems } from "@worship-admin/api/use-cases/planning-center/reorder-plan-items";
import { reorderPlanItemsBodySchema } from "@worship-admin/api/use-cases/planning-center/schemas";

export const dynamic = "force-dynamic";

export const POST = async (request: Request) => {
  const log = logger.withRequest(request);
  return await handlePlanningCenterRoute(request, async () => {
    const body: unknown = await request.json();
    const parsed = reorderPlanItemsBodySchema.safeParse(body);

    if (!parsed.success) {
      log.warn(
        { issues: parsed.error.issues },
        "Invalid plan-item reorder body"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsed.error.issues
      );
    }

    await reorderPlanItems(
      parsed.data.service_type_id,
      parsed.data.plan_id,
      parsed.data.sequence
    );

    return { success: true };
  });
};

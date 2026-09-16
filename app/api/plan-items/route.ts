import { ApiError } from "@/lib/http/api-error";
import { handlePlanningCenterRoute } from "@/lib/http/planning-center-route";
import { logger } from "@/lib/logger";
import { serializePlanItem, serializePlanItems } from "@/lib/plan-item-client";
import { createPlanItem } from "@/lib/use-cases/planning-center/create-plan-item";
import { getPlanItems } from "@/lib/use-cases/planning-center/get-plan-items";
import {
  createPlanItemBodySchema,
  planItemsQuerySchema,
} from "@/lib/use-cases/planning-center/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const log = logger.withRequest(request);
  return handlePlanningCenterRoute(request, async () => {
    const { searchParams } = new URL(request.url);
    const parsed = planItemsQuerySchema.safeParse({
      service_type_id: searchParams.get("service_type_id") ?? undefined,
      plan_id: searchParams.get("plan_id") ?? undefined,
    });

    if (!parsed.success) {
      log.warn(
        { issues: parsed.error.issues },
        "Invalid plan-items query params"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsed.error.issues
      );
    }

    const items = await getPlanItems(
      parsed.data.service_type_id,
      parsed.data.plan_id
    );
    return serializePlanItems(items);
  });
}

export async function POST(request: Request) {
  const log = logger.withRequest(request);
  return handlePlanningCenterRoute(request, async () => {
    const body = await request.json();
    const parsed = createPlanItemBodySchema.safeParse(body);

    if (!parsed.success) {
      log.warn(
        { issues: parsed.error.issues },
        "Invalid plan-items create body"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsed.error.issues
      );
    }

    const item = await createPlanItem({
      serviceTypeId: parsed.data.service_type_id,
      planId: parsed.data.plan_id,
      title: parsed.data.title,
      itemType: parsed.data.item_type,
      servicePosition: parsed.data.service_position,
      length: parsed.data.length,
      description: parsed.data.description,
      htmlDetails: parsed.data.html_details,
      songId: parsed.data.song_id ?? undefined,
      arrangementId: parsed.data.arrangement_id ?? undefined,
      keyId: parsed.data.key_id ?? undefined,
      selectedLayoutId: parsed.data.selected_layout_id ?? undefined,
      customArrangementSequence: parsed.data.custom_arrangement_sequence,
    });

    return serializePlanItem(item);
  });
}

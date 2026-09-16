import { z } from "zod";

import { ApiError } from "@/lib/http/api-error";
import { handlePlanningCenterRoute } from "@/lib/http/planning-center-route";
import { logger } from "@/lib/logger";
import { serializePlanItem } from "@/lib/plan-item-client";
import { deletePlanItem } from "@/lib/use-cases/planning-center/delete-plan-item";
import {
  planItemsQuerySchema,
  updatePlanItemBodySchema,
} from "@/lib/use-cases/planning-center/schemas";
import { updatePlanItem } from "@/lib/use-cases/planning-center/update-plan-item";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string().min(1),
});

export const PATCH = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const log = logger.withRequest(request);
  return await handlePlanningCenterRoute(request, async () => {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      log.warn(
        { issues: parsedParams.error.issues },
        "Invalid plan-item route params"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsedParams.error.issues
      );
    }

    const body: unknown = await request.json();
    const parsedBody = updatePlanItemBodySchema.safeParse(body);
    if (!parsedBody.success) {
      log.warn(
        { issues: parsedBody.error.issues },
        "Invalid plan-item update body"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsedBody.error.issues
      );
    }

    const item = await updatePlanItem({
      serviceTypeId: parsedBody.data.service_type_id,
      planId: parsedBody.data.plan_id,
      itemId: parsedParams.data.id,
      title: parsedBody.data.title,
      servicePosition: parsedBody.data.service_position,
      length: parsedBody.data.length,
      description: parsedBody.data.description,
      htmlDetails: parsedBody.data.html_details,
      songId: parsedBody.data.song_id ?? undefined,
      arrangementId: parsedBody.data.arrangement_id ?? undefined,
      keyId: parsedBody.data.key_id ?? undefined,
      selectedLayoutId: parsedBody.data.selected_layout_id ?? undefined,
      customArrangementSequence: parsedBody.data.custom_arrangement_sequence,
    });

    return serializePlanItem(item);
  });
};

export const DELETE = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const log = logger.withRequest(request);
  return await handlePlanningCenterRoute(request, async () => {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      log.warn(
        { issues: parsedParams.error.issues },
        "Invalid plan-item route params"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsedParams.error.issues
      );
    }

    const { searchParams } = new URL(request.url);
    const parsedQuery = planItemsQuerySchema.safeParse({
      service_type_id: searchParams.get("service_type_id") ?? undefined,
      plan_id: searchParams.get("plan_id") ?? undefined,
    });
    if (!parsedQuery.success) {
      log.warn(
        { issues: parsedQuery.error.issues },
        "Invalid plan-item delete query params"
      );
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsedQuery.error.issues
      );
    }

    await deletePlanItem(
      parsedQuery.data.service_type_id,
      parsedQuery.data.plan_id,
      parsedParams.data.id
    );

    return { success: true };
  });
};

import { logger } from "@/lib/logger";
import { PlanningCenterCoreClient } from "@/lib/planning-center/core-client";
import { PlanningCenterReadCache } from "@/lib/planning-center/services/read-cache";
import type { PCResource } from "@/lib/types";

const log = logger.for("planning-center/plan-items");
const PLAN_ITEMS_CACHE_TTL_MS = 30 * 1000;

function buildItemPayload(attributes: Record<string, unknown>, id?: string) {
  return {
    data: {
      type: "Item",
      ...(id ? { id } : {}),
      attributes,
    },
  };
}

export class PlanningCenterPlanItemsService {
  private readonly cache = new PlanningCenterReadCache();

  constructor(private readonly core: PlanningCenterCoreClient) {}

  async getPlanItems(
    serviceTypeId: string,
    planId: string
  ): Promise<{ data: PCResource[]; included: PCResource[] }> {
    const response = await this.cache.get(
      this.buildPlanItemsCacheKey(serviceTypeId, planId),
      PLAN_ITEMS_CACHE_TTL_MS,
      async () => {
        const result = await this.core.fetchAllWithIncluded<PCResource>(
          `/services/v2/service_types/${serviceTypeId}/plans/${planId}/items`,
          {
            include: "song,arrangement,key,item_notes,item_times",
          }
        );

        log.info(
          { serviceTypeId, planId, itemCount: result.data.length },
          "Plan items fetched"
        );

        return result;
      }
    );

    return clonePlanItemsResponse(response);
  }

  async getPlanItem(
    serviceTypeId: string,
    planId: string,
    itemId: string
  ): Promise<{ data: PCResource; included: PCResource[] }> {
    const response = await this.core.fetch<PCResource>(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}/items/${itemId}?include=song,arrangement,key,item_notes,item_times`
    );

    return {
      data: response.data,
      included: response.included || [],
    };
  }

  async createPlanItem(
    serviceTypeId: string,
    planId: string,
    attributes: Record<string, unknown>
  ): Promise<{ data: PCResource; included: PCResource[] }> {
    const response = await this.core.fetch<PCResource>(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}/items?include=song,arrangement,key`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildItemPayload(attributes)),
      }
    );
    this.invalidatePlanItemsCache(serviceTypeId, planId);

    return {
      data: response.data,
      included: response.included || [],
    };
  }

  async updatePlanItem(
    serviceTypeId: string,
    planId: string,
    itemId: string,
    attributes: Record<string, unknown>
  ): Promise<{ data: PCResource; included: PCResource[] }> {
    const response = await this.core.fetch<PCResource>(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}/items/${itemId}?include=song,arrangement,key`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildItemPayload(attributes, itemId)),
      }
    );
    this.invalidatePlanItemsCache(serviceTypeId, planId);

    return {
      data: response.data,
      included: response.included || [],
    };
  }

  async deletePlanItem(
    serviceTypeId: string,
    planId: string,
    itemId: string
  ): Promise<void> {
    await this.core.request(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}/items/${itemId}`,
      {
        method: "DELETE",
      }
    );
    this.invalidatePlanItemsCache(serviceTypeId, planId);
  }

  async reorderPlanItems(
    serviceTypeId: string,
    planId: string,
    sequence: string[]
  ): Promise<void> {
    await this.core.request(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}/item_reorder`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: {
            type: "PlanItemReorder",
            attributes: {
              sequence,
            },
          },
        }),
      }
    );
    this.invalidatePlanItemsCache(serviceTypeId, planId);
  }

  private buildPlanItemsCacheKey(
    serviceTypeId: string,
    planId: string
  ): string {
    return [
      this.core.getCacheScope(),
      "plan-items",
      encodeURIComponent(serviceTypeId),
      encodeURIComponent(planId),
    ].join(":");
  }

  private invalidatePlanItemsCache(serviceTypeId: string, planId: string) {
    const cacheKey = this.buildPlanItemsCacheKey(serviceTypeId, planId);
    this.cache.deleteWhere((key) => key === cacheKey);
  }
}

function clonePlanItemsResponse(response: {
  data: PCResource[];
  included: PCResource[];
}): { data: PCResource[]; included: PCResource[] } {
  return {
    data: structuredClone(response.data),
    included: structuredClone(response.included),
  };
}

export const planningCenterPlanItemsService =
  new PlanningCenterPlanItemsService(new PlanningCenterCoreClient());

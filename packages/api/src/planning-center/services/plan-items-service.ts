import { logger } from "@worship-admin/api/logger";
import { PlanningCenterCoreClient } from "@worship-admin/api/planning-center/core-client";
import { PlanningCenterReadCache } from "@worship-admin/api/planning-center/services/read-cache";
import { isNonEmptyString } from "@worship-admin/planning-center-models/json";
import type { JsonObject } from "@worship-admin/planning-center-models/json";
import type { PCResource } from "@worship-admin/planning-center-models/types";

const log = logger.for("planning-center/plan-items");
const PLAN_ITEMS_CACHE_TTL_MS = 30 * 1000;

export interface PlanningCenterPlanItemsServiceCaches {
  readonly items: PlanningCenterReadCache<PlanItemsResponse>;
}

export const createPlanningCenterPlanItemsServiceCaches =
  (): PlanningCenterPlanItemsServiceCaches => ({
    items: new PlanningCenterReadCache<PlanItemsResponse>(),
  });

export const planningCenterPlanItemsServiceCaches =
  createPlanningCenterPlanItemsServiceCaches();

interface PlanItemsResponse {
  data: PCResource[];
  included: PCResource[];
}

const buildItemPayload = (attributes: JsonObject, id?: string) => ({
  data: {
    type: "Item",
    ...(isNonEmptyString(id) ? { id } : undefined),
    attributes,
  },
});

const clonePlanItemsResponse = (response: PlanItemsResponse) => ({
  data: structuredClone(response.data),
  included: structuredClone(response.included),
});

export class PlanningCenterPlanItemsService {
  private readonly core: PlanningCenterCoreClient;
  private readonly caches: PlanningCenterPlanItemsServiceCaches;

  constructor(
    core: PlanningCenterCoreClient,
    caches: PlanningCenterPlanItemsServiceCaches = createPlanningCenterPlanItemsServiceCaches()
  ) {
    this.core = core;
    this.caches = caches;
  }

  async getPlanItems(
    serviceTypeId: string,
    planId: string
  ): Promise<PlanItemsResponse> {
    const response = await this.caches.items.get(
      this.buildPlanItemsCacheKey(serviceTypeId, planId),
      PLAN_ITEMS_CACHE_TTL_MS,
      async () => {
        const result = await this.core.fetchAllWithIncluded(
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
    const response = await this.core.fetch(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}/items/${itemId}?include=song,arrangement,key,item_notes,item_times`
    );

    return {
      data: response.data,
      included: response.included ?? [],
    };
  }

  async createPlanItem(
    serviceTypeId: string,
    planId: string,
    attributes: JsonObject
  ): Promise<{ data: PCResource; included: PCResource[] }> {
    const response = await this.core.fetch(
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
      included: response.included ?? [],
    };
  }

  async updatePlanItem(
    serviceTypeId: string,
    planId: string,
    itemId: string,
    attributes: JsonObject
  ): Promise<{ data: PCResource; included: PCResource[] }> {
    const response = await this.core.fetch(
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
      included: response.included ?? [],
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
    this.caches.items.deleteWhere((key) => key === cacheKey);
  }
}

export const planningCenterPlanItemsService =
  new PlanningCenterPlanItemsService(
    new PlanningCenterCoreClient(),
    planningCenterPlanItemsServiceCaches
  );

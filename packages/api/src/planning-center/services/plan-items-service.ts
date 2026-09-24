import { logger } from "@pcobooster/api/logger";
import type {
  PlanningCenterCoreClient,
  PlanningCenterError,
} from "@pcobooster/api/planning-center/core-client";
import { cachedRead } from "@pcobooster/api/planning-center/services/cached-read";
import { PlanningCenterReadCache } from "@pcobooster/api/planning-center/services/read-cache";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type { JsonObject } from "@pcobooster/planning-center-models/json";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

const log = logger.for("planning-center/plan-items");
const PLAN_ITEMS_CACHE_TTL_MS = 30 * 1000;
const PLAN_ITEM_INCLUDES = "song,arrangement,key,item_notes,item_times";

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

interface PlanItemResponse {
  data: PCResource;
  included: PCResource[];
}

const buildItemPayload = (attributes: JsonObject, id?: string) => ({
  data: {
    type: "Item",
    ...(isNonEmptyString(id) ? { id } : undefined),
    attributes,
  },
});

const clonePlanItemsResponse = (
  response: PlanItemsResponse
): PlanItemsResponse => ({
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

  getPlanItems(
    serviceTypeId: string,
    planId: string
  ): Effect.Effect<PlanItemsResponse, PlanningCenterError> {
    const load = () =>
      this.core
        .fetchAllWithIncluded(
          `/services/v2/service_types/${serviceTypeId}/plans/${planId}/items`,
          { include: PLAN_ITEM_INCLUDES },
          5
        )
        .pipe(
          Effect.tap((result) =>
            Effect.sync(() => {
              log.info(
                { serviceTypeId, planId, itemCount: result.data.length },
                "Plan items fetched"
              );
            })
          )
        );
    return cachedRead(
      this.caches.items,
      this.buildPlanItemsCacheKey(serviceTypeId, planId),
      PLAN_ITEMS_CACHE_TTL_MS,
      load
    ).pipe(Effect.map(clonePlanItemsResponse));
  }

  getPlanItem(
    serviceTypeId: string,
    planId: string,
    itemId: string
  ): Effect.Effect<PlanItemResponse, PlanningCenterError> {
    return Effect.map(
      this.core.fetch(
        `/services/v2/service_types/${serviceTypeId}/plans/${planId}/items/${itemId}?include=${PLAN_ITEM_INCLUDES}`
      ),
      (response) => ({
        data: response.data,
        included: response.included ?? [],
      })
    );
  }

  createPlanItem(
    serviceTypeId: string,
    planId: string,
    attributes: JsonObject
  ): Effect.Effect<PlanItemResponse, PlanningCenterError> {
    return this.core
      .fetch(
        `/services/v2/service_types/${serviceTypeId}/plans/${planId}/items?include=song,arrangement,key`,
        { method: "POST", body: buildItemPayload(attributes) }
      )
      .pipe(
        Effect.map((response) => {
          this.invalidatePlanItemsCache(serviceTypeId, planId);
          return { data: response.data, included: response.included ?? [] };
        })
      );
  }

  updatePlanItem(
    serviceTypeId: string,
    planId: string,
    itemId: string,
    attributes: JsonObject
  ): Effect.Effect<PlanItemResponse, PlanningCenterError> {
    return this.core
      .fetch(
        `/services/v2/service_types/${serviceTypeId}/plans/${planId}/items/${itemId}?include=song,arrangement,key`,
        { method: "PATCH", body: buildItemPayload(attributes, itemId) }
      )
      .pipe(
        Effect.map((response) => {
          this.invalidatePlanItemsCache(serviceTypeId, planId);
          return { data: response.data, included: response.included ?? [] };
        })
      );
  }

  deletePlanItem(
    serviceTypeId: string,
    planId: string,
    itemId: string
  ): Effect.Effect<void, PlanningCenterError> {
    return this.core
      .request(
        `/services/v2/service_types/${serviceTypeId}/plans/${planId}/items/${itemId}`,
        { method: "DELETE" }
      )
      .pipe(
        Effect.asVoid,
        Effect.tap(() =>
          Effect.sync(() => {
            this.invalidatePlanItemsCache(serviceTypeId, planId);
          })
        )
      );
  }

  reorderPlanItems(
    serviceTypeId: string,
    planId: string,
    sequence: string[]
  ): Effect.Effect<void, PlanningCenterError> {
    return this.core
      .request(
        `/services/v2/service_types/${serviceTypeId}/plans/${planId}/item_reorder`,
        {
          method: "POST",
          body: {
            data: {
              type: "PlanItemReorder",
              attributes: { sequence },
            },
          },
        }
      )
      .pipe(
        Effect.asVoid,
        Effect.tap(() =>
          Effect.sync(() => {
            this.invalidatePlanItemsCache(serviceTypeId, planId);
          })
        )
      );
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

import { logger } from "@worship-admin/api/logger";
import type { PlanningCenterCoreClient } from "@worship-admin/api/planning-center/core-client";
import { PlanningCenterReadCache } from "@worship-admin/api/planning-center/services/read-cache";
import { isNonEmptyString } from "@worship-admin/planning-center-models/json";
import type { PCResource } from "@worship-admin/planning-center-models/types";

const log = logger.for("planning-center/catalog");
const TEAM_POSITIONS_CACHE_TTL_MS = 5 * 60 * 1000;
const NEEDED_POSITIONS_CACHE_TTL_MS = 60 * 1000;

export interface PlanningCenterCatalogServiceCaches {
  readonly serviceTypes: PlanningCenterReadCache<PCResource[]>;
  readonly reads: PlanningCenterReadCache<{
    data: PCResource[];
    included: PCResource[];
  }>;
}

export const createPlanningCenterCatalogServiceCaches =
  (): PlanningCenterCatalogServiceCaches => ({
    serviceTypes: new PlanningCenterReadCache<PCResource[]>(),
    reads: new PlanningCenterReadCache<{
      data: PCResource[];
      included: PCResource[];
    }>(),
  });

export const planningCenterCatalogServiceCaches =
  createPlanningCenterCatalogServiceCaches();

const cloneResourceResponse = (response: {
  data: PCResource[];
  included: PCResource[];
}) => ({
  data: structuredClone(response.data),
  included: structuredClone(response.included),
});

export class PlanningCenterCatalogService {
  private readonly core: PlanningCenterCoreClient;
  private readonly caches: PlanningCenterCatalogServiceCaches;

  constructor(
    core: PlanningCenterCoreClient,
    caches: PlanningCenterCatalogServiceCaches = createPlanningCenterCatalogServiceCaches()
  ) {
    this.core = core;
    this.caches = caches;
  }

  async getTeam(teamId: string, signal?: AbortSignal): Promise<PCResource> {
    const response = await this.core.fetch(`/services/v2/teams/${teamId}`, {
      signal,
    });
    return response.data;
  }

  /** Root Services `Organization` (account settings include `time_zone`). */
  async getOrganization(signal?: AbortSignal): Promise<PCResource> {
    const response = await this.core.fetchCollection("/services/v2", {
      signal,
    });
    const [first] = response.data;
    if (first === undefined) {
      throw new Error(
        "Planning Center Services organization response was empty"
      );
    }
    return first;
  }

  async getServiceTypes(
    params: Record<string, string> = {},
    signal?: AbortSignal
  ): Promise<PCResource[]> {
    return await this.core.fetchAll(
      "/services/v2/service_types",
      params,
      10,
      signal
    );
  }

  async getServiceTypesCached(
    ttlMs: number = 5 * 60 * 1000,
    signal?: AbortSignal
  ): Promise<PCResource[]> {
    const serviceTypes = await this.caches.serviceTypes.get(
      `${this.core.getCacheScope()}:service-types`,
      ttlMs,
      async (loadSignal) => await this.getServiceTypes({}, loadSignal),
      signal
    );
    return structuredClone(serviceTypes);
  }

  async getServiceTypeTeamPositionsWithTeams(
    serviceTypeId: string,
    signal?: AbortSignal
  ): Promise<{ data: PCResource[]; included: PCResource[] }> {
    const response = await this.caches.reads.get(
      this.buildCacheKey("service-type-team-positions", serviceTypeId),
      TEAM_POSITIONS_CACHE_TTL_MS,
      async (loadSignal) => {
        const result = await this.core.fetchCollection(
          `/services/v2/service_types/${serviceTypeId}/team_positions?include=team&per_page=100`,
          { signal: loadSignal }
        );

        const { data } = result;
        log.info(
          { serviceTypeId, positionCount: data.length },
          "Team positions fetched"
        );

        return {
          data,
          included: result.included ?? [],
        };
      },
      signal
    );

    return cloneResourceResponse(response);
  }

  async getPlanNeededPositionsWithTeams(
    seriesId: string,
    planId: string,
    signal?: AbortSignal
  ): Promise<{ data: PCResource[]; included: PCResource[] }> {
    const response = await this.caches.reads.get(
      this.buildCacheKey("series-plan-needed-positions", seriesId, planId),
      NEEDED_POSITIONS_CACHE_TTL_MS,
      async (loadSignal) => {
        const result = await this.core.fetchAllWithIncluded(
          `/services/v2/series/${seriesId}/plans/${planId}/needed_positions`,
          { include: "team" },
          5,
          loadSignal
        );

        log.info(
          { seriesId, planId, neededPositionCount: result.data.length },
          "Plan needed positions fetched"
        );

        return result;
      },
      signal
    );

    return cloneResourceResponse(response);
  }

  async getServiceTypePlanNeededPositionsWithTeams(
    serviceTypeId: string,
    planId: string,
    signal?: AbortSignal
  ): Promise<{ data: PCResource[]; included: PCResource[] }> {
    const response = await this.caches.reads.get(
      this.buildCacheKey(
        "service-type-plan-needed-positions",
        serviceTypeId,
        planId
      ),
      NEEDED_POSITIONS_CACHE_TTL_MS,
      async (loadSignal) => {
        const result = await this.core.fetchAllWithIncluded(
          `/services/v2/service_types/${serviceTypeId}/plans/${planId}/needed_positions`,
          { include: "team" },
          5,
          loadSignal
        );

        log.info(
          { serviceTypeId, planId, neededPositionCount: result.data.length },
          "Service type plan needed positions fetched"
        );

        return result;
      },
      signal
    );

    return cloneResourceResponse(response);
  }

  async updateServiceTypePlanNeededPositionTime(
    serviceTypeId: string,
    planId: string,
    neededPositionId: string,
    planTimeId: string | null
  ): Promise<PCResource> {
    const response = await this.core.fetch(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}/needed_positions/${neededPositionId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: {
            type: "NeededPosition",
            id: neededPositionId,
            relationships: {
              time: {
                data: isNonEmptyString(planTimeId)
                  ? { type: "PlanTime", id: planTimeId }
                  : null,
              },
            },
          },
        }),
      }
    );
    this.invalidateNeededPositionsCache(serviceTypeId, planId);
    return response.data;
  }

  invalidateNeededPositionsCache(serviceTypeId: string, planId: string) {
    const scope = this.core.getCacheScope();
    const serviceTypePrefix = [
      scope,
      "service-type-plan-needed-positions",
      encodeURIComponent(serviceTypeId),
      encodeURIComponent(planId),
    ].join(":");
    const seriesPrefix = [scope, "series-plan-needed-positions"].join(":");

    this.caches.reads.deleteWhere(
      (key) => key.startsWith(serviceTypePrefix) || key.startsWith(seriesPrefix)
    );
  }

  private buildCacheKey(namespace: string, ...parts: string[]): string {
    return [
      this.core.getCacheScope(),
      namespace,
      ...parts.map((part) => encodeURIComponent(part)),
    ].join(":");
  }
}

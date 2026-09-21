import { isNonEmptyString } from "@worship-admin/api/json";
import { logger } from "@worship-admin/api/logger";
import { PlanningCenterCoreClient } from "@worship-admin/api/planning-center/core-client";
import { PlanningCenterReadCache } from "@worship-admin/api/planning-center/services/read-cache";
import type { PCResource } from "@worship-admin/api/types";

const log = logger.for("planning-center/catalog");
const TEAM_POSITIONS_CACHE_TTL_MS = 5 * 60 * 1000;
const NEEDED_POSITIONS_CACHE_TTL_MS = 60 * 1000;

const cloneResourceResponse = (response: {
  data: PCResource[];
  included: PCResource[];
}) => ({
  data: structuredClone(response.data),
  included: structuredClone(response.included),
});

export class PlanningCenterCatalogService {
  private readonly core: PlanningCenterCoreClient;
  private serviceTypesCache: { expiresAt: number; data: PCResource[] } | null =
    null;
  private readonly cache = new PlanningCenterReadCache<{
    data: PCResource[];
    included: PCResource[];
  }>();

  constructor(core: PlanningCenterCoreClient) {
    this.core = core;
  }

  async getTeam(teamId: string): Promise<PCResource> {
    const response = await this.core.fetch(`/services/v2/teams/${teamId}`);
    return response.data;
  }

  /** Root Services `Organization` (account settings include `time_zone`). */
  async getOrganization(): Promise<PCResource> {
    const response = await this.core.fetchCollection("/services/v2");
    const [first] = response.data;
    if (first === undefined) {
      throw new Error(
        "Planning Center Services organization response was empty"
      );
    }
    return first;
  }

  async getServiceTypes(
    params: Record<string, string> = {}
  ): Promise<PCResource[]> {
    return await this.core.fetchAll("/services/v2/service_types", params);
  }

  async getServiceTypesCached(
    ttlMs: number = 5 * 60 * 1000
  ): Promise<PCResource[]> {
    const now = Date.now();
    if (this.serviceTypesCache && this.serviceTypesCache.expiresAt > now) {
      return structuredClone(this.serviceTypesCache.data);
    }

    const data = await this.getServiceTypes();
    this.serviceTypesCache = {
      expiresAt: now + ttlMs,
      data,
    };
    return structuredClone(data);
  }

  async getServiceTypeTeamPositionsWithTeams(
    serviceTypeId: string
  ): Promise<{ data: PCResource[]; included: PCResource[] }> {
    const response = await this.cache.get(
      this.buildCacheKey("service-type-team-positions", serviceTypeId),
      TEAM_POSITIONS_CACHE_TTL_MS,
      async () => {
        const result = await this.core.fetchCollection(
          `/services/v2/service_types/${serviceTypeId}/team_positions?include=team&per_page=100`
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
      }
    );

    return cloneResourceResponse(response);
  }

  async getPlanNeededPositionsWithTeams(
    seriesId: string,
    planId: string
  ): Promise<{ data: PCResource[]; included: PCResource[] }> {
    const response = await this.cache.get(
      this.buildCacheKey("series-plan-needed-positions", seriesId, planId),
      NEEDED_POSITIONS_CACHE_TTL_MS,
      async () => {
        const result = await this.core.fetchAllWithIncluded(
          `/services/v2/series/${seriesId}/plans/${planId}/needed_positions`,
          { include: "team" }
        );

        log.info(
          { seriesId, planId, neededPositionCount: result.data.length },
          "Plan needed positions fetched"
        );

        return result;
      }
    );

    return cloneResourceResponse(response);
  }

  async getServiceTypePlanNeededPositionsWithTeams(
    serviceTypeId: string,
    planId: string
  ): Promise<{ data: PCResource[]; included: PCResource[] }> {
    const response = await this.cache.get(
      this.buildCacheKey(
        "service-type-plan-needed-positions",
        serviceTypeId,
        planId
      ),
      NEEDED_POSITIONS_CACHE_TTL_MS,
      async () => {
        const result = await this.core.fetchAllWithIncluded(
          `/services/v2/service_types/${serviceTypeId}/plans/${planId}/needed_positions`,
          { include: "team" }
        );

        log.info(
          { serviceTypeId, planId, neededPositionCount: result.data.length },
          "Service type plan needed positions fetched"
        );

        return result;
      }
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

    this.cache.deleteWhere(
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

export const planningCenterCatalogService = new PlanningCenterCatalogService(
  new PlanningCenterCoreClient()
);

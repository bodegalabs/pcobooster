import { logger } from "@pcobooster/api/logger";
import type {
  PlanningCenterCoreClient,
  PlanningCenterError,
} from "@pcobooster/api/planning-center/core-client";
import { cachedRead } from "@pcobooster/api/planning-center/services/cached-read";
import { PlanningCenterReadCache } from "@pcobooster/api/planning-center/services/read-cache";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

const log = logger.for("planning-center/catalog");
const SERVICE_TYPES_CACHE_TTL_MS = 5 * 60 * 1000;
const TEAM_POSITIONS_CACHE_TTL_MS = 5 * 60 * 1000;
const NEEDED_POSITIONS_CACHE_TTL_MS = 60 * 1000;

interface ResourceCollection {
  data: PCResource[];
  included: PCResource[];
}

export interface PlanningCenterCatalogServiceCaches {
  readonly serviceTypes: PlanningCenterReadCache<PCResource[]>;
  readonly reads: PlanningCenterReadCache<ResourceCollection>;
}

export const createPlanningCenterCatalogServiceCaches =
  (): PlanningCenterCatalogServiceCaches => ({
    serviceTypes: new PlanningCenterReadCache<PCResource[]>(),
    reads: new PlanningCenterReadCache<ResourceCollection>(),
  });

export const planningCenterCatalogServiceCaches =
  createPlanningCenterCatalogServiceCaches();

const cloneResourceResponse = (
  response: ResourceCollection
): ResourceCollection => ({
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

  getTeam(teamId: string): Effect.Effect<PCResource, PlanningCenterError> {
    return Effect.map(
      this.core.fetch(`/services/v2/teams/${teamId}`),
      (response) => response.data
    );
  }

  /** Root Services `Organization` (account settings include `time_zone`). */
  getOrganization(): Effect.Effect<PCResource, PlanningCenterError> {
    return Effect.flatMap(
      this.core.fetchCollection("/services/v2"),
      (response) => {
        const [first] = response.data;
        return first === undefined
          ? Effect.die(
              new Error(
                "Planning Center Services organization response was empty"
              )
            )
          : Effect.succeed(first);
      }
    );
  }

  getServiceTypes(
    params: Record<string, string> = {}
  ): Effect.Effect<PCResource[], PlanningCenterError> {
    return this.core.fetchAll("/services/v2/service_types", params, 10);
  }

  getServiceTypesCached(
    ttlMs: number = SERVICE_TYPES_CACHE_TTL_MS
  ): Effect.Effect<PCResource[], PlanningCenterError> {
    return cachedRead(
      this.caches.serviceTypes,
      `${this.core.getCacheScope()}:service-types`,
      ttlMs,
      () => this.getServiceTypes({})
    ).pipe(Effect.map((serviceTypes) => structuredClone(serviceTypes)));
  }

  getServiceTypeTeamPositionsWithTeams(
    serviceTypeId: string
  ): Effect.Effect<ResourceCollection, PlanningCenterError> {
    const load = () =>
      this.core
        .fetchCollection(
          `/services/v2/service_types/${serviceTypeId}/team_positions?include=team&per_page=100`
        )
        .pipe(
          Effect.map((result) => {
            log.info(
              { serviceTypeId, positionCount: result.data.length },
              "Team positions fetched"
            );
            return { data: result.data, included: result.included ?? [] };
          })
        );
    return cachedRead(
      this.caches.reads,
      this.buildCacheKey("service-type-team-positions", serviceTypeId),
      TEAM_POSITIONS_CACHE_TTL_MS,
      load
    ).pipe(Effect.map(cloneResourceResponse));
  }

  getPlanNeededPositionsWithTeams(
    seriesId: string,
    planId: string
  ): Effect.Effect<ResourceCollection, PlanningCenterError> {
    const load = () =>
      this.core
        .fetchAllWithIncluded(
          `/services/v2/series/${seriesId}/plans/${planId}/needed_positions`,
          { include: "team" },
          5
        )
        .pipe(
          Effect.tap((result) =>
            Effect.sync(() => {
              log.info(
                { seriesId, planId, neededPositionCount: result.data.length },
                "Plan needed positions fetched"
              );
            })
          )
        );
    return cachedRead(
      this.caches.reads,
      this.buildCacheKey("series-plan-needed-positions", seriesId, planId),
      NEEDED_POSITIONS_CACHE_TTL_MS,
      load
    ).pipe(Effect.map(cloneResourceResponse));
  }

  getServiceTypePlanNeededPositionsWithTeams(
    serviceTypeId: string,
    planId: string
  ): Effect.Effect<ResourceCollection, PlanningCenterError> {
    const load = () =>
      this.core
        .fetchAllWithIncluded(
          `/services/v2/service_types/${serviceTypeId}/plans/${planId}/needed_positions`,
          { include: "team" },
          5
        )
        .pipe(
          Effect.tap((result) =>
            Effect.sync(() => {
              log.info(
                {
                  serviceTypeId,
                  planId,
                  neededPositionCount: result.data.length,
                },
                "Service type plan needed positions fetched"
              );
            })
          )
        );
    return cachedRead(
      this.caches.reads,
      this.buildCacheKey(
        "service-type-plan-needed-positions",
        serviceTypeId,
        planId
      ),
      NEEDED_POSITIONS_CACHE_TTL_MS,
      load
    ).pipe(Effect.map(cloneResourceResponse));
  }

  updateServiceTypePlanNeededPositionTime(
    serviceTypeId: string,
    planId: string,
    neededPositionId: string,
    planTimeId: string | null
  ): Effect.Effect<PCResource, PlanningCenterError> {
    return this.core
      .fetch(
        `/services/v2/service_types/${serviceTypeId}/plans/${planId}/needed_positions/${neededPositionId}`,
        {
          method: "PATCH",
          body: {
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
          },
        }
      )
      .pipe(
        Effect.map((response) => {
          this.invalidateNeededPositionsCache(serviceTypeId, planId);
          return response.data;
        })
      );
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

import { logger } from "@pcobooster/api/logger";
import { PlanningCenterApiError } from "@pcobooster/api/planning-center/api-error";
import type { PlanningCenterCoreClient } from "@pcobooster/api/planning-center/core-client";
import { resolveOrganizationTimeZone } from "@pcobooster/api/planning-center/resolve-organization-timezone";
import { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import {
  PlanningCenterReadCache,
  stableParams,
} from "@pcobooster/api/planning-center/services/read-cache";
import { formatCalendarDayInTimeZone } from "@pcobooster/planning-center-models/calendar";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type { JsonObject } from "@pcobooster/planning-center-models/json";
import type { PCResource } from "@pcobooster/planning-center-models/types";

const log = logger.for("planning-center/plans");
const PLANS_RANGE_CACHE_TTL_MS = 5 * 60 * 1000;

export interface PlanningCenterPlansServiceCaches {
  readonly ranges: PlanningCenterReadCache<{
    data: PCResource[];
    included: PCResource[];
  }>;
  readonly planTimes: PlanningCenterReadCache<PCResource[]>;
}

export const createPlanningCenterPlansServiceCaches =
  (): PlanningCenterPlansServiceCaches => ({
    ranges: new PlanningCenterReadCache<{
      data: PCResource[];
      included: PCResource[];
    }>(),
    planTimes: new PlanningCenterReadCache<PCResource[]>(),
  });

export const planningCenterPlansServiceCaches =
  createPlanningCenterPlansServiceCaches();

const cloneResourceResponse = (response: {
  data: PCResource[];
  included: PCResource[];
}) => ({
  data: structuredClone(response.data),
  included: structuredClone(response.included),
});

const buildPlanTimeAssignmentRelationships = (
  assignedTeamIds?: string[],
  assignedPositionIds?: string[]
) => {
  const relationships = {
    ...(assignedTeamIds === undefined
      ? undefined
      : {
          assigned_teams: {
            data: assignedTeamIds.map((id) => ({ type: "Team", id })),
          },
        }),
    ...(assignedPositionIds === undefined
      ? undefined
      : {
          assigned_positions: {
            data: assignedPositionIds.map((id) => ({
              type: "TeamPosition",
              id,
            })),
          },
        }),
  };
  return Object.keys(relationships).length > 0 ? relationships : null;
};

export class PlanningCenterPlansService {
  private readonly core: PlanningCenterCoreClient;
  private readonly resolveTimeZone: (signal?: AbortSignal) => Promise<string>;
  private readonly caches: PlanningCenterPlansServiceCaches;

  constructor(
    core: PlanningCenterCoreClient,
    resolveTimeZone: (signal?: AbortSignal) => Promise<string> = async (
      signal
    ) =>
      await resolveOrganizationTimeZone({
        catalogService: new PlanningCenterCatalogService(core),
        cacheScope: core.getCacheScope(),
        signal,
      }),
    caches: PlanningCenterPlansServiceCaches = createPlanningCenterPlansServiceCaches()
  ) {
    this.core = core;
    this.resolveTimeZone = resolveTimeZone;
    this.caches = caches;
  }

  async getPlans(
    serviceTypeId: string,
    params: Record<string, string> = {},
    signal?: AbortSignal
  ): Promise<PCResource[]> {
    return await this.core.fetchAll(
      `/services/v2/service_types/${serviceTypeId}/plans`,
      { ...params, order: "-sort_date" },
      3,
      signal
    );
  }

  /**
   * Fetch plans from `afterDayKey` onward (YYYY-MM-DD in org TZ) via filter=after.
   * Trims to plans whose sort_date falls on [`afterDayKey`, `beforeDayKey`] in the org timezone.
   */
  async getPlansInDateRange(
    serviceTypeId: string,
    afterDayKey: string,
    beforeDayKey: string,
    organizationTimeZone?: string,
    signal?: AbortSignal
  ): Promise<PCResource[]> {
    const response = await this.getPlansWithIncludedInDateRange(
      serviceTypeId,
      afterDayKey,
      beforeDayKey,
      "",
      organizationTimeZone,
      signal
    );
    return response.data;
  }

  async getPlansWithIncludedInDateRange(
    serviceTypeId: string,
    afterDayKey: string,
    beforeDayKey: string,
    include = "",
    organizationTimeZone?: string,
    signal?: AbortSignal
  ): Promise<{ data: PCResource[]; included: PCResource[] }> {
    const orgTz = organizationTimeZone ?? (await this.resolveTimeZone(signal));
    const params = {
      order: "sort_date",
      per_page: "100",
      filter: "after",
      after: afterDayKey,
      ...(include ? { include } : undefined),
    };
    const cacheKey = [
      this.core.getCacheScope(),
      "plans-range",
      encodeURIComponent(serviceTypeId),
      encodeURIComponent(afterDayKey),
      encodeURIComponent(beforeDayKey),
      stableParams(params),
    ].join(":");

    const response = await this.caches.ranges.get(
      cacheKey,
      PLANS_RANGE_CACHE_TTL_MS,
      async (loadSignal) => {
        log.info(
          {
            serviceTypeId,
            after: afterDayKey,
            before: beforeDayKey,
            include: include || null,
          },
          "Fetching plans in date range"
        );

        const fetched = await this.core.fetchAllWithIncluded(
          `/services/v2/service_types/${serviceTypeId}/plans`,
          params,
          3,
          loadSignal
        );

        const plans = fetched.data.filter((plan) => {
          const sortDateStr = plan.attributes.sort_date;
          if (!isNonEmptyString(sortDateStr)) {
            return false;
          }
          const sortDate = new Date(sortDateStr);
          if (Number.isNaN(sortDate.getTime())) {
            return false;
          }
          const planDay = formatCalendarDayInTimeZone(sortDate, orgTz);
          return planDay >= afterDayKey && planDay <= beforeDayKey;
        });

        const planIds = new Set(plans.map((plan) => plan.id));
        const included = fetched.included.filter((resource) => {
          const planRel = resource.relationships?.plan?.data;
          const planId = Array.isArray(planRel) ? planRel[0]?.id : planRel?.id;
          return !isNonEmptyString(planId) || planIds.has(planId);
        });

        log.info(
          {
            serviceTypeId,
            count: plans.length,
            rawCount: fetched.data.length,
            includedCount: included.length,
          },
          "Plans fetched"
        );
        return { data: plans, included };
      },
      signal
    );

    return cloneResourceResponse(response);
  }

  async getPlan(planId: string, signal?: AbortSignal): Promise<PCResource> {
    const response = await this.core.fetch(`/services/v2/plans/${planId}`, {
      signal,
    });
    return response.data;
  }

  async getPlanTimes(
    serviceTypeId: string,
    planId: string,
    signal?: AbortSignal
  ): Promise<PCResource[]> {
    const planTimes = await this.caches.planTimes.get(
      this.buildCacheKey("plan-times", serviceTypeId, planId),
      PLANS_RANGE_CACHE_TTL_MS,
      async (loadSignal) =>
        await this.core.fetchAll(
          `/services/v2/service_types/${serviceTypeId}/plans/${planId}/plan_times`,
          {
            order: "starts_at",
            per_page: "200",
            include: "split_team_rehearsal_assignments",
          },
          10,
          loadSignal
        ),
      signal
    );
    return structuredClone(planTimes);
  }

  async updatePlanTime(
    serviceTypeId: string,
    planId: string,
    planTimeId: string,
    attributes: JsonObject,
    assignedTeamIds?: string[],
    assignedPositionIds?: string[]
  ): Promise<PCResource> {
    const relationships = buildPlanTimeAssignmentRelationships(
      assignedTeamIds,
      assignedPositionIds
    );

    const response = await this.core.fetch(
      `/services/v2/service_types/${serviceTypeId}/plan_times/${planTimeId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: {
            type: "PlanTime",
            id: planTimeId,
            attributes,
            ...(relationships ? { relationships } : undefined),
          },
        }),
      }
    );
    this.invalidatePlanTimesCache(serviceTypeId, planId);
    return response.data;
  }

  async createPlanTime(
    serviceTypeId: string,
    planId: string,
    attributes: JsonObject,
    assignedTeamIds?: string[],
    assignedPositionIds?: string[]
  ): Promise<PCResource> {
    const relationships = buildPlanTimeAssignmentRelationships(
      assignedTeamIds,
      assignedPositionIds
    );
    const response = await this.core.fetch(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}/plan_times`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: {
            type: "PlanTime",
            attributes,
            ...(relationships ? { relationships } : undefined),
          },
        }),
      }
    );
    this.invalidatePlanTimesCache(serviceTypeId, planId);
    return response.data;
  }

  async deletePlanTime(
    serviceTypeId: string,
    planId: string,
    planTimeId: string
  ): Promise<void> {
    try {
      await this.core.request(
        `/services/v2/service_types/${serviceTypeId}/plan_times/${planTimeId}`,
        {
          method: "DELETE",
        }
      );
    } catch (error) {
      if (!(error instanceof PlanningCenterApiError && error.status === 404)) {
        throw error;
      }
    }
    this.invalidatePlanTimesCache(serviceTypeId, planId);
  }

  async getPlanForServiceTypeWithSeries(
    serviceTypeId: string,
    planId: string,
    signal?: AbortSignal
  ): Promise<{ data: PCResource; included: PCResource[] }> {
    const response = await this.core.fetch(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}?include=series`,
      { signal }
    );
    return {
      data: response.data,
      included: response.included ?? [],
    };
  }

  invalidatePlanTimesCache(serviceTypeId: string, planId: string) {
    const scope = this.core.getCacheScope();
    const planTimesKey = this.buildCacheKey(
      "plan-times",
      serviceTypeId,
      planId
    );
    const plansRangePrefix = [
      scope,
      "plans-range",
      encodeURIComponent(serviceTypeId),
      "",
    ].join(":");

    this.caches.planTimes.deleteWhere((key) => key === planTimesKey);
    this.caches.ranges.deleteWhere((key) => key.startsWith(plansRangePrefix));
  }

  private buildCacheKey(namespace: string, ...parts: string[]): string {
    return [
      this.core.getCacheScope(),
      namespace,
      ...parts.map((part) => encodeURIComponent(part)),
    ].join(":");
  }
}

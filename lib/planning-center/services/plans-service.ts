import { logger } from "@/lib/logger";
import { PlanningCenterCoreClient } from "@/lib/planning-center/core-client";
import { formatCalendarDayInTimeZone } from "@/lib/planning-center/org-calendar";
import { resolveOrganizationTimeZone } from "@/lib/planning-center/resolve-organization-timezone";
import {
  PlanningCenterReadCache,
  stableParams,
} from "@/lib/planning-center/services/read-cache";
import type { PCResource } from "@/lib/types";

const log = logger.for("planning-center/plans");
const PLANS_RANGE_CACHE_TTL_MS = 5 * 60 * 1000;

export class PlanningCenterPlansService {
  private readonly cache = new PlanningCenterReadCache();

  constructor(private readonly core: PlanningCenterCoreClient) {}

  async getPlans(
    serviceTypeId: string,
    params: Record<string, string> = {}
  ): Promise<PCResource[]> {
    return this.core.fetchAll<PCResource>(
      `/services/v2/service_types/${serviceTypeId}/plans`,
      { ...params, order: "-sort_date" },
      3
    );
  }

  /**
   * Fetch plans from `afterDayKey` onward (YYYY-MM-DD in org TZ) via filter=after.
   * Trims to plans whose sort_date falls on [`afterDayKey`, `beforeDayKey`] in the org timezone.
   */
  async getPlansInDateRange(
    serviceTypeId: string,
    afterDayKey: string,
    beforeDayKey: string
  ): Promise<PCResource[]> {
    const response = await this.getPlansWithIncludedInDateRange(
      serviceTypeId,
      afterDayKey,
      beforeDayKey
    );
    return response.data;
  }

  async getPlansWithIncludedInDateRange(
    serviceTypeId: string,
    afterDayKey: string,
    beforeDayKey: string,
    include: string = ""
  ): Promise<{ data: PCResource[]; included: PCResource[] }> {
    const orgTz = await resolveOrganizationTimeZone();
    const params = {
      order: "sort_date",
      per_page: "100",
      filter: "after",
      after: afterDayKey,
      ...(include ? { include } : {}),
    };
    const cacheKey = [
      this.core.getCacheScope(),
      "plans-range",
      encodeURIComponent(serviceTypeId),
      encodeURIComponent(afterDayKey),
      encodeURIComponent(beforeDayKey),
      stableParams(params),
    ].join(":");

    const response = await this.cache.get(
      cacheKey,
      PLANS_RANGE_CACHE_TTL_MS,
      async () => {
        log.info(
          {
            serviceTypeId,
            after: afterDayKey,
            before: beforeDayKey,
            include: include || null,
          },
          "Fetching plans in date range"
        );

        const response = await this.core.fetchAllWithIncluded<PCResource>(
          `/services/v2/service_types/${serviceTypeId}/plans`,
          params,
          3
        );

        const plans = response.data.filter((plan) => {
          const sortDateStr = plan.attributes.sort_date as string | undefined;
          if (!sortDateStr) return false;
          const sortDate = new Date(sortDateStr);
          if (Number.isNaN(sortDate.getTime())) return false;
          const planDay = formatCalendarDayInTimeZone(sortDate, orgTz);
          return planDay >= afterDayKey && planDay <= beforeDayKey;
        });

        const planIds = new Set(plans.map((plan) => plan.id));
        const included = response.included.filter((resource) => {
          const planRel = resource.relationships?.plan?.data;
          const planId = Array.isArray(planRel) ? planRel[0]?.id : planRel?.id;
          return !planId || planIds.has(planId);
        });

        log.info(
          {
            serviceTypeId,
            count: plans.length,
            rawCount: response.data.length,
            includedCount: included.length,
          },
          "Plans fetched"
        );
        return { data: plans, included };
      }
    );

    return cloneResourceResponse(response);
  }

  async getPlan(planId: string): Promise<PCResource> {
    const response = await this.core.fetch<PCResource>(
      `/services/v2/plans/${planId}`
    );
    return response.data;
  }

  async getPlanTimes(planId: string): Promise<PCResource[]> {
    const planTimes = await this.cache.get(
      this.buildCacheKey("plan-times", planId),
      PLANS_RANGE_CACHE_TTL_MS,
      async () => {
        return this.core.fetchAll<PCResource>(
          `/services/v2/plans/${planId}/plan_times`,
          {
            order: "starts_at",
            per_page: "200",
            include: "split_team_rehearsal_assignments",
          }
        );
      }
    );
    return structuredClone(planTimes);
  }

  async updatePlanTime(
    serviceTypeId: string,
    planId: string,
    planTimeId: string,
    attributes: Record<string, unknown>,
    assignedTeamIds?: string[],
    assignedPositionIds?: string[]
  ): Promise<PCResource> {
    const relationships = this.buildPlanTimeAssignmentRelationships(
      assignedTeamIds,
      assignedPositionIds
    );

    const response = await this.core.fetch<PCResource>(
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
            ...(relationships ? { relationships } : {}),
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
    attributes: Record<string, unknown>,
    assignedTeamIds?: string[],
    assignedPositionIds?: string[]
  ): Promise<PCResource> {
    const relationships = this.buildPlanTimeAssignmentRelationships(
      assignedTeamIds,
      assignedPositionIds
    );
    const response = await this.core.fetch<PCResource>(
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
            ...(relationships ? { relationships } : {}),
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
    await this.core.fetch<PCResource>(
      `/services/v2/service_types/${serviceTypeId}/plan_times/${planTimeId}`,
      {
        method: "DELETE",
      }
    );
    this.invalidatePlanTimesCache(serviceTypeId, planId);
  }

  async getPlanForServiceTypeWithSeries(
    serviceTypeId: string,
    planId: string
  ): Promise<{ data: PCResource; included: PCResource[] }> {
    const response = await this.core.fetch<PCResource>(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}?include=series`
    );
    return {
      data: response.data,
      included: response.included || [],
    };
  }

  invalidatePlanTimesCache(serviceTypeId: string, planId: string) {
    const scope = this.core.getCacheScope();
    const planTimesKey = this.buildCacheKey("plan-times", planId);
    const plansRangePrefix = [
      scope,
      "plans-range",
      encodeURIComponent(serviceTypeId),
      "",
    ].join(":");

    this.cache.deleteWhere(
      (key) => key === planTimesKey || key.startsWith(plansRangePrefix)
    );
  }

  private buildCacheKey(namespace: string, ...parts: string[]): string {
    return [
      this.core.getCacheScope(),
      namespace,
      ...parts.map((part) => encodeURIComponent(part)),
    ].join(":");
  }

  private buildPlanTimeAssignmentRelationships(
    assignedTeamIds?: string[],
    assignedPositionIds?: string[]
  ) {
    const relationships = {
      ...(assignedTeamIds === undefined
        ? {}
        : {
            assigned_teams: {
              data: assignedTeamIds.map((id) => ({ type: "Team", id })),
            },
          }),
      ...(assignedPositionIds === undefined
        ? {}
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
  }
}

function cloneResourceResponse(response: {
  data: PCResource[];
  included: PCResource[];
}): { data: PCResource[]; included: PCResource[] } {
  return {
    data: structuredClone(response.data),
    included: structuredClone(response.included),
  };
}

export const planningCenterPlansService = new PlanningCenterPlansService(
  new PlanningCenterCoreClient()
);

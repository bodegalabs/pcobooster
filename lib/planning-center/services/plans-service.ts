import { isNonEmptyString } from "@/lib/json";
import type { JsonObject } from "@/lib/json";
import { logger } from "@/lib/logger";
import { PlanningCenterApiError } from "@/lib/planning-center/api-error";
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
  private readonly rangeCache = new PlanningCenterReadCache<{
    data: PCResource[];
    included: PCResource[];
  }>();
  private readonly planTimesCache = new PlanningCenterReadCache<PCResource[]>();
  private readonly core: PlanningCenterCoreClient;
  private readonly resolveTimeZone: () => Promise<string>;

  constructor(
    core: PlanningCenterCoreClient,
    resolveTimeZone: () => Promise<string> = resolveOrganizationTimeZone
  ) {
    this.core = core;
    this.resolveTimeZone = resolveTimeZone;
  }

  async getPlans(
    serviceTypeId: string,
    params: Record<string, string> = {}
  ): Promise<PCResource[]> {
    return await this.core.fetchAll(
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
    include = ""
  ): Promise<{ data: PCResource[]; included: PCResource[] }> {
    const orgTz = await this.resolveTimeZone();
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

    const response = await this.rangeCache.get(
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

        const fetched = await this.core.fetchAllWithIncluded(
          `/services/v2/service_types/${serviceTypeId}/plans`,
          params,
          3
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
      }
    );

    return cloneResourceResponse(response);
  }

  async getPlan(planId: string): Promise<PCResource> {
    const response = await this.core.fetch(`/services/v2/plans/${planId}`);
    return response.data;
  }

  async getPlanTimes(
    serviceTypeId: string,
    planId: string
  ): Promise<PCResource[]> {
    const planTimes = await this.planTimesCache.get(
      this.buildCacheKey("plan-times", serviceTypeId, planId),
      PLANS_RANGE_CACHE_TTL_MS,
      async () =>
        await this.core.fetchAll(
          `/services/v2/service_types/${serviceTypeId}/plans/${planId}/plan_times`,
          {
            order: "starts_at",
            per_page: "200",
            include: "split_team_rehearsal_assignments",
          }
        )
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
    planId: string
  ): Promise<{ data: PCResource; included: PCResource[] }> {
    const response = await this.core.fetch(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}?include=series`
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

    this.planTimesCache.deleteWhere((key) => key === planTimesKey);
    this.rangeCache.deleteWhere((key) => key.startsWith(plansRangePrefix));
  }

  private buildCacheKey(namespace: string, ...parts: string[]): string {
    return [
      this.core.getCacheScope(),
      namespace,
      ...parts.map((part) => encodeURIComponent(part)),
    ].join(":");
  }
}

export const planningCenterPlansService = new PlanningCenterPlansService(
  new PlanningCenterCoreClient()
);

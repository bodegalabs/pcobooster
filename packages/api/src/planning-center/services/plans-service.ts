import { logger } from "@pcobooster/api/logger";
import { PlanningCenterApiError } from "@pcobooster/api/planning-center/api-error";
import type {
  PlanningCenterCoreClient,
  PlanningCenterError,
} from "@pcobooster/api/planning-center/core-client";
import { cachedRead } from "@pcobooster/api/planning-center/services/cached-read";
import {
  PlanningCenterReadCache,
  stableParams,
} from "@pcobooster/api/planning-center/services/read-cache";
import { formatCalendarDayInTimeZone } from "@pcobooster/planning-center-models/calendar";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type { JsonObject } from "@pcobooster/planning-center-models/json";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

const log = logger.for("planning-center/plans");
const PLANS_RANGE_CACHE_TTL_MS = 5 * 60 * 1000;

interface ResourceCollection {
  data: PCResource[];
  included: PCResource[];
}

export interface PlanningCenterPlansServiceCaches {
  readonly ranges: PlanningCenterReadCache<ResourceCollection>;
  readonly planTimes: PlanningCenterReadCache<PCResource[]>;
}

export const createPlanningCenterPlansServiceCaches =
  (): PlanningCenterPlansServiceCaches => ({
    ranges: new PlanningCenterReadCache<ResourceCollection>(),
    planTimes: new PlanningCenterReadCache<PCResource[]>(),
  });

export const planningCenterPlansServiceCaches =
  createPlanningCenterPlansServiceCaches();

const cloneResourceResponse = (
  response: ResourceCollection
): ResourceCollection => ({
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

const isInOrganizationDayRange = (
  plan: PCResource,
  afterDayKey: string,
  beforeDayKey: string,
  organizationTimeZone: string
): boolean => {
  const sortDateStr = plan.attributes.sort_date;
  if (!isNonEmptyString(sortDateStr)) {
    return false;
  }
  const sortDate = new Date(sortDateStr);
  if (Number.isNaN(sortDate.getTime())) {
    return false;
  }
  const planDay = formatCalendarDayInTimeZone(sortDate, organizationTimeZone);
  return planDay >= afterDayKey && planDay <= beforeDayKey;
};

export class PlanningCenterPlansService {
  private readonly core: PlanningCenterCoreClient;
  private readonly resolveTimeZone: Effect.Effect<string>;
  private readonly caches: PlanningCenterPlansServiceCaches;

  constructor(
    core: PlanningCenterCoreClient,
    resolveTimeZone: Effect.Effect<string>,
    caches: PlanningCenterPlansServiceCaches = createPlanningCenterPlansServiceCaches()
  ) {
    this.core = core;
    this.resolveTimeZone = resolveTimeZone;
    this.caches = caches;
  }

  getPlans(
    serviceTypeId: string,
    params: Record<string, string> = {}
  ): Effect.Effect<PCResource[], PlanningCenterError> {
    return this.core.fetchAll(
      `/services/v2/service_types/${serviceTypeId}/plans`,
      { ...params, order: "-sort_date" },
      3
    );
  }

  /**
   * Fetch plans from `afterDayKey` onward (YYYY-MM-DD in org TZ) via filter=after.
   * Trims to plans whose sort_date falls on [`afterDayKey`, `beforeDayKey`] in the org timezone.
   */
  getPlansInDateRange(
    serviceTypeId: string,
    afterDayKey: string,
    beforeDayKey: string,
    organizationTimeZone?: string
  ): Effect.Effect<PCResource[], PlanningCenterError> {
    return Effect.map(
      this.getPlansWithIncludedInDateRange(
        serviceTypeId,
        afterDayKey,
        beforeDayKey,
        "",
        organizationTimeZone
      ),
      (response) => response.data
    );
  }

  getPlansWithIncludedInDateRange(
    serviceTypeId: string,
    afterDayKey: string,
    beforeDayKey: string,
    include = "",
    organizationTimeZone?: string
  ): Effect.Effect<ResourceCollection, PlanningCenterError> {
    const { core, caches } = this;
    const resolveTimeZone =
      organizationTimeZone === undefined
        ? this.resolveTimeZone
        : Effect.succeed(organizationTimeZone);
    return Effect.gen(function* readPlansInDateRange() {
      const orgTz = yield* resolveTimeZone;
      const params = {
        order: "sort_date",
        per_page: "100",
        filter: "after",
        after: afterDayKey,
        ...(include ? { include } : undefined),
      };
      const cacheKey = [
        core.getCacheScope(),
        "plans-range",
        encodeURIComponent(serviceTypeId),
        encodeURIComponent(afterDayKey),
        encodeURIComponent(beforeDayKey),
        stableParams(params),
      ].join(":");
      const load = Effect.gen(function* loadPlansInDateRange() {
        log.info(
          {
            serviceTypeId,
            after: afterDayKey,
            before: beforeDayKey,
            include: include || null,
          },
          "Fetching plans in date range"
        );
        const fetched = yield* core.fetchAllWithIncluded(
          `/services/v2/service_types/${serviceTypeId}/plans`,
          params,
          3
        );
        const plans = fetched.data.filter((plan) =>
          isInOrganizationDayRange(plan, afterDayKey, beforeDayKey, orgTz)
        );
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
      });
      const response = yield* cachedRead(
        caches.ranges,
        cacheKey,
        PLANS_RANGE_CACHE_TTL_MS,
        () => load
      );
      return cloneResourceResponse(response);
    });
  }

  getPlan(planId: string): Effect.Effect<PCResource, PlanningCenterError> {
    return Effect.map(
      this.core.fetch(`/services/v2/plans/${planId}`),
      (response) => response.data
    );
  }

  getPlanTimes(
    serviceTypeId: string,
    planId: string
  ): Effect.Effect<PCResource[], PlanningCenterError> {
    return cachedRead(
      this.caches.planTimes,
      this.buildCacheKey("plan-times", serviceTypeId, planId),
      PLANS_RANGE_CACHE_TTL_MS,
      () =>
        this.core.fetchAll(
          `/services/v2/service_types/${serviceTypeId}/plans/${planId}/plan_times`,
          {
            order: "starts_at",
            per_page: "200",
            include: "split_team_rehearsal_assignments",
          },
          10
        )
    ).pipe(Effect.map((planTimes) => structuredClone(planTimes)));
  }

  updatePlanTime(
    serviceTypeId: string,
    planId: string,
    planTimeId: string,
    attributes: JsonObject,
    assignedTeamIds?: string[],
    assignedPositionIds?: string[]
  ): Effect.Effect<PCResource, PlanningCenterError> {
    const relationships = buildPlanTimeAssignmentRelationships(
      assignedTeamIds,
      assignedPositionIds
    );
    return this.core
      .fetch(
        `/services/v2/service_types/${serviceTypeId}/plan_times/${planTimeId}`,
        {
          method: "PATCH",
          body: {
            data: {
              type: "PlanTime",
              id: planTimeId,
              attributes,
              ...(relationships ? { relationships } : undefined),
            },
          },
        }
      )
      .pipe(
        Effect.map((response) => {
          this.invalidatePlanTimesCache(serviceTypeId, planId);
          return response.data;
        })
      );
  }

  createPlanTime(
    serviceTypeId: string,
    planId: string,
    attributes: JsonObject,
    assignedTeamIds?: string[],
    assignedPositionIds?: string[]
  ): Effect.Effect<PCResource, PlanningCenterError> {
    const relationships = buildPlanTimeAssignmentRelationships(
      assignedTeamIds,
      assignedPositionIds
    );
    return this.core
      .fetch(
        `/services/v2/service_types/${serviceTypeId}/plans/${planId}/plan_times`,
        {
          method: "POST",
          body: {
            data: {
              type: "PlanTime",
              attributes,
              ...(relationships ? { relationships } : undefined),
            },
          },
        }
      )
      .pipe(
        Effect.map((response) => {
          this.invalidatePlanTimesCache(serviceTypeId, planId);
          return response.data;
        })
      );
  }

  /** A plan time Planning Center no longer has is already deleted. */
  deletePlanTime(
    serviceTypeId: string,
    planId: string,
    planTimeId: string
  ): Effect.Effect<void, PlanningCenterError> {
    return this.core
      .request(
        `/services/v2/service_types/${serviceTypeId}/plan_times/${planTimeId}`,
        { method: "DELETE" }
      )
      .pipe(
        Effect.asVoid,
        Effect.catchIf(
          (error) =>
            error instanceof PlanningCenterApiError && error.status === 404,
          () => Effect.void
        ),
        Effect.tap(() =>
          Effect.sync(() => {
            this.invalidatePlanTimesCache(serviceTypeId, planId);
          })
        )
      );
  }

  getPlanForServiceTypeWithSeries(
    serviceTypeId: string,
    planId: string
  ): Effect.Effect<
    { data: PCResource; included: PCResource[] },
    PlanningCenterError
  > {
    return Effect.map(
      this.core.fetch(
        `/services/v2/service_types/${serviceTypeId}/plans/${planId}?include=series`
      ),
      (response) => ({
        data: response.data,
        included: response.included ?? [],
      })
    );
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

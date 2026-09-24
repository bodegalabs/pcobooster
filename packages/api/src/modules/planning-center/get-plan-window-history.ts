import { logger } from "@pcobooster/api/logger";
import {
  CANDIDATE_REQUEST_BUDGET,
  pagesFor,
  requestsSpent,
} from "@pcobooster/api/modules/planning-center/candidate-request-budget";
import {
  planPersonResourceSchema,
  planTimeResourceSchema,
} from "@pcobooster/api/modules/planning-center/people/resource-schemas";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import { cachedRead } from "@pcobooster/api/planning-center/services/cached-read";
import type { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import type { PlanningCenterPlansService } from "@pcobooster/api/planning-center/services/plans-service";
import { PlanningCenterReadCache } from "@pcobooster/api/planning-center/services/read-cache";
import {
  addCalendarDaysToDayKey,
  formatCalendarDayInTimeZone,
} from "@pcobooster/planning-center-models/calendar";
import {
  isNonEmptyString,
  isNumber,
  isString,
} from "@pcobooster/planning-center-models/json";
import type {
  PlanWindowRosters,
  WindowPlanSummary,
  WindowRosterRow,
} from "@pcobooster/planning-center-models/plan-window-history";
import { PLAN_HISTORY_HALF_RANGE_DAYS } from "@pcobooster/planning-center-models/schedule-constants";
import type {
  PCResource,
  RawPlanPerson,
  RawPlanTime,
} from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

const log = logger.for("planning-center/plan-window-history");

/** The organization time zone and service type reads, counted even when cached. */
const FIXED_REQUESTS = 2;
/** `getPlansWithIncludedInDateRange` reads at most 3 pages of 100 plans. */
const PLAN_RANGE_MAX_PAGES = 3;
/** A Worker keeps at most 6 connections waiting for response headers. */
const READ_CONCURRENCY = 6;
/**
 * Window rosters feed history only; the candidate list reads the selected plan's roster fresh.
 * Rosters of plans that already happened are also kept 30 minutes by the people service. This
 * app's schedule writes clear both.
 */
const PLAN_WINDOW_ROSTER_CACHE_TTL_MS = 5 * 60 * 1000;
const PLAN_WINDOW_ROSTER_CACHE_KEY = "plan-window-roster";

interface PlanRoster {
  readonly data: PCResource[];
  readonly included: PCResource[];
}

const planWindowRosterCache = new PlanningCenterReadCache<PlanRoster>();

export interface WindowPlanRef {
  readonly serviceTypeId: string;
  readonly planId: string;
}

export interface PlanWindowHistoryBatch extends PlanWindowRosters {
  generatedAt: string;
  /** Plans whose rosters this call read, including plans with no one scheduled. */
  loadedPlanCount: number;
  /** Listed plans whose rosters are left for the next call, in window order. */
  deferredPlans: WindowPlanRef[];
  /** Service types whose plans are not listed yet; they come after `deferredPlans`. */
  deferredServiceTypeIds: string[];
  requestBudget: {
    limit: number;
    /** Upper bound when transport does not count: cached reads count as requests. */
    planningCenterRequests: number;
    planRangeRequests: number;
    rosterRequests: number;
  };
}

export interface PlanWindowHistoryInput {
  /** The selected plan's sort instant; the window spans 28 days either side. */
  readonly date: string;
  /** Where the previous call stopped; omit on the first call. */
  readonly continuation?: {
    readonly plans: readonly WindowPlanRef[];
    readonly serviceTypeIds: readonly string[];
  };
}

export interface PlanWindowHistoryDependencies {
  readonly catalog: Pick<PlanningCenterCatalogService, "getServiceTypesCached">;
  readonly people: Pick<
    PlanningCenterPeopleService,
    "getCacheScope" | "getPlanTeamMembers"
  >;
  readonly plans: Pick<
    PlanningCenterPlansService,
    "getPlansWithIncludedInDateRange"
  >;
  readonly resolveTimeZone: Effect.Effect<string>;
}

/**
 * A plan is settled once its sort date and every one of its times fall before today in the
 * organization's time zone; its roster then rarely changes.
 */
export const isSettledPlan = (
  plan: PCResource,
  planTimes: RawPlanTime[],
  todayDayKey: string,
  orgTimeZone: string
): boolean => {
  const instants = [
    plan.attributes.sort_date,
    ...planTimes.flatMap((planTime) => [
      planTime.attributes.starts_at,
      planTime.attributes.ends_at,
    ]),
  ];
  let sawDay = false;
  for (const value of instants) {
    if (!isNonEmptyString(value)) {
      continue;
    }
    const instant = new Date(value);
    if (Number.isNaN(instant.getTime())) {
      continue;
    }
    if (formatCalendarDayInTimeZone(instant, orgTimeZone) >= todayDayKey) {
      return false;
    }
    sawDay = true;
  }
  return sawDay;
};

const getIncludedPlanTimesForPlan = (
  plan: PCResource,
  included: PCResource[]
): RawPlanTime[] => {
  const relationshipData = plan.relationships?.plan_times?.data;
  const relationshipIds = new Set<string>();
  if (Array.isArray(relationshipData)) {
    for (const related of relationshipData) {
      relationshipIds.add(related.id);
    }
  } else if (relationshipData !== undefined && relationshipData !== null) {
    relationshipIds.add(relationshipData.id);
  }

  const planTimes: RawPlanTime[] = [];
  for (const resource of included) {
    const parsed = planTimeResourceSchema.safeParse(resource);
    if (!parsed.success) {
      continue;
    }
    if (relationshipIds.size > 0) {
      if (relationshipIds.has(parsed.data.id)) {
        planTimes.push(parsed.data);
      }
      continue;
    }
    const planRel = resource.relationships?.plan?.data;
    const planId = Array.isArray(planRel) ? planRel[0]?.id : planRel?.id;
    if (planId === plan.id) {
      planTimes.push(parsed.data);
    }
  }
  return planTimes;
};

const appendIncludedResources = (
  target: PCResource[],
  seen: Set<string>,
  additions: readonly PCResource[]
) => {
  for (const resource of additions) {
    const key = `${resource.type}:${resource.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      target.push(resource);
    }
  }
};

interface WindowPlan {
  readonly serviceTypeId: string;
  readonly plan: PCResource;
  readonly planTimes: RawPlanTime[];
}

/** Roster pages a plan needs; a plan with no one scheduled needs none. */
const rosterRequestsFor = (plan: PCResource): number => {
  const count = plan.attributes.plan_people_count;
  if (!isNumber(count)) {
    return 1;
  }
  return count === 0 ? 0 : pagesFor(count);
};

interface LoadedPlan {
  readonly planTimes: RawPlanTime[];
  readonly included: PCResource[];
  readonly members: RawPlanPerson[];
}

const loadWindowRoster = (
  { serviceTypeId, plan, planTimes }: WindowPlan,
  settled: boolean,
  people: PlanWindowHistoryDependencies["people"]
): Effect.Effect<LoadedPlan, PlanningCenterError> => {
  if (rosterRequestsFor(plan) === 0) {
    return Effect.succeed({ planTimes, included: [...planTimes], members: [] });
  }
  const cacheKey = [
    people.getCacheScope(),
    PLAN_WINDOW_ROSTER_CACHE_KEY,
    encodeURIComponent(serviceTypeId),
    encodeURIComponent(plan.id),
  ].join(":");
  return cachedRead(
    planWindowRosterCache,
    cacheKey,
    PLAN_WINDOW_ROSTER_CACHE_TTL_MS,
    () => people.getPlanTeamMembers(serviceTypeId, plan.id, { settled })
  ).pipe(
    Effect.map(({ data, included }) => {
      const merged: PCResource[] = [];
      const seen = new Set<string>();
      appendIncludedResources(merged, seen, included);
      appendIncludedResources(merged, seen, planTimes);
      return {
        planTimes,
        included: merged,
        members: data.flatMap((resource) => {
          const parsed = planPersonResourceSchema.safeParse(resource);
          return parsed.success ? [parsed.data] : [];
        }),
      };
    })
  );
};

const relatedIds = (
  relationship: { data?: { id: string } | { id: string }[] | null } | undefined
): string[] => {
  const data = relationship?.data;
  if (!data) {
    return [];
  }
  return Array.isArray(data) ? data.map(({ id }) => id) : [data.id];
};

const toRosterRow = (member: RawPlanPerson): WindowRosterRow => {
  const declineReason = member.attributes.decline_reason;
  return {
    id: member.id,
    planId: member.relationships?.plan?.data?.id ?? null,
    teamId: member.relationships?.team?.data?.id ?? null,
    teamPositionName: member.attributes.team_position_name,
    status: member.attributes.status,
    createdAt: member.attributes.created_at,
    timeIds: relatedIds(member.relationships?.times),
    serviceTimeIds: relatedIds(member.relationships?.service_times),
    declineReason:
      isString(declineReason) && declineReason.trim().length > 0
        ? declineReason.trim()
        : null,
  };
};

/** A plan's title, date, and service type name, as history items show them. */
const toPlanSummary = (
  plan: PCResource,
  historyIncluded: readonly PCResource[]
): WindowPlanSummary => {
  const [serviceTypeId] = relatedIds(plan.relationships?.service_type);
  const serviceType = isNonEmptyString(serviceTypeId)
    ? historyIncluded.find(
        ({ type, id }) => type === "ServiceType" && id === serviceTypeId
      )
    : undefined;
  const { title, sort_date: sortDate } = plan.attributes;
  const serviceTypeName = serviceType?.attributes.name;
  return {
    id: plan.id,
    title: isString(title) ? title : null,
    sortDate: isString(sortDate) ? sortDate : null,
    serviceTypeName: isString(serviceTypeName) ? serviceTypeName : null,
  };
};

/**
 * Everyone's roster rows from the loaded rosters, in window order, with the plans and times
 * those rows point at.
 */
const buildRosters = (
  activeServiceTypes: readonly PCResource[],
  loadedPlans: readonly LoadedPlan[]
): PlanWindowRosters => {
  const historyIncluded: PCResource[] = [];
  const seen = new Set<string>();
  appendIncludedResources(historyIncluded, seen, activeServiceTypes);
  const rowsByPersonId = new Map<string, WindowRosterRow[]>();
  const planIds = new Set<string>();
  for (const loadedPlan of loadedPlans) {
    appendIncludedResources(historyIncluded, seen, loadedPlan.included);
    for (const member of loadedPlan.members) {
      const personId = member.relationships?.person?.data?.id;
      if (!isNonEmptyString(personId)) {
        continue;
      }
      const row = toRosterRow(member);
      if (row.planId !== null) {
        planIds.add(row.planId);
      }
      const rows = rowsByPersonId.get(personId) ?? [];
      rows.push(row);
      rowsByPersonId.set(personId, rows);
    }
  }
  const plans = historyIncluded.flatMap((resource) =>
    resource.type === "Plan" && planIds.has(resource.id)
      ? [toPlanSummary(resource, historyIncluded)]
      : []
  );
  return {
    plans,
    planTimes: loadedPlans.flatMap(({ planTimes }) =>
      planTimes.map(({ id, attributes }) => ({
        id,
        startsAt: attributes.starts_at ?? null,
        timeType: attributes.time_type ?? null,
      }))
    ),
    people: [...rowsByPersonId].map(([personId, rows]) => ({
      personId,
      rows,
    })),
  };
};

const serviceTypeIdsOf = (plans: readonly WindowPlanRef[]): string[] => [
  ...new Set(plans.map((plan) => plan.serviceTypeId)),
];

/**
 * History for the candidate list from the rosters of every plan within 28 days either side of
 * the selected plan, across active service types, within `CANDIDATE_REQUEST_BUDGET` Planning
 * Center requests.
 *
 * The first call lists the window's plans (one plan-range read per service type) and reads
 * rosters in window order until the budget runs out. The rest comes back as `deferredPlans`
 * (and `deferredServiceTypeIds` when even the listing does not fit) for the caller's next
 * call, so concatenating every call's rows reproduces the window's order. Failed reads fail
 * the call.
 */
export const getPlanWindowHistory = (
  { date, continuation }: PlanWindowHistoryInput,
  { catalog, people, plans, resolveTimeZone }: PlanWindowHistoryDependencies
): Effect.Effect<PlanWindowHistoryBatch, PlanningCenterError> =>
  Effect.gen(function* readPlanWindowHistory() {
    const orgTimeZone = yield* resolveTimeZone;
    const refDayKey = formatCalendarDayInTimeZone(new Date(date), orgTimeZone);
    const afterDayKey = addCalendarDaysToDayKey(
      refDayKey,
      -PLAN_HISTORY_HALF_RANGE_DAYS,
      orgTimeZone
    );
    const beforeDayKey = addCalendarDaysToDayKey(
      refDayKey,
      PLAN_HISTORY_HALF_RANGE_DAYS,
      orgTimeZone
    );
    const activeServiceTypes = (yield* catalog.getServiceTypesCached()).filter(
      (resource) => !isNonEmptyString(resource.attributes.archived_at)
    );
    const activeIds = new Set(activeServiceTypes.map(({ id }) => id));

    // Plans listed by an earlier call are located again (their ranges are usually cached) before
    // any new service type is listed, which keeps the window order across calls.
    const pendingPlans = (continuation?.plans ?? []).filter(
      ({ serviceTypeId }) => activeIds.has(serviceTypeId)
    );
    const pendingServiceTypeIds = serviceTypeIdsOf(pendingPlans);
    const unlistedServiceTypeIds =
      continuation === undefined
        ? activeServiceTypes.map(({ id }) => id)
        : continuation.serviceTypeIds.filter((id) => activeIds.has(id));
    const rangeSlots = Math.max(
      1,
      Math.floor(
        (CANDIDATE_REQUEST_BUDGET - FIXED_REQUESTS - 1) / PLAN_RANGE_MAX_PAGES
      )
    );
    const pendingRangeIds = pendingServiceTypeIds.slice(0, rangeSlots);
    const listedIds =
      pendingRangeIds.length < pendingServiceTypeIds.length
        ? []
        : unlistedServiceTypeIds.slice(0, rangeSlots - pendingRangeIds.length);
    const rangeIds = [...pendingRangeIds, ...listedIds];

    const ranges = yield* Effect.forEach(
      rangeIds,
      (serviceTypeId) =>
        Effect.map(
          plans.getPlansWithIncludedInDateRange(
            serviceTypeId,
            afterDayKey,
            beforeDayKey,
            "plan_times",
            orgTimeZone
          ),
          (response) => ({ serviceTypeId, ...response })
        ),
      { concurrency: READ_CONCURRENCY }
    );
    const rangeByServiceTypeId = new Map(
      ranges.map((range) => [range.serviceTypeId, range])
    );
    const toWindowPlan = (
      serviceTypeId: string,
      plan: PCResource,
      included: PCResource[]
    ): WindowPlan => ({
      serviceTypeId,
      plan,
      planTimes: getIncludedPlanTimesForPlan(plan, included),
    });

    const windowPlans: WindowPlan[] = [];
    const unlocatedPlans: WindowPlanRef[] = [];
    for (const ref of pendingPlans) {
      const range = rangeByServiceTypeId.get(ref.serviceTypeId);
      if (range === undefined) {
        unlocatedPlans.push(ref);
        continue;
      }
      const plan = range.data.find(({ id }) => id === ref.planId);
      // A plan that left the window since the last call has no history to add.
      if (plan !== undefined) {
        windowPlans.push(toWindowPlan(ref.serviceTypeId, plan, range.included));
      }
    }
    for (const serviceTypeId of listedIds) {
      const range = rangeByServiceTypeId.get(serviceTypeId);
      for (const plan of range?.data ?? []) {
        windowPlans.push(
          toWindowPlan(serviceTypeId, plan, range?.included ?? [])
        );
      }
    }

    const planRangeRequests = rangeIds.length * PLAN_RANGE_MAX_PAGES;
    const spent = yield* requestsSpent(FIXED_REQUESTS + planRangeRequests);
    let remaining = CANDIDATE_REQUEST_BUDGET - spent;
    let admittedCount = 0;
    for (const windowPlan of windowPlans) {
      const cost = rosterRequestsFor(windowPlan.plan);
      if (cost > remaining) {
        break;
      }
      remaining -= cost;
      admittedCount += 1;
    }
    const admitted = windowPlans.slice(0, admittedCount);
    const todayDayKey = formatCalendarDayInTimeZone(new Date(), orgTimeZone);
    const loadedPlans = yield* Effect.forEach(
      admitted,
      (windowPlan) =>
        loadWindowRoster(
          windowPlan,
          isSettledPlan(
            windowPlan.plan,
            windowPlan.planTimes,
            todayDayKey,
            orgTimeZone
          ),
          people
        ),
      { concurrency: READ_CONCURRENCY }
    );

    const rosterRequests = admitted.reduce(
      (total, windowPlan) => total + rosterRequestsFor(windowPlan.plan),
      0
    );
    const batch: PlanWindowHistoryBatch = {
      generatedAt: new Date().toISOString(),
      loadedPlanCount: loadedPlans.length,
      ...buildRosters(activeServiceTypes, loadedPlans),
      deferredPlans: [
        ...windowPlans.slice(admittedCount).map(({ serviceTypeId, plan }) => ({
          serviceTypeId,
          planId: plan.id,
        })),
        ...unlocatedPlans,
      ],
      deferredServiceTypeIds: unlistedServiceTypeIds.slice(listedIds.length),
      requestBudget: {
        limit: CANDIDATE_REQUEST_BUDGET,
        planningCenterRequests: spent + rosterRequests,
        planRangeRequests,
        rosterRequests,
      },
    };
    log.info(
      {
        ...batch.requestBudget,
        loadedPlanCount: batch.loadedPlanCount,
        deferredPlanCount: batch.deferredPlans.length,
        deferredServiceTypeCount: batch.deferredServiceTypeIds.length,
        rosterPeopleCount: batch.people.length,
      },
      "Plan window history read"
    );
    return batch;
  });

/** Schedule and plan time writes change rosters, so the window's copies are dropped. */
export const invalidatePlanWindowHistory = (cacheScope: string) => {
  const prefix = [cacheScope, PLAN_WINDOW_ROSTER_CACHE_KEY, ""].join(":");
  planWindowRosterCache.deleteWhere((key) => key.startsWith(prefix));
};

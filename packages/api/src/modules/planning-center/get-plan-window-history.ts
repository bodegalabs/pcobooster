import { moduleLog } from "@pcobooster/api/logging";
import {
  planPersonResourceSchema,
  planTimeResourceSchema,
} from "@pcobooster/api/modules/planning-center/people/resource-schemas";
import { PLANNING_CENTER_PAGE_SIZE } from "@pcobooster/api/planning-center/core-client";
import type {
  PlanningCenterError,
  PlanningCenterPage,
} from "@pcobooster/api/planning-center/core-client";
import {
  pagesFor,
  PLANNING_CENTER_REQUEST_CAP,
  planningCenterRequestsSpent,
  PROGRESSIVE_REQUEST_BUDGET,
  withPlanningCenterRequestCount,
} from "@pcobooster/api/planning-center/request-budget";
import type { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import { PLAN_ROSTER_MAX_PAGES } from "@pcobooster/api/planning-center/services/people-service";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import {
  isInOrganizationDayRange,
  nextRangeOffset,
} from "@pcobooster/api/planning-center/services/plans-service";
import type { PlanningCenterPlansService } from "@pcobooster/api/planning-center/services/plans-service";
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
import {
  PLAN_HISTORY_HALF_RANGE_DAYS,
  REHEARSAL_WINDOW_MARGIN_DAYS,
} from "@pcobooster/planning-center-models/schedule-constants";
import type {
  PCResource,
  RawPlanPerson,
  RawPlanTime,
} from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

const log = moduleLog("planning-center/plan-window-history");

/** A Worker keeps at most 6 connections waiting for response headers. */
const READ_CONCURRENCY = 6;
export interface WindowPlanRef {
  readonly serviceTypeId: string;
  readonly planId: string;
  /** Roster pages the plan needs, so the next call can reserve them before reading ranges. */
  readonly rosterRequests: number;
  /** The offset of the range page that listed the plan, where the next call finds it again. */
  readonly rangeOffset: number;
}

/** A service type whose window plans are listed up to `offset`; 0 when none are yet. */
export interface WindowRangeRef {
  readonly serviceTypeId: string;
  readonly offset: number;
}

export interface PlanWindowHistoryBatch extends PlanWindowRosters {
  generatedAt: string;
  /** Plans whose rosters this call read, including plans with no one scheduled. */
  loadedPlanCount: number;
  /** Listed plans whose rosters are left for the next call, in window order. */
  deferredPlans: WindowPlanRef[];
  /** Ranges not listed to their end yet, with the page each goes on from; after `deferredPlans`. */
  deferredRanges: WindowRangeRef[];
  requestBudget: {
    limit: number;
    /** Planning Center requests this procedure sent; cached reads cost none. */
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
    readonly ranges: readonly WindowRangeRef[];
  };
}

export interface PlanWindowHistoryDependencies {
  readonly catalog: Pick<PlanningCenterCatalogService, "getServiceTypesCached">;
  readonly people: Pick<PlanningCenterPeopleService, "getPlanWindowRoster">;
  readonly plans: Pick<PlanningCenterPlansService, "getPlanRangePage">;
  readonly resolveTimeZone: Effect.Effect<string, PlanningCenterError>;
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

interface IncludedPlanTime {
  readonly time: RawPlanTime;
  readonly planId: string | undefined;
}

// Validate once per range; keep the original relationship because the time schema strips it.
const parseIncludedPlanTimes = (
  included: readonly PCResource[]
): IncludedPlanTime[] =>
  included.flatMap((resource) => {
    const parsed = planTimeResourceSchema.safeParse(resource);
    if (!parsed.success) {
      return [];
    }
    const planRel = resource.relationships?.plan?.data;
    const planId = Array.isArray(planRel) ? planRel[0]?.id : planRel?.id;
    return [{ time: parsed.data, planId }];
  });

const getIncludedPlanTimesForPlan = (
  plan: PCResource,
  included: readonly IncludedPlanTime[]
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
  for (const { time, planId } of included) {
    if (relationshipIds.size > 0) {
      if (relationshipIds.has(time.id)) {
        planTimes.push(time);
      }
      continue;
    }
    if (planId === plan.id) {
      planTimes.push(time);
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

const dayKeyOf = (
  value: string | null | undefined,
  orgTimeZone: string
): string | null => {
  if (!isNonEmptyString(value)) {
    return null;
  }
  const instant = new Date(value);
  return Number.isNaN(instant.getTime())
    ? null
    : formatCalendarDayInTimeZone(instant, orgTimeZone);
};

/**
 * Whether a plan's roster adds history to a window ending on `lastDayKey`: plans on or before it,
 * and later plans (read up to `REHEARSAL_WINDOW_MARGIN_DAYS` past it) with a rehearsal inside it.
 */
const addsWindowHistory = (
  plan: PCResource,
  planTimes: readonly RawPlanTime[],
  lastDayKey: string,
  orgTimeZone: string
): boolean => {
  const planDayKey = dayKeyOf(
    isString(plan.attributes.sort_date) ? plan.attributes.sort_date : null,
    orgTimeZone
  );
  if (planDayKey === null || planDayKey <= lastDayKey) {
    return true;
  }
  return planTimes.some(({ attributes }) => {
    if (attributes.time_type !== "rehearsal") {
      return false;
    }
    const dayKey = dayKeyOf(attributes.starts_at, orgTimeZone);
    return dayKey !== null && dayKey <= lastDayKey;
  });
};

interface WindowPlan {
  readonly serviceTypeId: string;
  readonly plan: PCResource;
  readonly planTimes: RawPlanTime[];
  readonly rangeOffset: number;
}

/** Roster pages a plan needs; a plan with no one scheduled needs none. */
const rosterRequestsFor = (plan: PCResource): number => {
  const count = plan.attributes.plan_people_count;
  if (!isNumber(count)) {
    return 1;
  }
  return count === 0 ? 0 : Math.min(pagesFor(count), PLAN_ROSTER_MAX_PAGES);
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
  // Window rosters feed history only; the candidate list reads the selected plan's roster fresh.
  return people.getPlanWindowRoster(serviceTypeId, plan.id, { settled }).pipe(
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

/** One page of a range: its plans in the range, and where the range goes on (`null`: done). */
interface RangePage {
  readonly plans: WindowPlan[];
  readonly next: number | null;
}

interface PageRef {
  readonly serviceTypeId: string;
  readonly offset: number;
}

/** A pending plan: found on its page, gone from the window, or not looked for yet. */
interface PendingPlan {
  readonly ref: WindowPlanRef;
  plan: WindowPlan | "gone" | undefined;
}

const pageKey = ({ serviceTypeId, offset }: PageRef) =>
  `${serviceTypeId}:${offset}`;

/** Where a plan may be now: the page that listed it, then its neighbors, in case plans moved. */
const pagesToSearch = ({ serviceTypeId, rangeOffset }: WindowPlanRef) =>
  [
    rangeOffset,
    rangeOffset + PLANNING_CENTER_PAGE_SIZE,
    rangeOffset - PLANNING_CENTER_PAGE_SIZE,
  ]
    .filter((offset) => offset >= 0)
    .map((offset): PageRef => ({ serviceTypeId, offset }));

const requestsLeft = planningCenterRequestsSpent.pipe(
  Effect.map((spent) => PROGRESSIVE_REQUEST_BUDGET - spent)
);

interface WindowDays {
  readonly afterDayKey: string;
  readonly beforeDayKey: string;
  readonly rangeEndDayKey: string;
  readonly orgTimeZone: string;
}

/** The range pages one call has read, by service type and offset. */
class RangePages {
  private readonly pages = new Map<string, RangePage>();
  private readonly plans: PlanWindowHistoryDependencies["plans"];
  private readonly days: WindowDays;

  constructor(plans: PlanWindowHistoryDependencies["plans"], days: WindowDays) {
    this.plans = plans;
    this.days = days;
  }

  get(page: PageRef): RangePage | undefined {
    return this.pages.get(pageKey(page));
  }

  /** The pages among `wanted` not read yet, each once, in order. */
  unread(wanted: readonly PageRef[]): PageRef[] {
    const keys = new Set<string>();
    return wanted.filter((page) => {
      const key = pageKey(page);
      if (this.pages.has(key) || keys.has(key)) {
        return false;
      }
      keys.add(key);
      return true;
    });
  }

  read(wanted: readonly PageRef[]): Effect.Effect<void, PlanningCenterError> {
    return Effect.forEach(wanted, (page) => this.readOne(page), {
      concurrency: READ_CONCURRENCY,
      discard: true,
    });
  }

  private readOne(page: PageRef): Effect.Effect<void, PlanningCenterError> {
    return this.plans
      .getPlanRangePage(
        page.serviceTypeId,
        this.days.afterDayKey,
        "plan_times",
        page.offset
      )
      .pipe(
        Effect.map((read) => {
          this.store(page, read);
        })
      );
  }

  private store(
    { serviceTypeId, offset }: PageRef,
    page: PlanningCenterPage
  ): void {
    const { afterDayKey, rangeEndDayKey, orgTimeZone } = this.days;
    const planTimes = parseIncludedPlanTimes(page.included);
    this.pages.set(pageKey({ serviceTypeId, offset }), {
      plans: page.data.flatMap((plan) =>
        isInOrganizationDayRange(plan, afterDayKey, rangeEndDayKey, orgTimeZone)
          ? [
              {
                serviceTypeId,
                plan,
                planTimes: getIncludedPlanTimesForPlan(plan, planTimes),
                rangeOffset: offset,
              },
            ]
          : []
      ),
      next: nextRangeOffset(page, rangeEndDayKey, orgTimeZone),
    });
  }
}

/** Looks for each unresolved pending plan on the pages read so far. */
const resolvePending = (pending: readonly PendingPlan[], pages: RangePages) => {
  for (const entry of pending) {
    if (entry.plan !== undefined) {
      continue;
    }
    const search = pagesToSearch(entry.ref);
    entry.plan = search
      .map((page) =>
        pages.get(page)?.plans.find(({ plan }) => plan.id === entry.ref.planId)
      )
      .find((found) => found !== undefined);
    if (entry.plan === undefined && pages.unread(search).length === 0) {
      entry.plan = "gone";
    }
  }
};

/** The pages a search pass reads for one pending plan: its own, or then its neighbors. */
const searchPages = (
  entry: PendingPlan,
  pages: RangePages,
  neighbors: boolean
): PageRef[] => {
  if (entry.plan !== undefined) {
    return [];
  }
  const [own, ...around] = pagesToSearch(entry.ref);
  if (own === undefined) {
    return [];
  }
  if (!neighbors) {
    return [own];
  }
  // Only a plan missing from its own page may have moved to a neighbor.
  return pages.get(own) === undefined ? [] : around;
};

const firstUnresolved = (
  pending: readonly PendingPlan[]
): PendingPlan | undefined => {
  for (const entry of pending) {
    if (entry.plan === undefined) {
      return entry;
    }
  }
  return undefined;
};

/**
 * Finds the plans earlier calls listed, keeping room for the first one's roster. The first
 * unresolved plan's pages are read whatever the budget, so it always resolves.
 */
const locatePending = (
  pending: readonly PendingPlan[],
  pages: RangePages
): Effect.Effect<void, PlanningCenterError> =>
  Effect.gen(function* findPendingPlans() {
    const firstRosterRequests = Math.min(
      pending[0]?.ref.rosterRequests ?? 0,
      PLAN_ROSTER_MAX_PAGES
    );
    for (const neighbors of [false, true]) {
      const wanted = pages.unread(
        pending.flatMap((entry) => searchPages(entry, pages, neighbors))
      );
      const first = firstUnresolved(pending);
      const firstNeeds =
        first === undefined
          ? 0
          : pages.unread(searchPages(first, pages, neighbors)).length;
      const slots = Math.max(
        firstNeeds,
        (yield* requestsLeft) - firstRosterRequests
      );
      yield* pages.read(wanted.slice(0, Math.max(0, slots)));
      resolvePending(pending, pages);
    }
  });

/**
 * Lists range pages in order, a range's later pages before the next range, while the plans
 * already collected leave room on rosters. A first call always lists one page. Returns the
 * plans listed; `ranges` is left holding what is still unlisted.
 */
const listRanges = (
  ranges: WindowRangeRef[],
  pages: RangePages,
  collectedRosterRequests: number,
  { beforeDayKey, orgTimeZone }: WindowDays
): Effect.Effect<WindowPlan[], PlanningCenterError> =>
  Effect.gen(function* listRangePages() {
    const listed: WindowPlan[] = [];
    let rosterRequests = collectedRosterRequests;
    let mustList = collectedRosterRequests === 0;
    while (ranges.length > 0) {
      const room = (yield* requestsLeft) - rosterRequests;
      const slots = mustList ? Math.max(room, 1) : room;
      if (slots < 1) {
        break;
      }
      yield* pages.read(
        pages.unread(ranges.slice(0, Math.min(slots, READ_CONCURRENCY)))
      );
      mustList = false;
      // Pages are taken in range order: a range's later pages come before the next range.
      let range = ranges.at(0);
      let page = range === undefined ? undefined : pages.get(range);
      while (range !== undefined && page !== undefined) {
        const adding = page.plans.filter(({ plan, planTimes }) =>
          addsWindowHistory(plan, planTimes, beforeDayKey, orgTimeZone)
        );
        listed.push(...adding);
        rosterRequests += adding.reduce(
          (sum, { plan }) => sum + rosterRequestsFor(plan),
          0
        );
        if (page.next !== null) {
          ranges[0] = { serviceTypeId: range.serviceTypeId, offset: page.next };
          break;
        }
        ranges.shift();
        range = ranges.at(0);
        page = range === undefined ? undefined : pages.get(range);
      }
    }
    return listed;
  });

/** How many plans, from the start of `ordered`, get their rosters read this call. */
const admitRosters = (
  ordered: readonly (WindowPlan | WindowPlanRef)[],
  spent: number
): number => {
  let budget = PROGRESSIVE_REQUEST_BUDGET - spent;
  let admitted = 0;
  for (const entry of ordered) {
    if (!("plan" in entry)) {
      break;
    }
    const cost = rosterRequestsFor(entry.plan);
    // The first roster may use the retry headroom, so a follow-up call always reads one.
    const limit =
      admitted === 0
        ? Math.max(budget, PLANNING_CENTER_REQUEST_CAP - spent)
        : budget;
    if (cost > limit) {
      break;
    }
    budget -= cost;
    admitted += 1;
  }
  return admitted;
};

const toPlanRef = (entry: WindowPlan | WindowPlanRef): WindowPlanRef =>
  "plan" in entry
    ? {
        serviceTypeId: entry.serviceTypeId,
        planId: entry.plan.id,
        rosterRequests: rosterRequestsFor(entry.plan),
        rangeOffset: entry.rangeOffset,
      }
    : entry;

/**
 * History for the candidate list from the rosters of every plan within 28 days either side of
 * the selected plan, across active service types, plus plans up to a week after the window that
 * hold a rehearsal inside it. Each call plans against `PROGRESSIVE_REQUEST_BUDGET` Planning
 * Center requests, counting what was really sent.
 *
 * Each service type's plans are listed a range page at a time (100 plans, in date order, from
 * the window's start), until a page passes the window. A call first finds the plans an earlier
 * call deferred, on the range page that listed them (cached pages cost nothing), keeping room
 * for the first one's roster; then, when all are found, lists further pages in service type
 * order while their rosters could still fit; then reads rosters in window order until the budget
 * runs out. What is left comes back as `deferredPlans` and `deferredRanges`, so concatenating
 * every call's rows reproduces the window, whatever its size. A plan that moved to a neighboring
 * page since it was listed is found there; one in none of them left the window. Failed reads
 * fail the call.
 */
export const getPlanWindowHistory = (
  { date, continuation }: PlanWindowHistoryInput,
  { catalog, people, plans, resolveTimeZone }: PlanWindowHistoryDependencies
): Effect.Effect<PlanWindowHistoryBatch, PlanningCenterError> =>
  Effect.gen(function* readPlanWindowHistory() {
    const orgTimeZone = yield* resolveTimeZone;
    const refDayKey = formatCalendarDayInTimeZone(new Date(date), orgTimeZone);
    const beforeDayKey = addCalendarDaysToDayKey(
      refDayKey,
      PLAN_HISTORY_HALF_RANGE_DAYS
    );
    const days: WindowDays = {
      afterDayKey: addCalendarDaysToDayKey(
        refDayKey,
        -PLAN_HISTORY_HALF_RANGE_DAYS
      ),
      beforeDayKey,
      rangeEndDayKey: addCalendarDaysToDayKey(
        beforeDayKey,
        REHEARSAL_WINDOW_MARGIN_DAYS
      ),
      orgTimeZone,
    };
    const activeServiceTypes = (yield* catalog.getServiceTypesCached()).filter(
      (resource) => !isNonEmptyString(resource.attributes.archived_at)
    );
    const activeIds = new Set(activeServiceTypes.map(({ id }) => id));
    const isActive = ({ serviceTypeId }: { serviceTypeId: string }) =>
      activeIds.has(serviceTypeId);
    const pages = new RangePages(plans, days);
    const beforeRanges = yield* planningCenterRequestsSpent;

    const pending: PendingPlan[] = (continuation?.plans ?? []).flatMap((ref) =>
      isActive(ref) ? [{ ref, plan: undefined }] : []
    );
    yield* locatePending(pending, pages);
    const found = pending.flatMap(({ plan }) =>
      plan === undefined || plan === "gone" ? [] : [plan]
    );
    const ranges: WindowRangeRef[] = (
      continuation?.ranges ??
      activeServiceTypes.map(({ id }) => ({ serviceTypeId: id, offset: 0 }))
    ).filter(isActive);
    // New pages are listed only once every deferred plan is found, so the window's order holds.
    const listed = pending.every(({ plan }) => plan !== undefined)
      ? yield* listRanges(
          ranges,
          pages,
          pending.length > 0
            ? Math.max(
                1,
                found.reduce(
                  (sum, { plan }) => sum + rosterRequestsFor(plan),
                  0
                )
              )
            : 0,
          days
        )
      : [];

    const afterRanges = yield* planningCenterRequestsSpent;
    const ordered: (WindowPlan | WindowPlanRef)[] = [
      ...pending.flatMap(({ ref, plan }) =>
        plan === "gone" ? [] : [plan ?? ref]
      ),
      ...listed,
    ];
    const admittedCount = admitRosters(ordered, afterRanges);
    const todayDayKey = formatCalendarDayInTimeZone(new Date(), orgTimeZone);
    const loadedPlans = yield* Effect.forEach(
      ordered
        .slice(0, admittedCount)
        .flatMap((entry) => ("plan" in entry ? [entry] : [])),
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

    const spent = yield* planningCenterRequestsSpent;
    const batch: PlanWindowHistoryBatch = {
      generatedAt: new Date().toISOString(),
      loadedPlanCount: loadedPlans.length,
      ...buildRosters(activeServiceTypes, loadedPlans),
      deferredPlans: ordered.slice(admittedCount).map(toPlanRef),
      deferredRanges: ranges,
      requestBudget: {
        limit: PROGRESSIVE_REQUEST_BUDGET,
        planningCenterRequests: spent,
        planRangeRequests: afterRanges - beforeRanges,
        rosterRequests: spent - afterRanges,
      },
    };
    yield* log.info("Plan window history read", {
      ...batch.requestBudget,
      loadedPlanCount: batch.loadedPlanCount,
      deferredPlanCount: batch.deferredPlans.length,
      deferredRangeCount: batch.deferredRanges.length,
      rosterPeopleCount: batch.people.length,
    });
    return batch;
  }).pipe(withPlanningCenterRequestCount);

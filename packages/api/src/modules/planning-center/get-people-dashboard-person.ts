import {
  buildPersonMonthDays,
  countServiceDaysInWindow,
  formatShortDate,
  getMonthInfo,
  getMostCommonRoles,
  initialsFromName,
  mapScheduleToDashboardItems,
} from "@pcobooster/api/modules/planning-center/get-people-dashboard";
import type { ScheduleItem } from "@pcobooster/api/modules/planning-center/get-people-dashboard";
import type {
  PeopleDashboardLoad,
  PeopleDashboardPerson,
  PeopleDashboardPersonDetail,
} from "@pcobooster/api/modules/planning-center/people-dashboard-types";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import { recoverPlanningCenterFailure } from "@pcobooster/api/planning-center/recover-failure";
import {
  planningCenterRequestsSpent,
  PROGRESSIVE_REQUEST_BUDGET,
  withPlanningCenterRequestCount,
} from "@pcobooster/api/planning-center/request-budget";
import { cachedRead } from "@pcobooster/api/planning-center/services/cached-read";
import type { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import { PLAN_RANGE_MAX_PAGES } from "@pcobooster/api/planning-center/services/plans-service";
import type { PlanningCenterPlansService } from "@pcobooster/api/planning-center/services/plans-service";
import type { PlanningCenterReadCache } from "@pcobooster/api/planning-center/services/read-cache";
import {
  addCalendarDaysToDayKey,
  formatCalendarDateLabel,
  formatCalendarDayInTimeZone,
  zonedWallTimeToUtcIso,
} from "@pcobooster/planning-center-models/calendar";
import {
  buildFrequencyFromServiceHistory,
  isDeclinedAssignmentStatus,
} from "@pcobooster/planning-center-models/candidate-frequency";
import {
  isNonEmptyString,
  isString,
} from "@pcobooster/planning-center-models/json";
import type { JsonValue } from "@pcobooster/planning-center-models/json";
import type {
  PCRelationship,
  PCResource,
} from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

/** Five pages hold 500 schedules, far more than six months of anyone's serving. */
const PERSON_SCHEDULE_MAX_PAGES = 5;
const TREND_MONTH_COUNT = 6;
/** `countServiceDaysInWindow` looks this far either side of today. */
const CADENCE_WINDOW_DAYS = 90;
/** Planning Center compares `after` to an instant; one extra day absorbs any zone offset. */
const SCHEDULE_AFTER_MARGIN_DAYS = 1;
const MISSING_PLAN_TIMES_CONCURRENCY = 4;
/**
 * Plan-range reads leave room for this many plan-by-plan reads, the fallback for plans the ranges
 * missed (such as plans of another organization's service type) or could not afford.
 */
const DIRECT_PLAN_TIME_READS_RESERVE = 5;
const PEOPLE_DASHBOARD_PERSON_CACHE_TTL_MS = 2 * 60 * 1000;
const PEOPLE_DASHBOARD_PERSON_CACHE_VERSION = "v9";

type PeopleDashboardPersonReader = Pick<
  PlanningCenterPeopleService,
  | "getCacheScope"
  | "getPerson"
  | "getPersonPlanPeople"
  | "getPersonSchedulesAfter"
  | "getPlanPlanTimes"
>;

export interface PeopleDashboardPersonDependencies {
  readonly peopleService: PeopleDashboardPersonReader;
  readonly catalogService: Pick<
    PlanningCenterCatalogService,
    "getServiceTypesCached"
  >;
  readonly plansService: Pick<
    PlanningCenterPlansService,
    "getPlansWithIncludedInDateRange"
  >;
  readonly resolveTimeZone: Effect.Effect<string, PlanningCenterError>;
  /** Built pages, per isolate: see `ModuleReadCaches.peopleDashboardPerson`. */
  readonly detailCache: PlanningCenterReadCache<PeopleDashboardPersonDetail>;
}

type ScheduleReaders = Pick<
  PeopleDashboardPersonDependencies,
  "catalogService" | "peopleService" | "plansService"
>;

export interface PersonScheduleWindow {
  /** First org calendar day whose schedule items count. */
  readonly startDayKey: string;
  /** First org calendar day requested from Planning Center. */
  readonly afterDayKey: string;
  /**
   * Last day of the plan ranges read for rehearsal times, month aligned so people and months
   * share cached ranges. Later plans extend it.
   */
  readonly rangeEndDayKey: string;
  readonly orgTimeZone: string;
}

const getRelationshipIds = (data: PCRelationship["data"]): string[] => {
  if (data === undefined || data === null) {
    return [];
  }
  return Array.isArray(data)
    ? data.map((identifier) => identifier.id)
    : [data.id];
};

const formatMonthStartDayKey = (year: number, monthIndex: number) => {
  const date = new Date(Date.UTC(year, monthIndex, 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
};

const lastDayKeyOfMonth = (dayKey: string) => {
  const year = Number(dayKey.slice(0, 4));
  const month = Number(dayKey.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  return `${dayKey.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
};

/**
 * Person detail reads history for the six trend months and the 90-day cadence window around
 * today, whichever starts earlier, plus every later schedule.
 */
export const getPersonScheduleWindow = (
  monthInfo: Pick<PeopleDashboardPersonDetail["month"], "year" | "monthIndex">,
  now: Date,
  orgTimeZone: string
): PersonScheduleWindow => {
  const trendStartDayKey = formatMonthStartDayKey(
    monthInfo.year,
    monthInfo.monthIndex - (TREND_MONTH_COUNT - 1)
  );
  const todayDayKey = formatCalendarDayInTimeZone(now, orgTimeZone);
  const cadenceStartDayKey = addCalendarDaysToDayKey(
    todayDayKey,
    -CADENCE_WINDOW_DAYS,
    orgTimeZone
  );
  const startDayKey =
    trendStartDayKey < cadenceStartDayKey
      ? trendStartDayKey
      : cadenceStartDayKey;
  const monthEndDayKey = lastDayKeyOfMonth(
    formatMonthStartDayKey(monthInfo.year, monthInfo.monthIndex)
  );
  const cadenceEndDayKey = lastDayKeyOfMonth(
    addCalendarDaysToDayKey(todayDayKey, CADENCE_WINDOW_DAYS, orgTimeZone)
  );
  return {
    startDayKey,
    afterDayKey: addCalendarDaysToDayKey(
      startDayKey,
      -SCHEDULE_AFTER_MARGIN_DAYS,
      orgTimeZone
    ),
    rangeEndDayKey:
      monthEndDayKey > cadenceEndDayKey ? monthEndDayKey : cadenceEndDayKey,
    orgTimeZone,
  };
};

interface PlansMissingTimes {
  readonly latestPlanDayKey: string;
  /** Missing time IDs a range read of this service type could resolve. */
  readonly missingTimes: number;
}

/**
 * `include=plan_times` sideloads only service PlanTimes: a schedule lists its rehearsal times in
 * `relationships.times` without their resources. Returns the missing time IDs and, per service
 * type, the latest plan day that needs them.
 */
const findMissingPlanTimes = (
  schedules: PCResource[],
  included: PCResource[],
  orgTimeZone: string
) => {
  const sideloaded = new Set<string>();
  for (const resource of included) {
    if (resource.type === "PlanTime") {
      sideloaded.add(resource.id);
    }
  }
  const missingTimeIds = new Set<string>();
  const byServiceType = new Map<string, PlansMissingTimes>();
  for (const schedule of schedules) {
    const missing = getRelationshipIds(
      schedule.relationships?.times?.data
    ).filter((id) => !sideloaded.has(id));
    const [serviceTypeId] = getRelationshipIds(
      schedule.relationships?.service_type?.data
    );
    const sortDate = schedule.attributes.sort_date;
    if (missing.length === 0) {
      continue;
    }
    for (const id of missing) {
      missingTimeIds.add(id);
    }
    if (
      !isNonEmptyString(serviceTypeId) ||
      !isNonEmptyString(sortDate) ||
      Number.isNaN(new Date(sortDate).getTime())
    ) {
      continue;
    }
    const planDayKey = formatCalendarDayInTimeZone(
      new Date(sortDate),
      orgTimeZone
    );
    const known = byServiceType.get(serviceTypeId);
    byServiceType.set(serviceTypeId, {
      latestPlanDayKey:
        known === undefined || planDayKey > known.latestPlanDayKey
          ? planDayKey
          : known.latestPlanDayKey,
      missingTimes: (known?.missingTimes ?? 0) + missing.length,
    });
  }
  return { byServiceType, missingTimeIds };
};

const planIdsWithUnresolvedTimes = (
  schedules: PCResource[],
  unresolvedTimeIds: Set<string>
): string[] => {
  const planIds = new Set<string>();
  for (const schedule of schedules) {
    const [planId] = getRelationshipIds(schedule.relationships?.plan?.data);
    const unresolved = getRelationshipIds(
      schedule.relationships?.times?.data
    ).some((id) => unresolvedTimeIds.has(id));
    if (isNonEmptyString(planId) && unresolved) {
      planIds.add(planId);
    }
  }
  return [...planIds];
};

interface ResolvedPlanTimes {
  readonly included: PCResource[];
  /** Rehearsal (and other) times left out to stay within the request budget. */
  readonly unresolvedTimes: number;
}

/**
 * Resolves rehearsal PlanTimes with one cached plan-range read per service type (shared by every
 * person and month in that range), then reads a plan's own times when the ranges lack them, all
 * within `PROGRESSIVE_REQUEST_BUDGET` counted requests. Ranges go to the service types missing
 * the most times, and leave room for plan-by-plan reads. Times that still do not fit date their
 * assignment by its plan and are counted in `unresolvedTimes`. A service type or plan Planning
 * Center does not find contributes no times; any other failure fails the read.
 */
const resolveMissingPlanTimes = (
  schedules: PCResource[],
  included: PCResource[],
  window: PersonScheduleWindow,
  dependencies: ScheduleReaders
): Effect.Effect<ResolvedPlanTimes, PlanningCenterError> => {
  const { byServiceType, missingTimeIds } = findMissingPlanTimes(
    schedules,
    included,
    window.orgTimeZone
  );
  if (missingTimeIds.size === 0) {
    return Effect.succeed({ included, unresolvedTimes: 0 });
  }
  return Effect.gen(function* readMissingPlanTimes() {
    const beforeRanges = yield* planningCenterRequestsSpent;
    const rangeSlots = Math.max(
      0,
      Math.floor(
        (PROGRESSIVE_REQUEST_BUDGET -
          beforeRanges -
          DIRECT_PLAN_TIME_READS_RESERVE) /
          PLAN_RANGE_MAX_PAGES
      )
    );
    const rangeServiceTypes = [...byServiceType.entries()]
      .toSorted(([, a], [, b]) => b.missingTimes - a.missingTimes)
      .slice(0, rangeSlots);
    const ranges = yield* Effect.forEach(
      rangeServiceTypes,
      ([serviceTypeId, { latestPlanDayKey }]) =>
        dependencies.plansService
          .getPlansWithIncludedInDateRange(
            serviceTypeId,
            window.afterDayKey,
            latestPlanDayKey > window.rangeEndDayKey
              ? lastDayKeyOfMonth(latestPlanDayKey)
              : window.rangeEndDayKey,
            "plan_times",
            window.orgTimeZone
          )
          .pipe(
            Effect.map((response) => response.included),
            recoverPlanningCenterFailure({
              kinds: ["not-found"],
              reason:
                "Service type not found; its schedules keep their plan dates without rehearsal times",
              details: { serviceTypeId },
              fallback: (): PCResource[] => [],
            })
          ),
      { concurrency: MISSING_PLAN_TIMES_CONCURRENCY }
    );
    const resolved = new Map<string, PCResource>();
    for (const resource of ranges.flat()) {
      if (resource.type === "PlanTime" && missingTimeIds.has(resource.id)) {
        resolved.set(resource.id, resource);
      }
    }
    const unresolvedAfterRanges = new Set(
      [...missingTimeIds].filter((id) => !resolved.has(id))
    );
    const afterRanges = yield* planningCenterRequestsSpent;
    const direct = yield* Effect.forEach(
      planIdsWithUnresolvedTimes(schedules, unresolvedAfterRanges).slice(
        0,
        Math.max(0, PROGRESSIVE_REQUEST_BUDGET - afterRanges)
      ),
      (planId) => dependencies.peopleService.getPlanPlanTimes(planId),
      { concurrency: MISSING_PLAN_TIMES_CONCURRENCY }
    );
    for (const resource of direct.flat()) {
      if (
        resource.type === "PlanTime" &&
        unresolvedAfterRanges.has(resource.id)
      ) {
        resolved.set(resource.id, resource);
      }
    }
    return {
      included: [...included, ...resolved.values()],
      unresolvedTimes: missingTimeIds.size - resolved.size,
    };
  });
};

const readIncludedName = (
  included: PCResource[],
  type: string,
  id: string | undefined
): string | null => {
  const name = included.find(
    (resource) => resource.type === type && resource.id === id
  )?.attributes.name;
  return isString(name) ? name : null;
};

const readString = (value: JsonValue | undefined): string =>
  isString(value) ? value : "";

type ResourceCollection = Effect.Success<
  ReturnType<PeopleDashboardPersonReader["getPersonPlanPeople"]>
>;

/**
 * Planning Center leaves requests that were prepared but not sent out of a person's schedules,
 * while plan rosters (and so candidate scoring) count them. The person's plan people list the
 * upcoming ones; they are shaped as schedules so both share one mapping.
 */
const getPendingRequestSchedules = (
  planPeople: ResourceCollection,
  schedules: PCResource[],
  catalogService: ScheduleReaders["catalogService"]
): Effect.Effect<PCResource[], PlanningCenterError> => {
  const scheduledPlanPersonIds = new Set(
    schedules.map(
      (schedule) =>
        getRelationshipIds(schedule.relationships?.plan_person?.data)[0] ??
        schedule.id
    )
  );
  const pending = planPeople.data.filter(
    (planPerson) =>
      !scheduledPlanPersonIds.has(planPerson.id) &&
      !isDeclinedAssignmentStatus(readString(planPerson.attributes.status))
  );
  if (pending.length === 0) {
    return Effect.succeed([]);
  }
  return catalogService.getServiceTypesCached().pipe(
    Effect.map((serviceTypes) =>
      pending.map((planPerson): PCResource => {
        const { attributes, relationships } = planPerson;
        const [planId] = getRelationshipIds(relationships?.plan?.data);
        const [teamId] = getRelationshipIds(relationships?.team?.data);
        const [serviceTypeId] = getRelationshipIds(
          relationships?.service_type?.data
        );
        const plan = planPeople.included.find(
          (resource) => resource.type === "Plan" && resource.id === planId
        );
        return {
          type: "Schedule",
          id: planPerson.id,
          attributes: {
            sort_date: plan?.attributes.sort_date ?? null,
            status: readString(attributes.status),
            team_position_name: readString(attributes.team_position_name),
            team_name: readIncludedName(planPeople.included, "Team", teamId),
            service_type_name: readIncludedName(
              serviceTypes,
              "ServiceType",
              serviceTypeId
            ),
          },
          relationships: {
            plan: relationships?.plan ?? { data: null },
            plan_person: { data: { type: "PlanPerson", id: planPerson.id } },
            service_type: relationships?.service_type ?? { data: null },
            times: relationships?.times ?? { data: [] },
          },
        };
      })
    )
  );
};

/**
 * The person's own schedule items in the window. Planning Center's default schedule scope is
 * future only, so the explicit `after` filter is what brings in past services. Declined requests
 * are excluded by that endpoint and again here.
 */
const getPersonScheduleItems = (
  personId: string,
  window: PersonScheduleWindow,
  dependencies: ScheduleReaders
): Effect.Effect<
  { readonly items: ScheduleItem[]; readonly unresolvedTimes: number },
  PlanningCenterError
> =>
  Effect.gen(function* readPersonScheduleItems() {
    const [schedules, planPeople] = yield* Effect.all(
      [
        dependencies.peopleService.getPersonSchedulesAfter(
          personId,
          zonedWallTimeToUtcIso(
            window.afterDayKey,
            "00:00",
            window.orgTimeZone
          ),
          PERSON_SCHEDULE_MAX_PAGES
        ),
        dependencies.peopleService.getPersonPlanPeople(personId),
      ],
      { concurrency: "unbounded" }
    );
    const allSchedules = [
      ...schedules.data,
      ...(yield* getPendingRequestSchedules(
        planPeople,
        schedules.data,
        dependencies.catalogService
      )),
    ];
    const { included, unresolvedTimes } = yield* resolveMissingPlanTimes(
      allSchedules,
      schedules.included,
      window,
      dependencies
    );
    const items: ScheduleItem[] = [];
    for (const schedule of allSchedules) {
      for (const item of mapScheduleToDashboardItems(schedule, included)) {
        const inWindow =
          formatCalendarDayInTimeZone(item.date, window.orgTimeZone) >=
          window.startDayKey;
        if (inWindow && !isDeclinedAssignmentStatus(item.status)) {
          items.push(item);
        }
      }
    }
    return { items, unresolvedTimes };
  });

const dedupeScheduleItems = (items: ScheduleItem[]) => {
  const byKey = new Map<string, ScheduleItem>();
  for (const item of items) {
    const dayKey = item.date.toISOString();
    const key = [
      dayKey,
      item.timeType ?? "",
      item.teamPositionName || "",
      item.serviceTypeName ?? "",
      item.status || "",
    ].join(":");
    byKey.set(key, item);
  }
  return [...byKey.values()];
};

const buildMonthlyTrend = (
  items: ScheduleItem[],
  monthInfo: PeopleDashboardPersonDetail["month"],
  orgTimeZone: string
): PeopleDashboardPersonDetail["trend"] => {
  const monthKeys = Array.from({ length: TREND_MONTH_COUNT }, (_, index) => {
    // UTC noon on each org month's first day: a civil-date carrier, so read it in UTC.
    const date = new Date(
      Date.UTC(
        monthInfo.year,
        monthInfo.monthIndex - (TREND_MONTH_COUNT - 1) + index,
        1,
        12
      )
    );
    return {
      month: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      label: formatCalendarDateLabel(date, "UTC", "monthShort"),
      serviceDays: new Set<string>(),
      rehearsalDays: new Set<string>(),
    };
  });
  const byMonth = new Map(monthKeys.map((entry) => [entry.month, entry]));

  for (const item of items) {
    if (isDeclinedAssignmentStatus(item.status)) {
      continue;
    }
    const dayKey = formatCalendarDayInTimeZone(item.date, orgTimeZone);
    const month = dayKey.slice(0, 7);
    const bucket = byMonth.get(month);
    if (!bucket) {
      continue;
    }
    if (item.timeType === "rehearsal") {
      bucket.rehearsalDays.add(dayKey);
    } else {
      bucket.serviceDays.add(dayKey);
    }
  }

  return monthKeys.map((entry) => ({
    month: entry.month,
    label: entry.label,
    services: entry.serviceDays.size,
    rehearsals: [...entry.rehearsalDays].filter(
      (day) => !entry.serviceDays.has(day)
    ).length,
  }));
};

const parseMonthDate = (month: string | undefined, fallback: Date) => {
  if (!isNonEmptyString(month)) {
    return fallback;
  }
  const match = /^(?<year>\d{4})-(?<month>\d{2})$/u.exec(month);
  if (!match) {
    return fallback;
  }
  const year = Number(match.groups?.year);
  const monthNumber = Number(match.groups?.month);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    return fallback;
  }
  return new Date(Date.UTC(year, monthNumber - 1, 1, 12));
};

const shiftMonthKey = (year: number, monthIndex: number, delta: number) => {
  const date = new Date(Date.UTC(year, monthIndex + delta, 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const getTeams = (items: { teamName?: string }[]) => {
  const names = new Set<string>();
  for (const item of items) {
    if (isNonEmptyString(item.teamName)) {
      names.add(item.teamName);
    }
  }
  const teams = [...names];
  return teams.length > 0 ? teams.slice(0, 3) : ["Services"];
};

const getLoad = (
  monthCount: number,
  last90Days: number
): PeopleDashboardLoad => {
  if (monthCount >= 4) {
    return "rest";
  }
  if (monthCount >= 3 || last90Days >= 10) {
    return "high";
  }
  if (monthCount === 0 && last90Days <= 3) {
    return "low";
  }
  return "normal";
};

const getStatus = (
  load: PeopleDashboardLoad,
  monthCount: number,
  nextDate: Date | undefined
) => {
  if (load === "rest") {
    return "Needs rest";
  }
  if (load === "high") {
    return "High load";
  }
  if (monthCount === 0) {
    return nextDate ? "Upcoming" : "Underused";
  }
  return nextDate ? "Available soon" : "Recently served";
};

const getCadenceLabel = (thirtyDayCount: number, ninetyDayCount: number) => {
  if (thirtyDayCount > 0) {
    return `${thirtyDayCount} in 30 days`;
  }
  if (ninetyDayCount === 0) {
    return "No services in 90 days";
  }
  return `${ninetyDayCount} in 90 days`;
};

const getHighlight = (
  load: PeopleDashboardLoad,
  monthCount: number,
  nextDate: Date | undefined
) => {
  if (load === "rest") {
    return "Serving heavily this month.";
  }
  if (load === "high") {
    return "Above normal cadence for the selected range.";
  }
  if (load === "low") {
    return nextDate
      ? "Light recent load with an upcoming assignment."
      : "Light recent load and no current assignment.";
  }
  if (nextDate) {
    return "Healthy cadence with upcoming availability context.";
  }
  return monthCount > 0
    ? "Served recently and has room in the upcoming rotation."
    : "No current month services found.";
};

const buildDashboardPersonDetail = (
  personResource: PCResource,
  items: ScheduleItem[],
  now: Date,
  monthKey: string,
  orgTimeZone: string
): PeopleDashboardPerson => {
  const serviceHistory = items.toSorted(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  const frequency = buildFrequencyFromServiceHistory(
    serviceHistory,
    now,
    orgTimeZone
  );
  const monthItems = serviceHistory.filter(
    (item) =>
      formatCalendarDayInTimeZone(item.date, orgTimeZone).startsWith(
        monthKey
      ) &&
      (item.timeType === "service" || item.timeType === "rehearsal")
  );
  const serviceDaysThisMonth = new Set<string>();
  for (const item of monthItems) {
    if (item.timeType !== "rehearsal") {
      serviceDaysThisMonth.add(
        formatCalendarDayInTimeZone(item.date, orgTimeZone)
      );
    }
  }
  const monthDays = buildPersonMonthDays(monthItems, orgTimeZone);
  const thirtyDayCount = countServiceDaysInWindow(
    serviceHistory,
    now,
    orgTimeZone,
    30
  );
  const ninetyDayCount = countServiceDaysInWindow(
    serviceHistory,
    now,
    orgTimeZone,
    CADENCE_WINDOW_DAYS
  );
  const load = getLoad(serviceDaysThisMonth.size, ninetyDayCount);
  const firstName = isString(personResource.attributes.first_name)
    ? personResource.attributes.first_name
    : "";
  const lastName = isString(personResource.attributes.last_name)
    ? personResource.attributes.last_name
    : "";
  const name = `${firstName} ${lastName}`.trim();

  return {
    id: personResource.id,
    name: name || "Unknown person",
    initials: initialsFromName(name),
    photoThumbnailUrl: isString(personResource.attributes.photo_thumbnail_url)
      ? personResource.attributes.photo_thumbnail_url
      : null,
    teams: getTeams(serviceHistory),
    roles: getMostCommonRoles(serviceHistory),
    status: getStatus(
      load,
      serviceDaysThisMonth.size,
      frequency.nextUpcomingDate
    ),
    load,
    lastServed: formatShortDate(frequency.lastServedDate, orgTimeZone),
    lastRehearsal: formatShortDate(frequency.lastRehearsalDate, orgTimeZone),
    nextScheduled: formatShortDate(
      frequency.nextUpcomingDate,
      orgTimeZone,
      "Not scheduled"
    ),
    nextRehearsal: formatShortDate(
      frequency.nextRehearsalDate,
      orgTimeZone,
      "Not scheduled"
    ),
    monthCount: serviceDaysThisMonth.size,
    thirtyDayCount,
    ninetyDayCount,
    upcomingCount: frequency.upcomingServices,
    streak: getCadenceLabel(thirtyDayCount, ninetyDayCount),
    highlight: getHighlight(
      load,
      serviceDaysThisMonth.size,
      frequency.nextUpcomingDate
    ),
    monthDays,
  };
};

const buildPeopleDashboardPerson = ({
  personId,
  dependencies,
  now,
  monthKey,
  monthInfo,
  orgTimeZone,
}: {
  personId: string;
  dependencies: PeopleDashboardPersonDependencies;
  now: Date;
  monthKey: string;
  monthInfo: PeopleDashboardPersonDetail["month"];
  orgTimeZone: string;
}): Effect.Effect<PeopleDashboardPersonDetail, PlanningCenterError> =>
  Effect.map(
    Effect.all(
      [
        dependencies.peopleService.getPerson(personId),
        getPersonScheduleItems(
          personId,
          getPersonScheduleWindow(monthInfo, now, orgTimeZone),
          dependencies
        ),
      ],
      { concurrency: "unbounded" }
    ).pipe(
      Effect.flatMap(([personResource, scheduleItems]) =>
        planningCenterRequestsSpent.pipe(
          Effect.map((spent) => [personResource, scheduleItems, spent] as const)
        )
      )
    ),
    ([personResource, scheduleItems, spent]) => {
      const items = dedupeScheduleItems(scheduleItems.items);
      return {
        generatedAt: now.toISOString(),
        month: monthInfo,
        previousMonth: shiftMonthKey(monthInfo.year, monthInfo.monthIndex, -1),
        nextMonth: shiftMonthKey(monthInfo.year, monthInfo.monthIndex, 1),
        person: buildDashboardPersonDetail(
          personResource,
          items,
          now,
          monthKey,
          orgTimeZone
        ),
        trend: buildMonthlyTrend(items, monthInfo, orgTimeZone),
        requestBudget: {
          limit: PROGRESSIVE_REQUEST_BUDGET,
          planningCenterRequests: spent,
          unresolvedRehearsalTimes: scheduleItems.unresolvedTimes,
        },
      };
    }
  );

export const getPeopleDashboardPerson = ({
  personId,
  month,
  dependencies,
}: {
  personId: string;
  month?: string;
  dependencies: PeopleDashboardPersonDependencies;
}): Effect.Effect<PeopleDashboardPersonDetail, PlanningCenterError> =>
  dependencies.resolveTimeZone.pipe(
    Effect.flatMap((orgTimeZone) => {
      const now = new Date();
      const monthDate = parseMonthDate(month, now);
      const monthInfo = getMonthInfo(monthDate, orgTimeZone);
      const monthKey = `${monthInfo.year}-${String(monthInfo.monthIndex + 1).padStart(2, "0")}`;

      return cachedRead(
        dependencies.detailCache,
        [
          PEOPLE_DASHBOARD_PERSON_CACHE_VERSION,
          "people-dashboard-person",
          dependencies.peopleService.getCacheScope(),
          personId,
          monthKey,
          orgTimeZone,
        ].join(":"),
        PEOPLE_DASHBOARD_PERSON_CACHE_TTL_MS,
        () =>
          buildPeopleDashboardPerson({
            personId,
            dependencies,
            now,
            monthKey,
            monthInfo,
            orgTimeZone,
          })
      );
    }),
    withPlanningCenterRequestCount
  );

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
import { buildFrequencyFromServiceHistory } from "@pcobooster/api/modules/planning-center/people/history";
import {
  buildPlanSchedulingContext,
  isDeclinedRosterStatus,
} from "@pcobooster/api/modules/planning-center/plan-scheduling-context";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import { recoverUnlessInterrupted } from "@pcobooster/api/planning-center/recover-unless-interrupted";
import { cachedRead } from "@pcobooster/api/planning-center/services/cached-read";
import type { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import type { PlanningCenterPlansService } from "@pcobooster/api/planning-center/services/plans-service";
import { PlanningCenterReadCache } from "@pcobooster/api/planning-center/services/read-cache";
import { formatCalendarDayInTimeZone } from "@pcobooster/planning-center-models/calendar";
import {
  isNonEmptyString,
  isString,
} from "@pcobooster/planning-center-models/json";
import type { JsonValue } from "@pcobooster/planning-center-models/json";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

const PERSON_SCHEDULE_MAX_PAGES = 10;
const PEOPLE_DASHBOARD_PERSON_CACHE_TTL_MS = 2 * 60 * 1000;
const PEOPLE_DASHBOARD_PERSON_CACHE_VERSION = "v7";
const monthLabelFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});
const peopleDashboardPersonCache =
  new PlanningCenterReadCache<PeopleDashboardPersonDetail>();

type PeopleDashboardPersonReader = Pick<
  PlanningCenterPeopleService,
  | "getCacheScope"
  | "getPerson"
  | "getPersonSchedules"
  | "getPlanTeamMembers"
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
    "getPlansInDateRange"
  >;
  readonly resolveTimeZone: Effect.Effect<string>;
}

const getPersonSchedulesForDetail = (
  peopleService: Pick<PlanningCenterPeopleService, "getPersonSchedules">,
  personId: string
): Effect.Effect<
  { data: PCResource[]; included: PCResource[] },
  PlanningCenterError
> =>
  Effect.map(
    Effect.all(
      [
        peopleService.getPersonSchedules(
          personId,
          {},
          PERSON_SCHEDULE_MAX_PAGES
        ),
        peopleService.getPersonSchedules(
          personId,
          { order: "-starts_at" },
          PERSON_SCHEDULE_MAX_PAGES
        ),
      ],
      { concurrency: "unbounded" }
    ),
    ([upcoming, recent]) => {
      const byId = new Map<string, PCResource>();
      for (const schedule of [...upcoming.data, ...recent.data]) {
        byId.set(`${schedule.type}:${schedule.id}`, schedule);
      }

      const includedById = new Map<string, PCResource>();
      for (const resource of [...upcoming.included, ...recent.included]) {
        includedById.set(`${resource.type}:${resource.id}`, resource);
      }

      return {
        data: [...byId.values()],
        included: [...includedById.values()],
      };
    }
  );

const buildFallbackPlanTime = (plan: PCResource): PCResource => ({
  type: "PlanTime",
  id: `${plan.id}:sort-date`,
  attributes: {
    starts_at: plan.attributes.sort_date,
    time_type: "service",
  },
});

const buildPlanWorkspaceUrl = (serviceTypeId: string, planId: string) =>
  `/services/${encodeURIComponent(serviceTypeId)}/plans/${encodeURIComponent(planId)}/lineup`;

const readPlanTimeType = (
  value: JsonValue | undefined
): "service" | "rehearsal" | "other" => {
  if (value === "rehearsal" || value === "other") {
    return value;
  }
  return "service";
};

interface PlanRoster {
  data: PCResource[];
  included: PCResource[];
}

interface MonthRosterWindow {
  readonly personId: string;
  readonly orgTimeZone: string;
  readonly afterDayKey: string;
  readonly beforeDayKey: string;
}

const rosterItemsForPlan = (
  { personId, orgTimeZone, afterDayKey, beforeDayKey }: MonthRosterWindow,
  {
    serviceTypeId,
    serviceTypeName,
    plan,
    members,
    planTimes,
  }: {
    serviceTypeId: string;
    serviceTypeName: string;
    plan: PCResource;
    members: PlanRoster;
    planTimes: PCResource[];
  }
): ScheduleItem[] => {
  const context = buildPlanSchedulingContext({
    serviceTypeId,
    planId: plan.id,
    planTeamMembers: members.data,
    included: members.included ?? [],
  });
  const entries = context.rosterByPersonId.get(personId) ?? [];
  if (entries.length === 0) {
    return [];
  }

  const planItems =
    planTimes.length > 0 ? planTimes : [buildFallbackPlanTime(plan)];

  const items: ScheduleItem[] = [];
  for (const entry of entries) {
    if (isDeclinedRosterStatus(entry.status)) {
      continue;
    }
    for (const planTime of planItems) {
      const rawType = planTime.attributes.time_type;
      const timeType = readPlanTimeType(rawType);
      if (timeType === "other") {
        continue;
      }
      const startsAt = isString(planTime.attributes.starts_at)
        ? planTime.attributes.starts_at
        : plan.attributes.sort_date;
      if (!isString(startsAt)) {
        continue;
      }
      const date = new Date(startsAt);
      if (Number.isNaN(date.getTime())) {
        continue;
      }
      const dayKey = formatCalendarDayInTimeZone(date, orgTimeZone);
      if (dayKey < afterDayKey || dayKey > beforeDayKey) {
        continue;
      }
      items.push({
        id: `${plan.id}:${entry.planPersonId}:${planTime.id}`,
        sourceScheduleId: entry.planPersonId,
        date,
        teamPositionName: entry.positionName,
        teamName: entry.teamName ?? undefined,
        serviceTypeName,
        status: entry.rawStatus,
        planUrl: buildPlanWorkspaceUrl(serviceTypeId, plan.id),
        timeType,
      });
    }
  }
  return items;
};

/** Plans, rosters, and times we cannot read contribute no roster items. */
const getMonthRosterScheduleItems = (
  personId: string,
  monthInfo: PeopleDashboardPersonDetail["month"],
  orgTimeZone: string,
  dependencies: Pick<
    PeopleDashboardPersonDependencies,
    "catalogService" | "peopleService" | "plansService"
  >
): Effect.Effect<ScheduleItem[], PlanningCenterError> =>
  Effect.gen(function* readMonthRosterScheduleItems() {
    const window: MonthRosterWindow = {
      personId,
      orgTimeZone,
      afterDayKey: `${monthInfo.year}-${String(monthInfo.monthIndex + 1).padStart(2, "0")}-01`,
      beforeDayKey: `${monthInfo.year}-${String(monthInfo.monthIndex + 1).padStart(2, "0")}-${String(monthInfo.daysInMonth).padStart(2, "0")}`,
    };
    const serviceTypes =
      yield* dependencies.catalogService.getServiceTypesCached();
    const results = yield* Effect.forEach(
      serviceTypes,
      (serviceType) => {
        const serviceTypeId = serviceType.id;
        const rawServiceTypeName = serviceType.attributes.name;
        const serviceTypeName = isString(rawServiceTypeName)
          ? rawServiceTypeName
          : "";
        return dependencies.plansService
          .getPlansInDateRange(
            serviceTypeId,
            window.afterDayKey,
            window.beforeDayKey,
            orgTimeZone
          )
          .pipe(
            recoverUnlessInterrupted((): PCResource[] => []),
            Effect.flatMap((plans) =>
              Effect.forEach(
                plans,
                (plan) =>
                  Effect.map(
                    Effect.all(
                      [
                        dependencies.peopleService
                          .getPlanTeamMembers(serviceTypeId, plan.id)
                          .pipe(
                            recoverUnlessInterrupted((): PlanRoster => ({
                              data: [],
                              included: [],
                            }))
                          ),
                        dependencies.peopleService
                          .getPlanPlanTimes(plan.id)
                          .pipe(
                            recoverUnlessInterrupted((): PCResource[] => [])
                          ),
                      ],
                      { concurrency: "unbounded" }
                    ),
                    ([members, planTimes]) =>
                      rosterItemsForPlan(window, {
                        serviceTypeId,
                        serviceTypeName,
                        plan,
                        members,
                        planTimes,
                      })
                  ),
                { concurrency: "unbounded" }
              )
            ),
            Effect.map((itemsForPlans) => itemsForPlans.flat())
          );
      },
      { concurrency: "unbounded" }
    );

    return results.flat();
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
  schedules: PCResource[],
  included: PCResource[],
  extraItems: ScheduleItem[],
  monthInfo: PeopleDashboardPersonDetail["month"],
  orgTimeZone: string
): PeopleDashboardPersonDetail["trend"] => {
  const items = dedupeScheduleItems([
    ...schedules.flatMap((resource) =>
      mapScheduleToDashboardItems(resource, included)
    ),
    ...extraItems,
  ]);
  const monthKeys = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(
      Date.UTC(monthInfo.year, monthInfo.monthIndex - 5 + index, 1, 12)
    );
    return {
      month: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      label: monthLabelFormatter.format(date),
      serviceDays: new Set<string>(),
      rehearsalDays: new Set<string>(),
    };
  });
  const byMonth = new Map(monthKeys.map((entry) => [entry.month, entry]));

  for (const item of items) {
    const status = item.status.trim();
    const normalizedStatus = status.toLowerCase();
    if (status === "D" || normalizedStatus === "declined") {
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
  schedules: PCResource[],
  included: PCResource[],
  extraItems: ScheduleItem[],
  now: Date,
  monthKey: string,
  orgTimeZone: string
): PeopleDashboardPerson => {
  const serviceHistory = dedupeScheduleItems([
    ...schedules.flatMap((resource) =>
      mapScheduleToDashboardItems(resource, included)
    ),
    ...extraItems,
  ]);
  serviceHistory.sort((a, b) => a.date.getTime() - b.date.getTime());

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
    90
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
    lastServed: formatShortDate(frequency.lastServedDate),
    lastRehearsal: formatShortDate(frequency.lastRehearsalDate),
    nextScheduled: formatShortDate(frequency.nextUpcomingDate, "Not scheduled"),
    nextRehearsal: formatShortDate(
      frequency.nextRehearsalDate,
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
}): Effect.Effect<PeopleDashboardPersonDetail, PlanningCenterError> => {
  const { peopleService } = dependencies;
  return Effect.map(
    Effect.all(
      [
        peopleService.getPerson(personId),
        getPersonSchedulesForDetail(peopleService, personId),
        getMonthRosterScheduleItems(
          personId,
          monthInfo,
          orgTimeZone,
          dependencies
        ),
      ],
      { concurrency: "unbounded" }
    ),
    ([personResource, schedulesResponse, monthRosterItems]) => {
      const person = buildDashboardPersonDetail(
        personResource,
        schedulesResponse.data,
        schedulesResponse.included,
        monthRosterItems,
        now,
        monthKey,
        orgTimeZone
      );
      const trend = buildMonthlyTrend(
        schedulesResponse.data,
        schedulesResponse.included,
        monthRosterItems,
        monthInfo,
        orgTimeZone
      );

      return {
        generatedAt: now.toISOString(),
        month: monthInfo,
        previousMonth: shiftMonthKey(monthInfo.year, monthInfo.monthIndex, -1),
        nextMonth: shiftMonthKey(monthInfo.year, monthInfo.monthIndex, 1),
        person,
        trend,
        requestBudget: {
          scheduleRequests: 1,
          blockoutRequests: 0,
        },
      };
    }
  );
};

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
        peopleDashboardPersonCache,
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
    })
  );

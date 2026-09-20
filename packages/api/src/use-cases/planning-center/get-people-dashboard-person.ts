import { isNonEmptyString, isString } from "@worship-admin/api/json";
import type { JsonValue } from "@worship-admin/api/json";
import { formatCalendarDayInTimeZone } from "@worship-admin/api/planning-center/org-calendar";
import { resolveOrganizationTimeZone } from "@worship-admin/api/planning-center/resolve-organization-timezone";
import { planningCenterCatalogService } from "@worship-admin/api/planning-center/services/catalog-service";
import { planningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import type { PlanningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import { planningCenterPlansService } from "@worship-admin/api/planning-center/services/plans-service";
import { PlanningCenterReadCache } from "@worship-admin/api/planning-center/services/read-cache";
import type { PCResource } from "@worship-admin/api/types";
import {
  buildPersonMonthDays,
  countServiceDaysInWindow,
  formatShortDate,
  getMonthInfo,
  getMostCommonRoles,
  initialsFromName,
  mapScheduleToDashboardItems,
} from "@worship-admin/api/use-cases/planning-center/get-people-dashboard";
import type { ScheduleItem } from "@worship-admin/api/use-cases/planning-center/get-people-dashboard";
import type {
  PeopleDashboardLoad,
  PeopleDashboardPerson,
  PeopleDashboardPersonDetail,
} from "@worship-admin/api/use-cases/planning-center/people-dashboard-types";
import { buildFrequencyFromServiceHistory } from "@worship-admin/api/use-cases/planning-center/people/history";
import {
  buildPlanSchedulingContext,
  isDeclinedRosterStatus,
} from "@worship-admin/api/use-cases/planning-center/plan-scheduling-context";

const PERSON_SCHEDULE_MAX_PAGES = 10;
const PEOPLE_DASHBOARD_PERSON_CACHE_TTL_MS = 2 * 60 * 1000;
const PEOPLE_DASHBOARD_PERSON_CACHE_VERSION = "v7";
const monthLabelFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});
const peopleDashboardPersonCache =
  new PlanningCenterReadCache<PeopleDashboardPersonDetail>();

const getPersonSchedulesForDetail = async (
  peopleService: Pick<PlanningCenterPeopleService, "getPersonSchedules">,
  personId: string
) => {
  const [upcoming, recent] = await Promise.all([
    peopleService.getPersonSchedules(personId, {}, PERSON_SCHEDULE_MAX_PAGES),
    peopleService.getPersonSchedules(
      personId,
      { order: "-starts_at" },
      PERSON_SCHEDULE_MAX_PAGES
    ),
  ]);
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
};

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

const getMonthRosterScheduleItems = async (
  personId: string,
  monthInfo: PeopleDashboardPersonDetail["month"],
  orgTimeZone: string
): Promise<ScheduleItem[]> => {
  const afterDayKey = `${monthInfo.year}-${String(monthInfo.monthIndex + 1).padStart(2, "0")}-01`;
  const beforeDayKey = `${monthInfo.year}-${String(monthInfo.monthIndex + 1).padStart(2, "0")}-${String(monthInfo.daysInMonth).padStart(2, "0")}`;
  const serviceTypes =
    await planningCenterCatalogService.getServiceTypesCached();
  const results = await Promise.all(
    serviceTypes.map(async (serviceType) => {
      const serviceTypeId = serviceType.id;
      const rawServiceTypeName = serviceType.attributes.name;
      const serviceTypeName = isString(rawServiceTypeName)
        ? rawServiceTypeName
        : "";
      const plans = await planningCenterPlansService
        .getPlansInDateRange(serviceTypeId, afterDayKey, beforeDayKey)
        .catch(() => []);

      const itemsForPlans = await Promise.all(
        plans.map(async (plan) => {
          const [members, planTimes] = await Promise.all([
            planningCenterPeopleService
              .getPlanTeamMembers(serviceTypeId, plan.id)
              .catch(() => ({ data: [], included: [] })),
            planningCenterPeopleService
              .getPlanPlanTimes(plan.id)
              .catch(() => []),
          ]);
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
        })
      );

      return itemsForPlans.flat();
    })
  );

  return results.flat();
};

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

const buildPeopleDashboardPerson = async ({
  personId,
  peopleService,
  now,
  monthKey,
  monthInfo,
  orgTimeZone,
}: {
  personId: string;
  peopleService: Pick<
    PlanningCenterPeopleService,
    "getPerson" | "getPersonSchedules"
  >;
  now: Date;
  monthKey: string;
  monthInfo: PeopleDashboardPersonDetail["month"];
  orgTimeZone: string;
}): Promise<PeopleDashboardPersonDetail> => {
  const [personResource, schedulesResponse] = await Promise.all([
    peopleService.getPerson(personId),
    getPersonSchedulesForDetail(peopleService, personId),
  ]);
  const monthRosterItems =
    peopleService === planningCenterPeopleService
      ? await getMonthRosterScheduleItems(personId, monthInfo, orgTimeZone)
      : [];

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
};

export const getPeopleDashboardPerson = async ({
  personId,
  month,
  peopleService = planningCenterPeopleService,
}: {
  personId: string;
  month?: string;
  peopleService?: Pick<
    PlanningCenterPeopleService,
    "getPerson" | "getPersonSchedules"
  >;
}): Promise<PeopleDashboardPersonDetail> => {
  const orgTimeZone = await resolveOrganizationTimeZone();
  const now = new Date();
  const monthDate = parseMonthDate(month, now);
  const monthInfo = getMonthInfo(monthDate, orgTimeZone);
  const monthKey = `${monthInfo.year}-${String(monthInfo.monthIndex + 1).padStart(2, "0")}`;

  if (peopleService === planningCenterPeopleService) {
    return await peopleDashboardPersonCache.get(
      `${PEOPLE_DASHBOARD_PERSON_CACHE_VERSION}:people-dashboard-person:${personId}:${monthKey}`,
      PEOPLE_DASHBOARD_PERSON_CACHE_TTL_MS,
      async () =>
        await buildPeopleDashboardPerson({
          personId,
          peopleService,
          now,
          monthKey,
          monthInfo,
          orgTimeZone,
        })
    );
  }

  return await buildPeopleDashboardPerson({
    personId,
    peopleService,
    now,
    monthKey,
    monthInfo,
    orgTimeZone,
  });
};

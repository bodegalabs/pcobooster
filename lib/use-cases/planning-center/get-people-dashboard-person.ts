import { formatCalendarDayInTimeZone } from "@/lib/planning-center/org-calendar";
import { resolveOrganizationTimeZone } from "@/lib/planning-center/resolve-organization-timezone";
import { planningCenterCatalogService } from "@/lib/planning-center/services/catalog-service";
import { PlanningCenterPeopleService } from "@/lib/planning-center/services/people-service";
import { planningCenterPeopleService } from "@/lib/planning-center/services/people-service";
import { planningCenterPlansService } from "@/lib/planning-center/services/plans-service";
import { PlanningCenterReadCache } from "@/lib/planning-center/services/read-cache";
import type {
  PCResource,
  RawPerson,
  RawPlanPerson,
  RawSchedule,
} from "@/lib/types";
import {
  buildPersonMonthDays,
  countServiceDaysInWindow,
  formatShortDate,
  getMonthInfo,
  getMostCommonRoles,
  initialsFromName,
  mapScheduleToDashboardItems,
  type ScheduleItem,
} from "@/lib/use-cases/planning-center/get-people-dashboard";
import type {
  PeopleDashboardLoad,
  PeopleDashboardPerson,
  PeopleDashboardPersonDetail,
} from "@/lib/use-cases/planning-center/people-dashboard-types";
import { buildFrequencyFromServiceHistory } from "@/lib/use-cases/planning-center/people/history";
import {
  buildPlanSchedulingContext,
  isDeclinedRosterStatus,
} from "@/lib/use-cases/planning-center/plan-scheduling-context";

const PERSON_SCHEDULE_MAX_PAGES = 10;
const PEOPLE_DASHBOARD_PERSON_CACHE_TTL_MS = 2 * 60 * 1000;
const PEOPLE_DASHBOARD_PERSON_CACHE_VERSION = "v7";
const peopleDashboardPersonCache = new PlanningCenterReadCache();

export async function getPeopleDashboardPerson({
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
}): Promise<PeopleDashboardPersonDetail> {
  const orgTimeZone = await resolveOrganizationTimeZone();
  const now = new Date();
  const monthDate = parseMonthDate(month, now);
  const monthInfo = getMonthInfo(monthDate, orgTimeZone);
  const monthKey = `${monthInfo.year}-${String(monthInfo.monthIndex + 1).padStart(2, "0")}`;

  if (peopleService === planningCenterPeopleService) {
    return peopleDashboardPersonCache.get(
      `${PEOPLE_DASHBOARD_PERSON_CACHE_VERSION}:people-dashboard-person:${personId}:${monthKey}`,
      PEOPLE_DASHBOARD_PERSON_CACHE_TTL_MS,
      () =>
        buildPeopleDashboardPerson({
          personId,
          peopleService,
          now,
          monthKey,
          monthInfo,
          orgTimeZone,
        })
    );
  }

  return buildPeopleDashboardPerson({
    personId,
    peopleService,
    now,
    monthKey,
    monthInfo,
    orgTimeZone,
  });
}

async function buildPeopleDashboardPerson({
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
}): Promise<PeopleDashboardPersonDetail> {
  const [personResource, schedulesResponse] = await Promise.all([
    peopleService.getPerson(personId),
    getPersonSchedulesForDetail(peopleService, personId),
  ]);
  const monthRosterItems =
    peopleService === planningCenterPeopleService
      ? await getMonthRosterScheduleItems(personId, monthInfo, orgTimeZone)
      : [];

  const person = buildDashboardPersonDetail(
    personResource as unknown as RawPerson,
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

async function getPersonSchedulesForDetail(
  peopleService: Pick<PlanningCenterPeopleService, "getPersonSchedules">,
  personId: string
) {
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
}

async function getMonthRosterScheduleItems(
  personId: string,
  monthInfo: PeopleDashboardPersonDetail["month"],
  orgTimeZone: string
): Promise<ScheduleItem[]> {
  const afterDayKey = `${monthInfo.year}-${String(monthInfo.monthIndex + 1).padStart(2, "0")}-01`;
  const beforeDayKey = `${monthInfo.year}-${String(monthInfo.monthIndex + 1).padStart(2, "0")}-${String(monthInfo.daysInMonth).padStart(2, "0")}`;
  const serviceTypes =
    await planningCenterCatalogService.getServiceTypesCached();
  const results = await Promise.all(
    serviceTypes.map(async (serviceType) => {
      const serviceTypeId = serviceType.id;
      const rawServiceTypeName = serviceType.attributes.name;
      const serviceTypeName =
        typeof rawServiceTypeName === "string" ? rawServiceTypeName : "";
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
            planTeamMembers: members.data as RawPlanPerson[],
            included: members.included || [],
          });
          const entries = context.rosterByPersonId.get(personId) ?? [];
          if (entries.length === 0) return [];

          const planItems =
            planTimes.length > 0 ? planTimes : [buildFallbackPlanTime(plan)];

          return entries
            .filter((entry) => !isDeclinedRosterStatus(entry.status))
            .flatMap((entry) =>
              planItems.flatMap((planTime) => {
                const rawType = planTime.attributes.time_type;
                const timeType =
                  rawType === "rehearsal"
                    ? "rehearsal"
                    : rawType === "other"
                      ? "other"
                      : "service";
                if (timeType === "other") return [];
                const startsAt = planTime.attributes.starts_at;
                const date =
                  typeof startsAt === "string"
                    ? new Date(startsAt)
                    : new Date(plan.attributes.sort_date as string);
                if (Number.isNaN(date.getTime())) return [];
                const dayKey = formatCalendarDayInTimeZone(date, orgTimeZone);
                if (dayKey < afterDayKey || dayKey > beforeDayKey) return [];
                return [
                  {
                    id: `${plan.id}:${entry.planPersonId}:${planTime.id}`,
                    sourceScheduleId: entry.planPersonId,
                    date,
                    teamPositionName: entry.positionName,
                    teamName: entry.teamName || undefined,
                    serviceTypeName,
                    status: entry.rawStatus,
                    planUrl: buildPlanWorkspaceUrl(serviceTypeId, plan.id),
                    timeType,
                  } satisfies ScheduleItem,
                ];
              })
            );
        })
      );

      return itemsForPlans.flat();
    })
  );

  return results.flat();
}

function buildFallbackPlanTime(plan: PCResource): PCResource {
  return {
    type: "PlanTime",
    id: `${plan.id}:sort-date`,
    attributes: {
      starts_at: plan.attributes.sort_date,
      time_type: "service",
    },
  };
}

function buildPlanWorkspaceUrl(serviceTypeId: string, planId: string) {
  return `/services/${encodeURIComponent(serviceTypeId)}/plans/${encodeURIComponent(planId)}/lineup`;
}

function buildMonthlyTrend(
  schedules: PCResource[],
  included: PCResource[],
  extraItems: ScheduleItem[],
  monthInfo: PeopleDashboardPersonDetail["month"],
  orgTimeZone: string
): PeopleDashboardPersonDetail["trend"] {
  const items = dedupeScheduleItems([
    ...schedules.flatMap((resource) =>
      mapScheduleToDashboardItems(resource as unknown as RawSchedule, included)
    ),
    ...extraItems,
  ]);
  const monthKeys = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(
      Date.UTC(monthInfo.year, monthInfo.monthIndex - 5 + index, 1, 12)
    );
    return {
      month: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("en-US", {
        month: "short",
        timeZone: "UTC",
      }).format(date),
      serviceDays: new Set<string>(),
      rehearsalDays: new Set<string>(),
    };
  });
  const byMonth = new Map(monthKeys.map((entry) => [entry.month, entry]));

  for (const item of items) {
    const status = item.status.trim();
    const normalizedStatus = status.toLowerCase();
    if (status === "D" || normalizedStatus === "declined") continue;
    const dayKey = formatCalendarDayInTimeZone(item.date, orgTimeZone);
    const month = dayKey.slice(0, 7);
    const bucket = byMonth.get(month);
    if (!bucket) continue;
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
}

function buildDashboardPersonDetail(
  personResource: RawPerson,
  schedules: PCResource[],
  included: PCResource[],
  extraItems: ScheduleItem[],
  now: Date,
  monthKey: string,
  orgTimeZone: string
): PeopleDashboardPerson {
  const serviceHistory = dedupeScheduleItems([
    ...schedules.flatMap((resource) =>
      mapScheduleToDashboardItems(resource as unknown as RawSchedule, included)
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
  const serviceDaysThisMonth = new Set(
    monthItems
      .filter((item) => item.timeType !== "rehearsal")
      .map((item) => formatCalendarDayInTimeZone(item.date, orgTimeZone))
  );
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
  const name =
    `${personResource.attributes.first_name || ""} ${personResource.attributes.last_name || ""}`.trim();

  return {
    id: personResource.id,
    name: name || "Unknown person",
    initials: initialsFromName(name),
    photoThumbnailUrl: personResource.attributes.photo_thumbnail_url || null,
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
}

function dedupeScheduleItems(items: ScheduleItem[]) {
  const byKey = new Map<string, ScheduleItem>();
  for (const item of items) {
    const dayKey = item.date.toISOString();
    const key = [
      dayKey,
      item.timeType || "",
      item.teamPositionName || "",
      item.serviceTypeName || "",
      item.status || "",
    ].join(":");
    byKey.set(key, item);
  }
  return [...byKey.values()];
}

function parseMonthDate(month: string | undefined, fallback: Date) {
  if (!month) return fallback;
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return fallback;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    return fallback;
  }
  return new Date(Date.UTC(year, monthNumber - 1, 1, 12));
}

function shiftMonthKey(year: number, monthIndex: number, delta: number) {
  const date = new Date(Date.UTC(year, monthIndex + delta, 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getTeams(items: Array<{ teamName?: string }>) {
  const teams = [
    ...new Set(
      items
        .map((item) => item.teamName)
        .filter((team): team is string => !!team)
    ),
  ];
  return teams.length > 0 ? teams.slice(0, 3) : ["Services"];
}

function getLoad(monthCount: number, last90Days: number): PeopleDashboardLoad {
  if (monthCount >= 4) return "rest";
  if (monthCount >= 3 || last90Days >= 10) return "high";
  if (monthCount === 0 && last90Days <= 3) return "low";
  return "normal";
}

function getStatus(
  load: PeopleDashboardLoad,
  monthCount: number,
  nextDate: Date | undefined
) {
  if (load === "rest") return "Needs rest";
  if (load === "high") return "High load";
  if (monthCount === 0) return nextDate ? "Upcoming" : "Underused";
  return nextDate ? "Available soon" : "Recently served";
}

function getCadenceLabel(thirtyDayCount: number, ninetyDayCount: number) {
  if (thirtyDayCount > 0) return `${thirtyDayCount} in 30 days`;
  if (ninetyDayCount === 0) return "No services in 90 days";
  return `${ninetyDayCount} in 90 days`;
}

function getHighlight(
  load: PeopleDashboardLoad,
  monthCount: number,
  nextDate: Date | undefined
) {
  if (load === "rest") return "Serving heavily this month.";
  if (load === "high") return "Above normal cadence for the selected range.";
  if (load === "low")
    return nextDate
      ? "Light recent load with an upcoming assignment."
      : "Light recent load and no current assignment.";
  if (nextDate) return "Healthy cadence with upcoming availability context.";
  return monthCount > 0
    ? "Served recently and has room in the upcoming rotation."
    : "No current month services found.";
}

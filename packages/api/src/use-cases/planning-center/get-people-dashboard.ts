import { isNonEmptyString, isString } from "@worship-admin/api/json";
import {
  formatCalendarDayInTimeZone,
  orgCalendarDaysRefMinusItem,
} from "@worship-admin/api/planning-center/org-calendar";
import { resolveOrganizationTimeZone } from "@worship-admin/api/planning-center/resolve-organization-timezone";
import { planningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import type { PlanningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import { PlanningCenterReadCache } from "@worship-admin/api/planning-center/services/read-cache";
import { findIncluded } from "@worship-admin/api/planning-center/utils";
import type { PCResource } from "@worship-admin/api/types";
import type {
  PeopleDashboardData,
  PeopleDashboardDay,
  PeopleDashboardDayKind,
  PeopleDashboardLoad,
  PeopleDashboardPerson,
  PeopleDashboardRange,
} from "@worship-admin/api/use-cases/planning-center/people-dashboard-types";
import { buildFrequencyFromServiceHistory } from "@worship-admin/api/use-cases/planning-center/people/history";
import { mapWithConcurrency } from "@worship-admin/api/use-cases/planning-center/shared";

const SCHEDULE_CONCURRENCY = 4;
const SCHEDULE_MAX_PAGES = 6;
const PEOPLE_DASHBOARD_HYDRATION_LIMIT = 48;
const PEOPLE_DASHBOARD_CACHE_TTL_MS = 2 * 60 * 1000;
const PEOPLE_DASHBOARD_CACHE_VERSION = "v5";
type PeopleDashboardReader = Pick<
  PlanningCenterPeopleService,
  "getCacheScope" | "getAllPeopleFromTeams" | "getPersonSchedules"
>;
const peopleDashboardCache = new PlanningCenterReadCache<PeopleDashboardData>();
const monthLabelFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

interface RosterPerson {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  initials: string;
  photoThumbnailUrl: string | null;
  teams: Set<string>;
}

export interface ScheduleItem {
  id: string;
  sourceScheduleId: string;
  date: Date;
  teamPositionName: string;
  teamName?: string;
  serviceTypeName?: string;
  planTitle?: string;
  status: string;
  planUrl?: string;
  timeType?: "service" | "rehearsal" | "other";
}

const normalizeHydrationLimit = (limit: number) => {
  if (!Number.isFinite(limit)) {
    return PEOPLE_DASHBOARD_HYDRATION_LIMIT;
  }
  return Math.max(0, Math.floor(limit));
};

const getRelatedPerson = (resource: PCResource, included: PCResource[]) => {
  const personRel = resource.relationships?.person?.data;
  const personId = Array.isArray(personRel) ? personRel[0]?.id : personRel?.id;
  return isNonEmptyString(personId)
    ? findIncluded(included, "Person", personId)
    : undefined;
};

const getResourceTeamName = (
  resource: PCResource,
  included: PCResource[]
): string | null => {
  const teamRel = resource.relationships?.team?.data;
  const teamId = Array.isArray(teamRel) ? teamRel[0]?.id : teamRel?.id;
  const team = isNonEmptyString(teamId)
    ? findIncluded(included, "Team", teamId)
    : undefined;
  const rawName = team?.attributes.name ?? resource.attributes.team_name;
  return isString(rawName) && rawName.trim() ? rawName : null;
};

const getRelationshipIds = (
  relationship: { data?: { id: string } | { id: string }[] | null } | undefined
): string[] => {
  const data = relationship?.data;
  if (!data) {
    return [];
  }
  return Array.isArray(data) ? data.map((item) => item.id) : [data.id];
};

const getSingleRelationshipId = (
  relationship: { data?: { id: string } | { id: string }[] | null } | undefined
) => getRelationshipIds(relationship)[0];

const buildPlanWorkspaceUrl = (serviceTypeId: string, planId: string) =>
  `/services/${encodeURIComponent(serviceTypeId)}/plans/${encodeURIComponent(planId)}/lineup`;

export const mapScheduleToDashboardItems = (
  schedule: PCResource,
  included: PCResource[]
): ScheduleItem[] => {
  const fallbackDate = isNonEmptyString(schedule.attributes.sort_date)
    ? new Date(schedule.attributes.sort_date)
    : new Date();
  const planTimeIds = getRelationshipIds(schedule.relationships?.plan_times);
  const timeIds = getRelationshipIds(schedule.relationships?.times);
  const ids = [...new Set([...planTimeIds, ...timeIds])];

  const planId = getSingleRelationshipId(schedule.relationships?.plan);
  const serviceTypeId = getSingleRelationshipId(
    schedule.relationships?.service_type
  );
  const planUrl =
    planId && serviceTypeId
      ? buildPlanWorkspaceUrl(serviceTypeId, planId)
      : undefined;

  const buildItem = (
    id: string,
    date: Date,
    timeType?: "service" | "rehearsal" | "other"
  ) => ({
    id,
    sourceScheduleId: schedule.id,
    date,
    teamPositionName: isString(schedule.attributes.team_position_name)
      ? schedule.attributes.team_position_name
      : "",
    teamName: isString(schedule.attributes.team_name)
      ? schedule.attributes.team_name
      : undefined,
    serviceTypeName: isString(schedule.attributes.service_type_name)
      ? schedule.attributes.service_type_name
      : undefined,
    status: isString(schedule.attributes.status)
      ? schedule.attributes.status
      : "",
    planUrl,
    timeType,
  });

  if (ids.length === 0) {
    return [buildItem(schedule.id, fallbackDate, "service")];
  }

  return ids.flatMap((id) => {
    const planTime = findIncluded(included, "PlanTime", id);
    const rawType = planTime?.attributes.time_type;
    const timeType =
      rawType === "service" || rawType === "rehearsal" || rawType === "other"
        ? rawType
        : undefined;
    if (timeType === "other") {
      return [];
    }
    const startsAt = planTime?.attributes.starts_at;
    const date = isString(startsAt) ? new Date(startsAt) : fallbackDate;
    return [buildItem(`${schedule.id}:${id}`, date, timeType)];
  });
};

const isConfirmedStatus = (status: string | undefined) => {
  const raw = (status ?? "").trim();
  const normalized = raw.toLowerCase();
  return raw === "C" || normalized === "confirmed";
};

const buildMonthDays = (
  people: PeopleDashboardPerson[]
): PeopleDashboardDay[] =>
  Array.from({ length: 31 }, (_, index) => {
    const day = index + 1;
    return {
      day,
      serviceCount: people.filter((person) =>
        person.monthDays.some(
          (entry) => entry.day === day && entry.kind === "service"
        )
      ).length,
      confirmedServiceCount: people.filter((person) =>
        person.monthDays.some(
          (entry) =>
            entry.day === day &&
            entry.kind === "service" &&
            isConfirmedStatus(entry.status)
        )
      ).length,
      potentialServiceCount: people.filter((person) =>
        person.monthDays.some(
          (entry) =>
            entry.day === day &&
            entry.kind === "service" &&
            !isConfirmedStatus(entry.status)
        )
      ).length,
      rehearsalCount: people.filter((person) =>
        person.monthDays.some(
          (entry) => entry.day === day && entry.kind === "rehearsal"
        )
      ).length,
      blockoutCount: people.filter((person) =>
        person.monthDays.some(
          (entry) => entry.day === day && entry.kind === "blockout"
        )
      ).length,
    };
  });

const pickDisplayStatus = (statuses: Set<string>) => {
  const values = [...statuses];
  return values.find(isConfirmedStatus) ?? values[0];
};

const dayKindRank = (kind: PeopleDashboardDayKind) => {
  if (kind === "service") {
    return 0;
  }
  if (kind === "rehearsal") {
    return 1;
  }
  if (kind === "blockout") {
    return 2;
  }
  return 3;
};

export const buildPersonMonthDays = (
  items: ScheduleItem[],
  orgTimeZone: string
): PeopleDashboardPerson["monthDays"] => {
  const byDay = new Map<
    string,
    {
      day: number;
      kind: PeopleDashboardDayKind;
      positions: Set<string>;
      serviceTypes: Set<string>;
      statuses: Set<string>;
      serviceStatuses: Set<string>;
      planUrls: Set<string>;
    }
  >();
  for (const item of items) {
    const dayKey = formatCalendarDayInTimeZone(item.date, orgTimeZone);
    const day = Number(dayKey.slice(-2));
    const kind = item.timeType === "rehearsal" ? "rehearsal" : "service";
    const key = [
      day,
      kind,
      item.status || "",
      item.teamPositionName || "",
      item.serviceTypeName ?? "",
    ].join(":");
    const existing = byDay.get(key);
    const next = existing ?? {
      day,
      kind,
      positions: new Set<string>(),
      serviceTypes: new Set<string>(),
      statuses: new Set<string>(),
      serviceStatuses: new Set<string>(),
      planUrls: new Set<string>(),
    };
    if (kind === "service") {
      next.kind = "service";
    }
    if (item.teamPositionName) {
      next.positions.add(item.teamPositionName);
    }
    if (isNonEmptyString(item.serviceTypeName)) {
      next.serviceTypes.add(item.serviceTypeName);
    }
    if (item.status) {
      next.statuses.add(item.status);
    }
    if (kind === "service" && item.status) {
      next.serviceStatuses.add(item.status);
    }
    if (isNonEmptyString(item.planUrl)) {
      next.planUrls.add(item.planUrl);
    }
    byDay.set(key, next);
  }
  return [...byDay.values()]
    .map((value) => ({
      day: value.day,
      kind: value.kind,
      positionName: [...value.positions].join(", ") || undefined,
      serviceTypeName: [...value.serviceTypes].join(", ") || undefined,
      status: pickDisplayStatus(
        value.kind === "service" ? value.serviceStatuses : value.statuses
      ),
      planUrl: [...value.planUrls][0],
    }))
    .toSorted(
      (a, b) => a.day - b.day || dayKindRank(a.kind) - dayKindRank(b.kind)
    );
};

export const getMonthInfo = (date: Date, orgTimeZone: string) => {
  const dayKey = formatCalendarDayInTimeZone(date, orgTimeZone);
  const year = Number(dayKey.slice(0, 4));
  const month = Number(dayKey.slice(5, 7));
  const monthIndex = month - 1;
  const first = new Date(Date.UTC(year, monthIndex, 1, 12));
  const daysInMonth = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  return {
    year,
    monthIndex,
    label: monthLabelFormatter.format(first),
    daysInMonth,
    startsOnWeekday: first.getUTCDay(),
  };
};

const getServiceMatrixDays = (monthDays: PeopleDashboardDay[]) => {
  const days: number[] = [];
  for (const day of monthDays) {
    if (day.serviceCount > 0) {
      days.push(day.day);
    }
    if (days.length === 5) {
      break;
    }
  }
  return days.length > 0 ? days : monthDays.slice(0, 5).map((day) => day.day);
};

const countKnownTeamRequests = (rosterPeople: RosterPerson[]) => {
  const teamNames = new Set<string>();
  for (const person of rosterPeople) {
    for (const team of person.teams) {
      teamNames.add(team);
    }
  }
  return teamNames.size;
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

const loadRank = (load: PeopleDashboardLoad) => {
  if (load === "rest") {
    return 4;
  }
  if (load === "high") {
    return 3;
  }
  if (load === "normal") {
    return 2;
  }
  return 1;
};

const getStatus = (
  load: PeopleDashboardLoad,
  monthCount: number,
  nextDate: Date | undefined
): string => {
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

export const getMostCommonRoles = (items: ScheduleItem[]) => {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.teamPositionName.trim()) {
      continue;
    }
    counts.set(
      item.teamPositionName,
      (counts.get(item.teamPositionName) ?? 0) + 1
    );
  }
  const roles = [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([role]) => role);
  return roles.length > 0 ? roles.join(", ") : "No recent role";
};

export const formatShortDate = (date: Date | undefined, fallback = "—") => {
  if (!date || Number.isNaN(date.getTime())) {
    return fallback;
  }
  return shortDateFormatter.format(date);
};

export const countServiceDaysInWindow = (
  items: ScheduleItem[],
  referenceDate: Date,
  orgTimeZone: string,
  days: number
) => {
  const refDayKey = formatCalendarDayInTimeZone(referenceDate, orgTimeZone);
  const serviceDays = new Set<string>();
  for (const item of items) {
    if (item.timeType === "rehearsal") {
      continue;
    }
    const status = item.status.trim();
    const normalizedStatus = status.toLowerCase();
    if (status === "D" || normalizedStatus === "declined") {
      continue;
    }
    const dayKey = formatCalendarDayInTimeZone(item.date, orgTimeZone);
    if (Math.abs(orgCalendarDaysRefMinusItem(dayKey, refDayKey)) <= days) {
      serviceDays.add(dayKey);
    }
  }
  return serviceDays.size;
};

const buildDashboardPerson = (
  person: RosterPerson,
  schedules: PCResource[],
  included: PCResource[],
  now: Date,
  orgTimeZone: string
): PeopleDashboardPerson => {
  const serviceHistory = schedules.flatMap((resource) =>
    mapScheduleToDashboardItems(resource, included)
  );
  serviceHistory.sort((a, b) => a.date.getTime() - b.date.getTime());

  const frequency = buildFrequencyFromServiceHistory(
    serviceHistory,
    now,
    orgTimeZone
  );
  const nowDayKey = formatCalendarDayInTimeZone(now, orgTimeZone);
  const monthPrefix = nowDayKey.slice(0, 8);
  const monthItems = serviceHistory.filter(
    (item) =>
      formatCalendarDayInTimeZone(item.date, orgTimeZone).startsWith(
        monthPrefix
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
  const roles = getMostCommonRoles(serviceHistory);
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

  return {
    id: person.id,
    name: person.name || "Unknown person",
    initials: person.initials,
    photoThumbnailUrl: person.photoThumbnailUrl,
    teams: person.teams.size > 0 ? [...person.teams].slice(0, 3) : ["Services"],
    roles,
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

export const initialsFromName = (name: string) => {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) {
    return "WA";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
};

const buildRosterPeople = (
  people: PCResource[],
  included: PCResource[],
  teamNamesByPersonId = new Map<string, Set<string>>()
): RosterPerson[] => {
  const peopleById = new Map<string, RosterPerson>();

  for (const resource of people) {
    const personResource =
      resource.type === "Person"
        ? resource
        : getRelatedPerson(resource, included);
    if (!personResource) {
      continue;
    }

    if (isNonEmptyString(personResource.attributes.archived_at)) {
      continue;
    }

    const firstName = isString(personResource.attributes.first_name)
      ? personResource.attributes.first_name
      : "";
    const lastName = isString(personResource.attributes.last_name)
      ? personResource.attributes.last_name
      : "";
    const name = `${firstName} ${lastName}`.trim();
    const existing = peopleById.get(personResource.id);
    const person = existing ?? {
      id: personResource.id,
      firstName,
      lastName,
      name,
      initials: initialsFromName(name),
      photoThumbnailUrl: isString(personResource.attributes.photo_thumbnail_url)
        ? personResource.attributes.photo_thumbnail_url
        : null,
      teams: new Set<string>(),
    };

    for (const teamName of teamNamesByPersonId.get(personResource.id) ?? []) {
      person.teams.add(teamName);
    }

    const teamName = getResourceTeamName(resource, included);
    if (isNonEmptyString(teamName)) {
      person.teams.add(teamName);
    }
    peopleById.set(personResource.id, person);
  }

  return [...peopleById.values()].toSorted((a, b) => {
    const byLast = a.lastName.localeCompare(b.lastName);
    if (byLast !== 0) {
      return byLast;
    }
    return a.firstName.localeCompare(b.firstName);
  });
};

const buildPeopleDashboard = async ({
  range,
  peopleService,
  maxHydratedPeople,
  orgTimeZone,
}: {
  range: PeopleDashboardRange;
  peopleService: PeopleDashboardReader;
  maxHydratedPeople: number;
  orgTimeZone: string;
}): Promise<PeopleDashboardData> => {
  const now = new Date();
  const monthInfo = getMonthInfo(now, orgTimeZone);
  const rosterResponse = await peopleService.getAllPeopleFromTeams();
  const rosterPeople = buildRosterPeople(
    rosterResponse.people,
    rosterResponse.included,
    rosterResponse.teamNamesByPersonId
  );
  const hydrationLimit = normalizeHydrationLimit(maxHydratedPeople);
  const hydratedRoster = rosterPeople.slice(0, hydrationLimit);

  const hydratedPeople = await mapWithConcurrency(
    hydratedRoster,
    SCHEDULE_CONCURRENCY,
    async (person) => {
      const schedulesResponse = await peopleService
        .getPersonSchedules(person.id, {}, SCHEDULE_MAX_PAGES)
        .catch(() => ({ data: [], included: [] }));
      return buildDashboardPerson(
        person,
        schedulesResponse.data,
        schedulesResponse.included,
        now,
        orgTimeZone
      );
    }
  );

  hydratedPeople.sort((a, b) => {
    const byLoad = loadRank(b.load) - loadRank(a.load);
    if (byLoad !== 0) {
      return byLoad;
    }
    return b.monthCount - a.monthCount;
  });

  const monthDays = buildMonthDays(hydratedPeople);

  return {
    range,
    generatedAt: now.toISOString(),
    month: monthInfo,
    people: hydratedPeople,
    stats: {
      scheduledPeople: hydratedPeople.filter((person) => person.monthCount > 0)
        .length,
      highLoadPeople: hydratedPeople.filter(
        (person) => person.load === "high" || person.load === "rest"
      ).length,
      availableSoonPeople: hydratedPeople.filter(
        (person) =>
          person.load === "low" || person.nextScheduled === "Not scheduled"
      ).length,
    },
    monthDays,
    matrixDays: getServiceMatrixDays(monthDays),
    requestBudget: {
      teamRequests: countKnownTeamRequests(rosterPeople),
      scheduleRequests: hydratedRoster.length,
      blockoutRequests: 0,
      rosterPeopleCount: rosterPeople.length,
      hydratedPeopleCount: hydratedPeople.length,
      sampled: hydratedPeople.length < rosterPeople.length,
    },
  };
};

export const getPeopleDashboard = async ({
  range = "month",
  peopleService = planningCenterPeopleService,
  maxHydratedPeople = PEOPLE_DASHBOARD_HYDRATION_LIMIT,
  resolveTimeZone = resolveOrganizationTimeZone,
}: {
  range?: PeopleDashboardRange;
  peopleService?: PeopleDashboardReader;
  maxHydratedPeople?: number;
  resolveTimeZone?: typeof resolveOrganizationTimeZone;
} = {}): Promise<PeopleDashboardData> => {
  const orgTimeZone = await resolveTimeZone();
  return await peopleDashboardCache.get(
    [
      peopleService.getCacheScope(),
      PEOPLE_DASHBOARD_CACHE_VERSION,
      "people-dashboard",
      orgTimeZone,
      range,
      `limit:${normalizeHydrationLimit(maxHydratedPeople)}`,
    ].join(":"),
    PEOPLE_DASHBOARD_CACHE_TTL_MS,
    async () =>
      await buildPeopleDashboard({
        range,
        peopleService,
        maxHydratedPeople,
        orgTimeZone,
      })
  );
};

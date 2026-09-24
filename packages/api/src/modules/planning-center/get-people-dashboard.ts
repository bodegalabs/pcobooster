import { logger } from "@pcobooster/api/logger";
import type {
  PeopleDashboardActivity,
  PeopleDashboardActivityBatch,
  PeopleDashboardDayKind,
  PeopleDashboardLoad,
  PeopleDashboardRoster,
  PeopleDashboardRosterPerson,
} from "@pcobooster/api/modules/planning-center/people-dashboard-types";
import { buildFrequencyFromServiceHistory } from "@pcobooster/api/modules/planning-center/people/history";
import { PlanningCenterApiError } from "@pcobooster/api/planning-center/api-error";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import type { PlanningCenterPlansService } from "@pcobooster/api/planning-center/services/plans-service";
import { findIncluded } from "@pcobooster/api/planning-center/utils";
import {
  formatCalendarDateLabel,
  formatCalendarDayInTimeZone,
  orgCalendarDaysRefMinusItem,
} from "@pcobooster/planning-center-models/calendar";
import {
  isNonEmptyString,
  isString,
} from "@pcobooster/planning-center-models/json";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

/**
 * Planning Center requests one `people.dashboardActivity` call may make. The
 * Workers Free cap is 50 subrequests per invocation, and auth, D1, KV, and
 * flag reads use some of that, so Planning Center gets 40.
 */
export const PEOPLE_DASHBOARD_REQUEST_BUDGET = 40;
/** The organization time zone read, counted even when it is cached. */
const TIME_ZONE_REQUESTS = 1;
/**
 * 100 schedules per page. The busiest volunteer measured had 23 schedules in
 * the window, so one page is typical and two leave room for heavy servers.
 */
const SCHEDULE_MAX_PAGES = 2;
/** `getPlansWithIncludedInDateRange` reads at most 3 pages of 100 plans. */
const PLAN_RANGE_MAX_PAGES = 3;
/** Planning Center pages hold 100 records (`per_page=100`). */
const PAGE_SIZE = 100;
/** Workers allows 6 open connections per invocation; leave headroom. */
const READ_CONCURRENCY = 4;
/** The 90-day cadence counts, plus one day for the org-day boundary. */
const HISTORY_WINDOW_DAYS = 91;
/** Upcoming schedules and plans are read up to a year ahead. */
const FUTURE_WINDOW_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

const log = logger.for("planning-center/people-dashboard");

export interface PeopleDashboardRosterDependencies {
  readonly peopleService: Pick<
    PlanningCenterPeopleService,
    "getAllPeopleFromTeams"
  >;
  readonly resolveTimeZone: Effect.Effect<string>;
}

export interface PeopleDashboardActivityDependencies {
  readonly peopleService: Pick<
    PlanningCenterPeopleService,
    "getPersonSchedulesAfter"
  >;
  readonly plansService: Pick<
    PlanningCenterPlansService,
    "getPlansWithIncludedInDateRange"
  >;
  readonly resolveTimeZone: Effect.Effect<string>;
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
): PeopleDashboardActivity["monthDays"] => {
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
  // UTC noon on the org month's first day: a civil-date carrier, so read it in UTC.
  const first = new Date(Date.UTC(year, monthIndex, 1, 12));
  const daysInMonth = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  return {
    year,
    monthIndex,
    label: formatCalendarDateLabel(first, "UTC", "monthYear"),
    daysInMonth,
    startsOnWeekday: first.getUTCDay(),
  };
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

/** "Sep 9" for the org calendar day `date` falls on; `fallback` when there is no date. */
export const formatShortDate = (
  date: Date | undefined,
  orgTimeZone: string,
  fallback = "-"
) => {
  if (!date || Number.isNaN(date.getTime())) {
    return fallback;
  }
  return formatCalendarDateLabel(date, orgTimeZone, "monthDay");
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

const buildPersonActivity = (
  personId: string,
  schedules: PCResource[],
  included: PCResource[],
  now: Date,
  orgTimeZone: string
): PeopleDashboardActivity => {
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
    id: personId,
    roles,
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
  teamNamesByPersonId: Map<string, Set<string>>
): PeopleDashboardRosterPerson[] => {
  const rosterPeople = new Map<
    string,
    { firstName: string; lastName: string; person: PeopleDashboardRosterPerson }
  >();
  for (const resource of people) {
    if (
      resource.type !== "Person" ||
      rosterPeople.has(resource.id) ||
      isNonEmptyString(resource.attributes.archived_at)
    ) {
      continue;
    }
    const { first_name: rawFirstName, last_name: rawLastName } =
      resource.attributes;
    const firstName = isString(rawFirstName) ? rawFirstName : "";
    const lastName = isString(rawLastName) ? rawLastName : "";
    const name = `${firstName} ${lastName}`.trim();
    const teams = [...(teamNamesByPersonId.get(resource.id) ?? [])];
    const photo = resource.attributes.photo_thumbnail_url;
    rosterPeople.set(resource.id, {
      firstName,
      lastName,
      person: {
        id: resource.id,
        name: name || "Unknown person",
        initials: initialsFromName(name),
        photoThumbnailUrl: isString(photo) ? photo : null,
        teams: teams.length > 0 ? teams.slice(0, 3) : ["Services"],
      },
    });
  }

  return [...rosterPeople.values()]
    .toSorted(
      (a, b) =>
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName)
    )
    .map(({ person }) => person);
};

/** One read of every active team's members; no schedules. */
export const getPeopleDashboardRoster = ({
  peopleService,
  resolveTimeZone,
}: PeopleDashboardRosterDependencies): Effect.Effect<
  PeopleDashboardRoster,
  PlanningCenterError
> =>
  Effect.gen(function* readPeopleDashboardRoster() {
    const orgTimeZone = yield* resolveTimeZone;
    const now = new Date();
    const roster = yield* peopleService.getAllPeopleFromTeams();
    const people = buildRosterPeople(roster.people, roster.teamNamesByPersonId);
    log.info(
      { rosterPeopleCount: people.length },
      "People dashboard roster read"
    );
    return {
      generatedAt: now.toISOString(),
      month: getMonthInfo(now, orgTimeZone),
      people,
    };
  });

const pagesFor = (records: number) =>
  Math.max(1, Math.ceil(records / PAGE_SIZE));

interface PersonSchedules {
  readonly personId: string;
  readonly data: PCResource[];
  readonly included: PCResource[];
}

/**
 * Service types whose plans hold PlanTimes the schedules list but
 * `include=plan_times` left out (rehearsals), with the people who need them.
 */
export const findServiceTypesMissingPlanTimes = (
  people: readonly PersonSchedules[]
): Map<string, Set<string>> => {
  const personIdsByServiceType = new Map<string, Set<string>>();
  for (const { personId, data, included } of people) {
    const sideloaded = new Set<string>();
    for (const resource of included) {
      if (resource.type === "PlanTime") {
        sideloaded.add(resource.id);
      }
    }
    for (const schedule of data) {
      const serviceTypeId = getSingleRelationshipId(
        schedule.relationships?.service_type
      );
      const missing = getRelationshipIds(schedule.relationships?.times).some(
        (id) => !sideloaded.has(id)
      );
      if (!missing || !isNonEmptyString(serviceTypeId)) {
        continue;
      }
      const personIds =
        personIdsByServiceType.get(serviceTypeId) ?? new Set<string>();
      personIds.add(personId);
      personIdsByServiceType.set(serviceTypeId, personIds);
    }
  }
  return personIdsByServiceType;
};

/**
 * Serving activity for a batch of roster people, within
 * `PEOPLE_DASHBOARD_REQUEST_BUDGET` Planning Center requests.
 *
 * Each person costs one schedule page (two at most), read from 91 days ago
 * onward. Rehearsal PlanTimes are then read per service type (one plan-range
 * page each, shared across the batch and cached for 5 minutes) instead of per
 * plan. People who cannot be finished within the budget come back in
 * `deferredPersonIds` for the caller's next call; failed reads fail the call.
 */
export const getPeopleDashboardActivity = ({
  personIds,
  dependencies: { peopleService, plansService, resolveTimeZone },
}: {
  personIds: readonly string[];
  dependencies: PeopleDashboardActivityDependencies;
}): Effect.Effect<PeopleDashboardActivityBatch, PlanningCenterError> =>
  Effect.gen(function* readPeopleDashboardActivity() {
    const orgTimeZone = yield* resolveTimeZone;
    const now = new Date();
    const afterDayKey = formatCalendarDayInTimeZone(
      new Date(now.getTime() - HISTORY_WINDOW_DAYS * DAY_MS),
      orgTimeZone
    );
    const beforeDayKey = formatCalendarDayInTimeZone(
      new Date(now.getTime() + FUTURE_WINDOW_DAYS * DAY_MS),
      orgTimeZone
    );
    const uniquePersonIds = [...new Set(personIds)];
    let remaining = PEOPLE_DASHBOARD_REQUEST_BUDGET - TIME_ZONE_REQUESTS;

    const admittedCount = Math.min(
      uniquePersonIds.length,
      Math.floor(remaining / SCHEDULE_MAX_PAGES)
    );
    const admitted = uniquePersonIds.slice(0, admittedCount);
    const deferred = new Set(uniquePersonIds.slice(admittedCount));
    const schedules = yield* Effect.forEach(
      admitted,
      (personId) =>
        Effect.map(
          peopleService.getPersonSchedulesAfter(
            personId,
            afterDayKey,
            SCHEDULE_MAX_PAGES
          ),
          ({ data, included }): PersonSchedules => ({
            personId,
            data,
            included,
          })
        ),
      { concurrency: READ_CONCURRENCY }
    );
    const scheduleRequests = schedules.reduce(
      (total, { data }) => total + pagesFor(data.length),
      0
    );
    remaining -= scheduleRequests;

    const missing = findServiceTypesMissingPlanTimes(schedules);
    const serviceTypeIds = [...missing.keys()].toSorted();
    const affordable = Math.max(
      0,
      Math.floor(remaining / PLAN_RANGE_MAX_PAGES)
    );
    for (const serviceTypeId of serviceTypeIds.slice(affordable)) {
      for (const personId of missing.get(serviceTypeId) ?? []) {
        deferred.add(personId);
      }
    }
    const planRanges = yield* Effect.forEach(
      serviceTypeIds.slice(0, affordable),
      (serviceTypeId) =>
        plansService
          .getPlansWithIncludedInDateRange(
            serviceTypeId,
            afterDayKey,
            beforeDayKey,
            "plan_times",
            orgTimeZone
          )
          .pipe(
            // A schedule in another organization names a service type this
            // one cannot read; those schedules keep their plan date and
            // still count, without rehearsal or month-day detail.
            Effect.catchIf(
              (error) =>
                error instanceof PlanningCenterApiError && error.status === 404,
              () => Effect.succeed({ data: [], included: [] })
            )
          ),
      { concurrency: READ_CONCURRENCY }
    );
    const planTimeRequests = planRanges.reduce(
      (total, { data }) => total + pagesFor(data.length),
      0
    );
    const planTimes = planRanges.flatMap(({ included }) =>
      included.filter((resource) => resource.type === "PlanTime")
    );

    const people = schedules.flatMap(({ personId, data, included }) =>
      deferred.has(personId)
        ? []
        : [
            buildPersonActivity(
              personId,
              data,
              [...included, ...planTimes],
              now,
              orgTimeZone
            ),
          ]
    );
    const requestBudget = {
      limit: PEOPLE_DASHBOARD_REQUEST_BUDGET,
      planningCenterRequests:
        TIME_ZONE_REQUESTS + scheduleRequests + planTimeRequests,
      scheduleRequests,
      planTimeRequests,
    };
    log.info(
      {
        ...requestBudget,
        requestedPeopleCount: uniquePersonIds.length,
        hydratedPeopleCount: people.length,
        deferredPeopleCount: deferred.size,
      },
      "People dashboard activity read"
    );
    return {
      generatedAt: now.toISOString(),
      people,
      deferredPersonIds: uniquePersonIds.filter((id) => deferred.has(id)),
      requestBudget,
    };
  });

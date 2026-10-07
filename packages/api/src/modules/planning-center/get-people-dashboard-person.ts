import {
  buildPersonMonthDays,
  buildRhythmFromSchedules,
  getMonthInfo,
  getMostCommonRoles,
  initialsFromName,
  itemsInMonth,
  PLAN_TIME_WINDOW_DAYS,
  scheduleItemsUnlessDeclined,
} from "@pcobooster/api/modules/planning-center/get-people-dashboard";
import type { ScheduleItem } from "@pcobooster/api/modules/planning-center/get-people-dashboard";
import type {
  PeopleDashboardPerson,
  PeopleDashboardPersonDetail,
} from "@pcobooster/api/modules/planning-center/people-dashboard-types";
import {
  keepPlanTimesWithinCursor,
  planTimePageReads,
  PlanTimeProgress,
} from "@pcobooster/api/modules/planning-center/people/plan-time-pages";
import type { PlanTimesProgress } from "@pcobooster/api/modules/planning-center/people/plan-time-pages";
import {
  isDeclinedStatus,
  RHYTHM_HISTORY_DAYS,
  scheduleSortDate,
  scheduleStatus,
} from "@pcobooster/api/modules/planning-center/serving-rhythm";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import { readPagesWithinBudget } from "@pcobooster/api/planning-center/page-budget";
import { recoverPlanningCenterFailure } from "@pcobooster/api/planning-center/recover-failure";
import {
  pagesFor,
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
  formatCalendarDayInTimeZone,
  zonedWallTimeToUtcIso,
} from "@pcobooster/planning-center-models/calendar";
import { isDeclinedAssignmentStatus } from "@pcobooster/planning-center-models/candidate-frequency";
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
/** The rhythm's history plus one day for the org-day boundary, as the dashboard reads it. */
const RHYTHM_WINDOW_DAYS = RHYTHM_HISTORY_DAYS + 1;
/** Plan ranges reach at least this far ahead, month aligned, so months share cached ranges. */
const UPCOMING_RANGE_DAYS = 90;
/** Planning Center compares `after` to an instant; one extra day absorbs any zone offset. */
const SCHEDULE_AFTER_MARGIN_DAYS = 1;
const MISSING_PLAN_TIMES_CONCURRENCY = 4;
/**
 * Plan-range reads leave room for this many plan-by-plan reads, the fallback for plans the ranges
 * missed (such as plans of another organization's service type) or could not afford.
 */
const DIRECT_PLAN_TIME_READS_RESERVE = 5;
const PEOPLE_DASHBOARD_PERSON_CACHE_TTL_MS = 2 * 60 * 1000;
const PEOPLE_DASHBOARD_PERSON_CACHE_VERSION = "v11";

type PeopleDashboardPersonReader = Pick<
  PlanningCenterPeopleService,
  | "getCacheScope"
  | "getPerson"
  | "getPersonPlanPeople"
  | "getPersonSchedulesAfter"
  | "getPlanPlanTimesPage"
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
  /** First org calendar day whose schedules count: the rhythm's history, or the month if earlier. */
  readonly startDayKey: string;
  /** First org calendar day requested from Planning Center. */
  readonly afterDayKey: string;
  /**
   * First org calendar day whose rehearsal times are read: the dashboard's window, or the
   * month if earlier. Earlier schedules keep their plan dates, as on the dashboard.
   */
  readonly planTimesFromDayKey: string;
  /** First day of the plan ranges read for rehearsal times. */
  readonly rangeStartDayKey: string;
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

const earlierDayKey = (a: string, b: string) => (a < b ? a : b);

/**
 * Person detail reads the dashboard's serving history (so both compute the same rhythm) and the
 * requested month, whichever starts earlier, plus every later schedule.
 */
export const getPersonScheduleWindow = (
  monthInfo: Pick<PeopleDashboardPersonDetail["month"], "year" | "monthIndex">,
  now: Date,
  orgTimeZone: string
): PersonScheduleWindow => {
  const monthStartDayKey = formatMonthStartDayKey(
    monthInfo.year,
    monthInfo.monthIndex
  );
  const todayDayKey = formatCalendarDayInTimeZone(now, orgTimeZone);
  const startDayKey = earlierDayKey(
    monthStartDayKey,
    addCalendarDaysToDayKey(todayDayKey, -RHYTHM_WINDOW_DAYS)
  );
  const planTimesFromDayKey = earlierDayKey(
    monthStartDayKey,
    addCalendarDaysToDayKey(todayDayKey, -PLAN_TIME_WINDOW_DAYS)
  );
  const monthEndDayKey = lastDayKeyOfMonth(monthStartDayKey);
  const upcomingEndDayKey = lastDayKeyOfMonth(
    addCalendarDaysToDayKey(todayDayKey, UPCOMING_RANGE_DAYS)
  );
  return {
    startDayKey,
    afterDayKey: addCalendarDaysToDayKey(
      startDayKey,
      -SCHEDULE_AFTER_MARGIN_DAYS
    ),
    planTimesFromDayKey,
    rangeStartDayKey: addCalendarDaysToDayKey(
      planTimesFromDayKey,
      -SCHEDULE_AFTER_MARGIN_DAYS
    ),
    rangeEndDayKey:
      monthEndDayKey > upcomingEndDayKey ? monthEndDayKey : upcomingEndDayKey,
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

/** Per plan, the times its schedules list that are not resolved yet. */
const unresolvedTimesByPlan = (
  schedules: PCResource[],
  unresolvedTimeIds: Set<string>
): Map<string, string[]> => {
  const byPlan = new Map<string, string[]>();
  for (const schedule of schedules) {
    const [planId] = getRelationshipIds(schedule.relationships?.plan?.data);
    const unresolved = getRelationshipIds(
      schedule.relationships?.times?.data
    ).filter((id) => unresolvedTimeIds.has(id));
    if (isNonEmptyString(planId) && unresolved.length > 0) {
      byPlan.set(planId, [...(byPlan.get(planId) ?? []), ...unresolved]);
    }
  }
  return byPlan;
};

interface ResolvedPlanTimes {
  readonly included: PCResource[];
  /** Times Planning Center does not list on their plans; their assignments keep the plan date. */
  readonly unresolvedTimes: number;
  /** Plan pages left for a follow-up call, or `null` when every time was looked for. */
  readonly continuation: PlanTimesProgress | null;
}

/**
 * Resolves rehearsal PlanTimes with one cached plan-range read per service type (shared by every
 * person and month in that range), then reads a plan's own times page by page when the ranges
 * lack them, all within `PROGRESSIVE_REQUEST_BUDGET` counted requests. Ranges go to the service
 * types missing the most times, and leave room for plan-by-plan reads; a plan's pages stop once
 * its missing times are found. Pages that do not fit come back as a continuation holding the
 * times found so far, and a follow-up call reads only plan pages; more missing times than that
 * continuation carries fail the read typed. A service type or plan Planning Center does not
 * find contributes no times; any other failure fails the read.
 */
const resolveMissingPlanTimes = (
  schedules: PCResource[],
  included: PCResource[],
  window: PersonScheduleWindow,
  dependencies: ScheduleReaders,
  continuation: PlanTimesProgress | undefined,
  listedBy: { readonly path: string; readonly pages: number }
): Effect.Effect<ResolvedPlanTimes, PlanningCenterError> => {
  const { byServiceType, missingTimeIds } = findMissingPlanTimes(
    schedules,
    included,
    window.orgTimeZone
  );
  if (missingTimeIds.size === 0) {
    return Effect.succeed({ included, unresolvedTimes: 0, continuation: null });
  }
  return Effect.gen(function* readMissingPlanTimes() {
    const planTimes = new PlanTimeProgress(continuation, (id) =>
      missingTimeIds.has(id)
    );
    yield* keepPlanTimesWithinCursor(
      planTimes,
      {
        planIds: new Set(
          unresolvedTimesByPlan(schedules, missingTimeIds).keys()
        ),
        timeIds: missingTimeIds,
      },
      listedBy
    );
    if (continuation === undefined) {
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
              window.rangeStartDayKey,
              latestPlanDayKey > window.rangeEndDayKey
                ? lastDayKeyOfMonth(latestPlanDayKey)
                : window.rangeEndDayKey,
              "plan_times",
              window.orgTimeZone
            )
            .pipe(
              // A range cut off at its page cap still helps: the times it lacks are read plan
              // by plan below.
              Effect.map((range) => range.included),
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
      planTimes.add(ranges.flat());
    }
    const missingByPlan = unresolvedTimesByPlan(
      schedules,
      new Set([...missingTimeIds].filter((id) => !planTimes.has(id)))
    );
    const unfinished = yield* readPagesWithinBudget(
      () =>
        planTimePageReads(dependencies.peopleService, [
          { progress: planTimes, plans: missingByPlan },
        ]).map(({ read }) => read),
      { concurrency: MISSING_PLAN_TIMES_CONCURRENCY, startReserve: 0 }
    );
    const resolved = planTimes
      .resources()
      .filter(({ id }) => missingTimeIds.has(id));
    return {
      included: [...included, ...resolved],
      unresolvedTimes: missingTimeIds.size - resolved.length,
      continuation: unfinished ? planTimes.progress() : null,
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
const getUnsentRequestSchedules = (
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
  const unsent = planPeople.data.filter(
    (planPerson) =>
      !scheduledPlanPersonIds.has(planPerson.id) &&
      !isDeclinedAssignmentStatus(readString(planPerson.attributes.status))
  );
  if (unsent.length === 0) {
    return Effect.succeed([]);
  }
  return catalogService.getServiceTypesCached().pipe(
    Effect.map((serviceTypes) =>
      unsent.map((planPerson): PCResource => {
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

interface PersonScheduleRead {
  /** The person's own schedules, declined ones included, as the dashboard reads them. */
  readonly schedules: PCResource[];
  /** Requests prepared but not sent: shown in the month, but no one has asked them yet. */
  readonly unsent: PCResource[];
  readonly included: PCResource[];
  readonly unresolvedTimes: number;
  readonly continuation: PlanTimesProgress | null;
}

const needsPlanTimes = (schedule: PCResource, window: PersonScheduleWindow) => {
  if (isDeclinedStatus(scheduleStatus(schedule))) {
    return false;
  }
  const sortDate = scheduleSortDate(schedule);
  return (
    sortDate === undefined ||
    formatCalendarDayInTimeZone(sortDate, window.orgTimeZone) >=
      window.planTimesFromDayKey
  );
};

/**
 * The person's own schedules in the window. Planning Center's default schedule scope is future
 * only, so the explicit `after` filter is what brings in past services; declined schedules are
 * read too, for the rhythm's response counts.
 */
const readPersonSchedules = (
  personId: string,
  window: PersonScheduleWindow,
  dependencies: ScheduleReaders,
  continuation: PlanTimesProgress | undefined
): Effect.Effect<PersonScheduleRead, PlanningCenterError> =>
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
          PERSON_SCHEDULE_MAX_PAGES,
          { includeDeclined: true }
        ),
        dependencies.peopleService.getPersonPlanPeople(personId),
      ],
      { concurrency: "unbounded" }
    );
    const unsent = yield* getUnsentRequestSchedules(
      planPeople,
      schedules.data,
      dependencies.catalogService
    );
    const resolved = yield* resolveMissingPlanTimes(
      [...schedules.data, ...unsent].filter((schedule) =>
        needsPlanTimes(schedule, window)
      ),
      schedules.included,
      window,
      dependencies,
      continuation,
      {
        path: `/services/v2/people/${personId}/schedules`,
        pages: pagesFor(schedules.data.length),
      }
    );
    return { schedules: schedules.data, unsent, ...resolved };
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

/** Teams the person served on, most recent first. */
const getServedTeams = (items: readonly ScheduleItem[]) => {
  const names = new Set<string>();
  for (const item of items.toSorted(
    (a, b) => b.date.getTime() - a.date.getTime()
  )) {
    if (isNonEmptyString(item.teamName)) {
      names.add(item.teamName);
    }
  }
  return [...names];
};

const buildDashboardPersonDetail = (
  personResource: PCResource,
  read: PersonScheduleRead,
  window: PersonScheduleWindow,
  now: Date,
  monthKey: string
): PeopleDashboardPerson => {
  const { orgTimeZone } = window;
  const windowItems: ScheduleItem[] = [];
  for (const schedule of [...read.schedules, ...read.unsent]) {
    for (const item of scheduleItemsUnlessDeclined(schedule, read.included)) {
      if (
        formatCalendarDayInTimeZone(item.date, orgTimeZone) >=
        window.startDayKey
      ) {
        windowItems.push(item);
      }
    }
  }
  const items = dedupeScheduleItems(windowItems);
  const firstName = readString(personResource.attributes.first_name);
  const lastName = readString(personResource.attributes.last_name);
  const name = `${firstName} ${lastName}`.trim();

  return {
    id: personResource.id,
    name: name || "Unknown person",
    initials: initialsFromName(name),
    photoThumbnailUrl: isString(personResource.attributes.photo_thumbnail_url)
      ? personResource.attributes.photo_thumbnail_url
      : null,
    teams: getServedTeams(items),
    rhythm: buildRhythmFromSchedules(
      read.schedules,
      read.included,
      now,
      orgTimeZone
    ),
    roles: getMostCommonRoles(items),
    monthDays: buildPersonMonthDays(
      itemsInMonth(items, monthKey, orgTimeZone),
      orgTimeZone
    ),
  };
};

const buildPeopleDashboardPerson = ({
  personId,
  continuation,
  dependencies,
  now,
  monthKey,
  monthInfo,
  orgTimeZone,
}: {
  personId: string;
  continuation: PlanTimesProgress | undefined;
  dependencies: PeopleDashboardPersonDependencies;
  now: Date;
  monthKey: string;
  monthInfo: PeopleDashboardPersonDetail["month"];
  orgTimeZone: string;
}): Effect.Effect<PeopleDashboardPersonDetail, PlanningCenterError> =>
  Effect.gen(function* readPeopleDashboardPerson() {
    const window = getPersonScheduleWindow(monthInfo, now, orgTimeZone);
    const [personResource, read] = yield* Effect.all(
      [
        dependencies.peopleService.getPerson(personId),
        readPersonSchedules(personId, window, dependencies, continuation),
      ],
      { concurrency: "unbounded" }
    );
    const spent = yield* planningCenterRequestsSpent;
    return {
      generatedAt: now.toISOString(),
      month: monthInfo,
      previousMonth: shiftMonthKey(monthInfo.year, monthInfo.monthIndex, -1),
      nextMonth: shiftMonthKey(monthInfo.year, monthInfo.monthIndex, 1),
      person: buildDashboardPersonDetail(
        personResource,
        read,
        window,
        now,
        monthKey
      ),
      requestBudget: {
        limit: PROGRESSIVE_REQUEST_BUDGET,
        planningCenterRequests: spent,
        unresolvedRehearsalTimes: read.unresolvedTimes,
      },
      continuation: read.continuation,
    };
  });

/**
 * A person's detail page. When rehearsal times do not fit one call, the detail comes back with
 * `continuation`, and a follow-up call passing it back reads the remaining plan pages. Only
 * complete details are cached.
 */
export const getPeopleDashboardPerson = ({
  personId,
  month,
  continuation,
  dependencies,
}: {
  personId: string;
  month?: string;
  /** From the previous call's `continuation`. */
  continuation?: PlanTimesProgress;
  dependencies: PeopleDashboardPersonDependencies;
}): Effect.Effect<PeopleDashboardPersonDetail, PlanningCenterError> =>
  dependencies.resolveTimeZone.pipe(
    Effect.flatMap((orgTimeZone) => {
      const now = new Date();
      const monthDate = parseMonthDate(month, now);
      const monthInfo = getMonthInfo(monthDate, orgTimeZone);
      const monthKey = `${monthInfo.year}-${String(monthInfo.monthIndex + 1).padStart(2, "0")}`;
      const build = () =>
        buildPeopleDashboardPerson({
          personId,
          continuation,
          dependencies,
          now,
          monthKey,
          monthInfo,
          orgTimeZone,
        });
      if (continuation !== undefined) {
        return build();
      }
      const cacheKey = [
        PEOPLE_DASHBOARD_PERSON_CACHE_VERSION,
        "people-dashboard-person",
        dependencies.peopleService.getCacheScope(),
        personId,
        monthKey,
        orgTimeZone,
      ].join(":");
      return cachedRead(
        dependencies.detailCache,
        cacheKey,
        PEOPLE_DASHBOARD_PERSON_CACHE_TTL_MS,
        build
      ).pipe(
        // Callers sharing this load follow its continuation; no later one may find it cached.
        Effect.tap((detail) =>
          Effect.sync(() => {
            if (detail.continuation !== null) {
              dependencies.detailCache.deleteWhere((key) => key === cacheKey);
            }
          })
        )
      );
    }),
    withPlanningCenterRequestCount
  );

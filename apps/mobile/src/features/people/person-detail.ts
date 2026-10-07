/**
 * One person's month, rotation, and blockouts: the rules behind the person screen (Swift
 * `PersonDetailModel`, `BlockoutText`, `BlockoutDays`, and the web's `detail-body.tsx`).
 */
import {
  formatCalendarDateLabel,
  formatCalendarDayInTimeZone,
  formatWallTimeInTimeZone,
  orgCalendarDaysRefMinusItem,
} from "@pcobooster/planning-center-models/calendar";
import { formatTimeOfDay } from "@pcobooster/planning-center-models/plan-overview";
import { Option, Schema } from "effect";

import type { PlanIds } from "../plan/reads";
import {
  assembleDashboard,
  monthKey,
  SEPARATOR,
  todayInMonth,
} from "./dashboard";
import type { PeopleDashboard } from "./dashboard";
import type {
  Activity,
  Blockout,
  DashboardMonth,
  MonthDay,
  PersonDetail,
  Roster,
} from "./types";

const decodeMonthParam = Schema.decodeUnknownOption(
  Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/u))
);

/** A `YYYY-MM` month from a route, or null for the current month. */
export const parseMonthParam = (
  value: string | readonly string[] | undefined
): string | null => Option.getOrNull(decodeMonthParam(value));

const shiftMonthKey = (
  year: number,
  monthIndex: number,
  delta: number
): string => {
  // A civil-month carrier at UTC noon, so it is read in UTC.
  const date = new Date(Date.UTC(year, monthIndex + delta, 1, 12));
  return formatCalendarDayInTimeZone(date, "UTC").slice(0, 7);
};

/**
 * The dashboard over everyone whose activity the cache already holds, for the person screen's
 * first frame (the web's `readPeopleDashboardFromQueryCache`).
 */
export const cachedDashboard = (
  roster: Roster | undefined,
  activities: readonly Activity[]
): PeopleDashboard | undefined =>
  roster === undefined
    ? undefined
    : assembleDashboard(roster, activities, {
        scopePersonIds: roster.people.map((person) => person.id),
        sampleCount: roster.people.length,
        loadingPersonIds: new Set(),
      });

/**
 * A person detail built from the dashboard's own activity for them when it covers `month`, so
 * opening someone the list knows never flashes a skeleton (the web's
 * `getCachedPeopleDashboardPersonDetail`). It claims no unresolved rehearsal times and no
 * continuation; the real answer replaces it.
 */
export const placeholderDetail = (
  dashboard: PeopleDashboard | undefined,
  personId: string,
  month: string | null
): PersonDetail | undefined => {
  if (dashboard === undefined) {
    return undefined;
  }
  if (month !== null && month !== monthKey(dashboard.month)) {
    return undefined;
  }
  const person = dashboard.members.find((member) => member.id === personId);
  if (person === undefined) {
    return undefined;
  }
  return {
    generatedAt: "",
    month: dashboard.month,
    previousMonth: shiftMonthKey(
      dashboard.month.year,
      dashboard.month.monthIndex,
      -1
    ),
    nextMonth: shiftMonthKey(
      dashboard.month.year,
      dashboard.month.monthIndex,
      1
    ),
    person,
    requestBudget: {
      limit: 0,
      planningCenterRequests: 0,
      unresolvedRehearsalTimes: 0,
    },
    continuation: null,
  };
};

/** "Band, Vocals · Keys, Acoustic Guitar": their teams, then their most common positions. */
export const describePerson = (
  teams: readonly string[],
  roles: readonly string[]
): string =>
  [teams.join(", "), roles.join(", ")]
    .filter((part) => part !== "")
    .join(SEPARATOR);

const PLAN_URL =
  /^\/services\/(?<serviceTypeId>[^/]+)\/plans\/(?<planId>[^/]+)(?:\/|$)/u;

/** The plan a commitment belongs to (`planUrl` is `/services/<st>/plans/<plan>/lineup`). */
export const commitmentPlan = (
  entry: Pick<MonthDay, "planUrl">
): PlanIds | null => {
  const groups =
    entry.planUrl === undefined
      ? undefined
      : PLAN_URL.exec(entry.planUrl)?.groups;
  const serviceTypeId = groups?.serviceTypeId;
  const planId = groups?.planId;
  return serviceTypeId === undefined || planId === undefined
    ? null
    : {
        serviceTypeId: decodeURIComponent(serviceTypeId),
        planId: decodeURIComponent(planId),
      };
};

/** The month's commitments, split around today when the month is the current one. */
export const commitmentGroups = (
  entries: readonly MonthDay[],
  month: DashboardMonth,
  todayKey: string
): {
  readonly title: string | null;
  readonly isPast: boolean;
  readonly entries: readonly MonthDay[];
}[] => {
  const sorted = entries.toSorted((a, b) => a.day - b.day);
  const key = monthKey(month);
  const today = todayInMonth(todayKey, month);
  if (today === null) {
    return sorted.length === 0
      ? []
      : [{ title: null, isPast: key < todayKey.slice(0, 7), entries: sorted }];
  }
  const upcoming = sorted.filter((entry) => entry.day >= today);
  const earlier = sorted.filter((entry) => entry.day < today);
  return [
    ...(upcoming.length === 0
      ? []
      : [{ title: "Coming up", isPast: false, entries: upcoming }]),
    ...(earlier.length === 0
      ? []
      : [{ title: "Earlier this month", isPast: true, entries: earlier }]),
  ];
};

/** "4 services · 1 rehearsal", or nothing scheduled. */
export const describeMonth = (entries: readonly MonthDay[]): string => {
  const serviceDays = new Set<number>();
  const rehearsalDays = new Set<number>();
  for (const entry of entries) {
    (entry.kind === "service" ? serviceDays : rehearsalDays).add(entry.day);
  }
  const services = serviceDays.size;
  const rehearsals = rehearsalDays.size;
  if (services === 0 && rehearsals === 0) {
    return "Nothing scheduled";
  }
  const parts: string[] = [];
  if (services > 0) {
    parts.push(`${services} ${services === 1 ? "service" : "services"}`);
  }
  if (rehearsals > 0) {
    parts.push(
      `${rehearsals} ${rehearsals === 1 ? "rehearsal" : "rehearsals"}`
    );
  }
  return parts.join(SEPARATOR);
};

/** "Sun 4" for a day of the dashboard month (a civil date, read in UTC). */
export const formatMonthDay = (month: DashboardMonth, day: number): string =>
  formatCalendarDateLabel(
    new Date(Date.UTC(month.year, month.monthIndex, day, 12)),
    "UTC",
    "weekdayMonthDay"
  );

/** Planning Center's status codes as words. */
export const statusLabel = (status: string | undefined): string => {
  switch ((status ?? "").trim().toUpperCase()) {
    case "C":
    case "CONFIRMED": {
      return "Confirmed";
    }
    case "D":
    case "DECLINED": {
      return "Declined";
    }
    default: {
      return "Pending";
    }
  }
};

/** "Keys · Rehearsal · Sunday Gathering · Confirmed". */
export const describeCommitment = (entry: MonthDay): string =>
  [
    entry.positionName ?? "Scheduled",
    entry.kind === "rehearsal" ? "Rehearsal" : null,
    entry.serviceTypeName === undefined || entry.serviceTypeName === ""
      ? null
      : entry.serviceTypeName,
    entry.kind === "rehearsal" ? null : statusLabel(entry.status),
  ]
    .filter((part) => part !== null)
    .join(SEPARATOR);

const validZones = new Map<string, boolean>();

const isValidTimeZone = (zone: string): boolean => {
  const known = validZones.get(zone);
  if (known !== undefined) {
    return known;
  }
  let valid = true;
  try {
    formatCalendarDayInTimeZone(new Date(0), zone);
  } catch {
    valid = false;
  }
  validZones.set(zone, valid);
  return valid;
};

/**
 * The calendar a blockout is read on: its Planning Center zone when valid, else the
 * congregation's (the same calendar-day rule the server compares blockouts with plans by).
 */
export const blockoutZone = (
  blockout: Pick<Blockout, "timeZone">,
  orgZone: string
): string => {
  const zone = blockout.timeZone?.trim() ?? "";
  return zone !== "" && isValidTimeZone(zone) ? zone : orgZone;
};

/** `YYYY-MM-DD` of a blockout's first and last blocked days, on its own calendar. */
export const blockoutDayRange = (blockout: Blockout, orgZone: string) => {
  const zone = blockoutZone(blockout, orgZone);
  return {
    start: formatCalendarDayInTimeZone(blockout.startsAt, zone),
    end: formatCalendarDayInTimeZone(blockout.endsAt, zone),
  };
};

/** Starts at midnight and ends at the last minute of a day, as Planning Center writes all-day blockouts. */
const isAllDay = (blockout: Blockout, zone: string): boolean =>
  formatWallTimeInTimeZone(blockout.startsAt, zone).timeValue === "00:00" &&
  ["23:59", "00:00"].includes(
    formatWallTimeInTimeZone(blockout.endsAt, zone).timeValue
  );

/**
 * "Fri, Oct 30 to Mon, Nov 2", "Sat, Oct 3", or "Sat, Oct 3, 9:00 AM to 5:00 PM". Years show for
 * dates outside the current year.
 */
export const describeBlockoutDates = (
  blockout: Blockout,
  orgZone: string,
  todayKey: string
): string => {
  const zone = blockoutZone(blockout, orgZone);
  const range = blockoutDayRange(blockout, orgZone);
  const year = todayKey.slice(0, 4);
  const day = (instant: Date, key: string) =>
    formatCalendarDateLabel(
      instant,
      zone,
      key.startsWith(year) ? "weekdayMonthDay" : "weekdayMonthDayYear"
    );
  const start = day(blockout.startsAt, range.start);
  const end = day(blockout.endsAt, range.end);
  if (isAllDay(blockout, zone)) {
    return range.start === range.end ? start : `${start} to ${end}`;
  }
  const startTime = formatTimeOfDay(blockout.startsAt, zone);
  const endTime = formatTimeOfDay(blockout.endsAt, zone);
  return range.start === range.end
    ? `${start}, ${startTime} to ${endTime}`
    : `${start}, ${startTime} to ${end}, ${endTime}`;
};

/** "5 days" for a multi-day blockout; null for a single day. */
export const describeBlockoutLength = (
  blockout: Blockout,
  orgZone: string
): string | null => {
  const range = blockoutDayRange(blockout, orgZone);
  const days = orgCalendarDaysRefMinusItem(range.start, range.end) + 1;
  return days > 1 ? `${days} days` : null;
};

/** The blockout covers this instant. */
export const isAwayNow = (blockout: Blockout, now: Date): boolean =>
  blockout.startsAt.getTime() <= now.getTime() &&
  now.getTime() <= blockout.endsAt.getTime();

/** Upcoming first; the server returns future blockouts only. */
export const sortBlockouts = (
  blockouts: readonly Blockout[]
): readonly Blockout[] =>
  blockouts.toSorted((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

/** Days of `month` any blockout covers, each read on the blockout's own calendar. */
export const blockedDays = (
  month: DashboardMonth,
  blockouts: readonly Blockout[],
  orgZone: string
): ReadonlySet<number> => {
  const days = new Set<number>();
  const key = monthKey(month);
  const count = Math.min(Math.max(Math.trunc(month.daysInMonth), 0), 31);
  for (const blockout of blockouts) {
    const range = blockoutDayRange(blockout, orgZone);
    for (let day = 1; day <= count; day += 1) {
      const dayKey = `${key}-${String(day).padStart(2, "0")}`;
      if (dayKey >= range.start && dayKey <= range.end) {
        days.add(day);
      }
    }
  }
  return days;
};

/** The plan of their next service when the month on screen holds it. */
export const nextServingPlan = (
  nextServingOn: string | null,
  month: DashboardMonth,
  monthDays: readonly MonthDay[]
): PlanIds | null => {
  if (
    nextServingOn === null ||
    !nextServingOn.startsWith(`${monthKey(month)}-`)
  ) {
    return null;
  }
  const day = Number(nextServingOn.slice(8));
  const entry = monthDays.find(
    (candidate) => candidate.day === day && candidate.kind === "service"
  );
  return entry === undefined ? null : commitmentPlan(entry);
};

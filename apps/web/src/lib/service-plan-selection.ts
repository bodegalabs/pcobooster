import {
  addCalendarDaysToDayKey,
  formatCalendarDateLabel,
  formatCalendarDayInTimeZone,
  orgCalendarDaysBetween,
} from "@pcobooster/planning-center-models/calendar";
import { z } from "zod";

export interface ServicePlanTableSelectorProps {
  selectedServiceTypeId: string | null;
  selectedPlanId: string | null;
  /** True while the selected plan's route is loading. */
  isNavigating?: boolean;
  onSelect: (selection: { serviceTypeId: string; planId: string }) => void;
}

export type DateRangeFilter = "all" | "14" | "30" | "60";
export const SERVICE_TYPE_FILTER_STORAGE_KEY =
  "schedule:selected-service-type-ids";

export interface ServicePlanRow {
  serviceTypeId: string;
  serviceTypeName: string;
  serviceTypeSequence: number;
  planId: string;
  planTitle: string;
  seriesTitle: string | null;
  seriesId: string | null;
  sortDate: Date;
}

/** "Sat, Oct 31, 2026" for the org calendar day a plan falls on. */
export const formatPlanDate = (date: Date, orgTimeZone: string): string =>
  formatCalendarDateLabel(date, orgTimeZone, "weekdayMonthDayYear");

/** "October 2026": the org month a plan falls in, for list section headings. */
export const formatPlanMonthHeading = (
  date: Date,
  orgTimeZone: string
): string => formatCalendarDateLabel(date, orgTimeZone, "monthYear");

/** Month, day, and weekday for the plan date tile, all in the org zone. */
export const formatPlanDateTile = (date: Date, orgTimeZone: string) => ({
  month: formatCalendarDateLabel(date, orgTimeZone, "monthShort"),
  day: formatCalendarDateLabel(date, orgTimeZone, "dayOfMonth"),
  weekday: formatCalendarDateLabel(date, orgTimeZone, "weekday"),
});

const RELATIVE_DAY_LABEL_LIMIT = 13;

/**
 * "Today", "Tomorrow", or "In 5 days" for a plan within the next two weeks of
 * org calendar days; null for past or later plans.
 */
export const formatPlanRelativeDay = (
  date: Date,
  now: Date,
  orgTimeZone: string
): string | null => {
  const days = orgCalendarDaysBetween(now, date, orgTimeZone);
  if (days < 0 || days > RELATIVE_DAY_LABEL_LIMIT) {
    return null;
  }
  if (days === 0) {
    return "Today";
  }
  if (days === 1) {
    return "Tomorrow";
  }
  return `In ${days} days`;
};

export interface PlanDayGroup {
  /** Org calendar day, YYYY-MM-DD. */
  dayKey: string;
  date: Date;
  rows: ServicePlanRow[];
}

export interface PlanMonthGroup {
  heading: string;
  days: PlanDayGroup[];
}

/**
 * Groups date-sorted rows into org months, then org calendar days, keeping
 * row order. A late-evening plan lands on its org day, not its UTC day.
 */
export const groupPlansByMonthAndDay = (
  rows: readonly ServicePlanRow[],
  orgTimeZone: string
): PlanMonthGroup[] => {
  const months: PlanMonthGroup[] = [];
  for (const row of rows) {
    const heading = formatPlanMonthHeading(row.sortDate, orgTimeZone);
    const dayKey = formatCalendarDayInTimeZone(row.sortDate, orgTimeZone);
    let month = months.at(-1);
    if (month?.heading !== heading) {
      month = { heading, days: [] };
      months.push(month);
    }
    const day = month.days.at(-1);
    if (day?.dayKey === dayKey) {
      day.rows.push(row);
    } else {
      month.days.push({ dayKey, date: row.sortDate, rows: [row] });
    }
  }
  return months;
};

export const parsePlanDate = (
  value: Date | string | undefined
): Date | null => {
  if (value === undefined || value === "") {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const isInDateWindow = (
  date: Date,
  range: DateRangeFilter,
  orgTz: string
): boolean => {
  if (range === "all") {
    return true;
  }

  const days = Number(range);
  if (!Number.isFinite(days)) {
    return true;
  }

  const nowKey = formatCalendarDayInTimeZone(new Date(), orgTz);
  const maxKey = addCalendarDaysToDayKey(nowKey, days, orgTz);
  const dateKey = formatCalendarDayInTimeZone(date, orgTz);

  return dateKey >= nowKey && dateKey <= maxKey;
};

const serviceTypeIdsSchema = z.array(z.string());
export const dateRangeSchema = z.enum(["all", "14", "30", "60"]);
export const readStoredServiceTypeIds = (
  raw: string | null
): string[] | null => {
  if (raw === null) {
    return null;
  }
  try {
    const parsed = serviceTypeIdsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

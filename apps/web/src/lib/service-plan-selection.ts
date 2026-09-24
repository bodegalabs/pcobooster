import {
  addCalendarDaysToDayKey,
  formatCalendarDateLabel,
  formatCalendarDayInTimeZone,
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

/** Month, day, and weekday for the mobile plan date tile, all in the org zone. */
export const formatPlanDateTile = (date: Date, orgTimeZone: string) => ({
  month: formatCalendarDateLabel(date, orgTimeZone, "monthShort"),
  day: formatCalendarDateLabel(date, orgTimeZone, "dayOfMonth"),
  weekday: formatCalendarDateLabel(date, orgTimeZone, "weekday"),
});

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

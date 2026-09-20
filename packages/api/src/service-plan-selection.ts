import {
  addCalendarDaysToDayKey,
  formatCalendarDayInTimeZone,
} from "@worship-admin/api/planning-center/org-calendar";
import { z } from "zod";

export interface ServicePlanTableSelectorProps {
  selectedServiceTypeId: string | null;
  selectedPlanId: string | null;
  onSelect: (selection: { serviceTypeId: string; planId: string }) => void;
}

export type DateRangeFilter = "all" | "14" | "30" | "60";
export const SERVICE_TYPE_FILTER_STORAGE_KEY =
  "schedule:selected-service-type-ids";
export const TEAM_POSITIONS_PREFETCH_DELAY_MS = 300;
export const PEOPLE_HISTORY_WARMUP_STALE_TIME_MS = 60 * 1000;
export const warmupResponseSchema = z.object({ warmed: z.literal(true) });

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

const desktopDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
export const formatDate = (date: Date): string =>
  desktopDateFormatter.format(date);

const mobileDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
export const formatMobileDate = (date: Date): string =>
  mobileDateFormatter.format(date);

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

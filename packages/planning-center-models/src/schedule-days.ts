import {
  addCalendarDaysToDayKey,
  orgCalendarDaysRefMinusItem,
} from "@pcobooster/planning-center-models/calendar";
import { formatCalendarDayInTimeZone } from "@pcobooster/planning-center-models/calendar-day";
import { PLAN_HISTORY_HALF_RANGE_DAYS } from "@pcobooster/planning-center-models/schedule-constants";
import type { ServiceHistoryItem } from "@pcobooster/planning-center-models/types";

export type ScheduleDayKind = "service" | "rehearsal" | "free";

/** One congregation day around a plan. */
export interface ScheduleDay {
  /** Days from the plan: negative before it, 0 for the plan's own day. */
  offset: number;
  /** YYYY-MM-DD in the org's time zone. */
  dayKey: string;
  kind: ScheduleDayKind;
  /** For service days: confirmed only when every service that day is. */
  status: "confirmed" | "pending" | null;
  /** What they're on that day, for the day's label. */
  items: ServiceHistoryItem[];
}

const isDeclined = (status: string): boolean => {
  const raw = status.trim().toLowerCase();
  return raw === "d" || raw === "declined";
};

const isConfirmed = (status: string): boolean => {
  const raw = status.trim().toLowerCase();
  return raw === "c" || raw === "confirmed";
};

const dayKind = (items: readonly ServiceHistoryItem[]): ScheduleDayKind => {
  if (items.length === 0) {
    return "free";
  }
  return items.every((item) => item.timeType === "rehearsal")
    ? "rehearsal"
    : "service";
};

const serviceStatus = (
  items: readonly ServiceHistoryItem[]
): ScheduleDay["status"] => {
  const services = items.filter((item) => item.timeType !== "rehearsal");
  if (services.length === 0) {
    return null;
  }
  return services.every((item) => isConfirmed(item.status))
    ? "confirmed"
    : "pending";
};

/**
 * Every congregation day from `halfRangeDays` before a plan to `halfRangeDays` after it,
 * with what the person serves or rehearses on each. Declined schedules are left out; they
 * are not time served. The range defaults to the history the candidate list loads.
 */
export const buildScheduleDays = (
  history: readonly ServiceHistoryItem[],
  referenceDate: Date,
  orgTimeZone: string,
  halfRangeDays: number = PLAN_HISTORY_HALF_RANGE_DAYS
): ScheduleDay[] => {
  const planDay = formatCalendarDayInTimeZone(referenceDate, orgTimeZone);
  const byOffset = new Map<number, ServiceHistoryItem[]>();
  for (const item of history) {
    if (isDeclined(item.status)) {
      continue;
    }
    const offset = -orgCalendarDaysRefMinusItem(
      formatCalendarDayInTimeZone(item.date, orgTimeZone),
      planDay
    );
    if (Math.abs(offset) <= halfRangeDays) {
      byOffset.set(offset, [...(byOffset.get(offset) ?? []), item]);
    }
  }
  const days: ScheduleDay[] = [];
  for (let offset = -halfRangeDays; offset <= halfRangeDays; offset += 1) {
    const items = byOffset.get(offset) ?? [];
    days.push({
      offset,
      dayKey: addCalendarDaysToDayKey(planDay, offset),
      kind: dayKind(items),
      status: serviceStatus(items),
      items,
    });
  }
  return days;
};

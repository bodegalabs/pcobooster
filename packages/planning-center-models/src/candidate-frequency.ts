import {
  formatCalendarDayInTimeZone,
  orgCalendarDaysRefMinusItem,
} from "@pcobooster/planning-center-models/calendar";
import { PLAN_HISTORY_HALF_RANGE_DAYS } from "@pcobooster/planning-center-models/schedule-constants";
import type {
  ScheduleFrequency,
  ServiceHistoryItem,
} from "@pcobooster/planning-center-models/types";

/**
 * Planning Center Services status `D` / "declined". Declined rows never count as history or load;
 * selected-plan matching still sees them so the UI can show "Declined".
 */
export const isDeclinedAssignmentStatus = (
  status: string | undefined
): boolean => {
  const s = (status ?? "").trim();
  return s === "D" || s.toLowerCase() === "declined";
};

const isServiceEngagement = (item: ServiceHistoryItem) =>
  item.timeType === undefined || item.timeType === "service";

const isRehearsalEngagement = (item: ServiceHistoryItem) =>
  item.timeType === "rehearsal";

interface EngagementDay {
  service?: ServiceHistoryItem;
  rehearsal?: ServiceHistoryItem;
}

const groupEngagementDays = (
  history: ServiceHistoryItem[],
  orgTimeZone: string
) => {
  const days = new Map<string, EngagementDay>();
  for (const item of history) {
    if (isDeclinedAssignmentStatus(item.status)) {
      continue;
    }
    const dayKey = formatCalendarDayInTimeZone(item.date, orgTimeZone);
    const day = days.get(dayKey) ?? {};
    if (
      isServiceEngagement(item) &&
      (!day.service || item.date > day.service.date)
    ) {
      day.service = item;
    }
    if (
      isRehearsalEngagement(item) &&
      (!day.rehearsal || item.date > day.rehearsal.date)
    ) {
      day.rehearsal = item;
    }
    days.set(dayKey, day);
  }
  return days;
};

interface EngagementSummary {
  recent: number;
  last60: number;
  last90: number;
  total: number;
  upcoming: number;
  latest?: Date;
  next?: Date;
}

const summarizeEngagementDays = (
  days: ServiceHistoryItem[],
  referenceDate: Date,
  orgTimeZone: string
): EngagementSummary => {
  const summary: EngagementSummary = {
    recent: 0,
    last60: 0,
    last90: 0,
    total: 0,
    upcoming: 0,
  };
  const referenceKey = formatCalendarDayInTimeZone(referenceDate, orgTimeZone);
  for (const item of days) {
    const dayKey = formatCalendarDayInTimeZone(item.date, orgTimeZone);
    const daysDiff = orgCalendarDaysRefMinusItem(dayKey, referenceKey);
    if (daysDiff < -PLAN_HISTORY_HALF_RANGE_DAYS) {
      continue;
    }
    if (daysDiff < 0) {
      summary.upcoming += 1;
      if (!summary.next || item.date < summary.next) {
        summary.next = item.date;
      }
      continue;
    }
    summary.total += 1;
    if (daysDiff <= PLAN_HISTORY_HALF_RANGE_DAYS) {
      summary.recent += 1;
    }
    if (daysDiff <= 60) {
      summary.last60 += 1;
    }
    if (daysDiff <= 90) {
      summary.last90 += 1;
    }
    if (!summary.latest || item.date > summary.latest) {
      summary.latest = item.date;
    }
  }
  return summary;
};

/**
 * Counts distinct calendar days in the organization's zone: a day with any service is a service
 * day, and a day with only rehearsals is a rehearsal day.
 */
export const buildFrequencyFromServiceHistory = (
  serviceHistory: ServiceHistoryItem[],
  referenceDate: Date,
  orgTimeZone: string
): ScheduleFrequency => {
  const serviceDays: ServiceHistoryItem[] = [];
  const rehearsalOnlyDays: ServiceHistoryItem[] = [];
  for (const day of groupEngagementDays(serviceHistory, orgTimeZone).values()) {
    if (day.service) {
      serviceDays.push(day.service);
    } else if (day.rehearsal) {
      rehearsalOnlyDays.push(day.rehearsal);
    }
  }
  const services = summarizeEngagementDays(
    serviceDays,
    referenceDate,
    orgTimeZone
  );
  const rehearsals = summarizeEngagementDays(
    rehearsalOnlyDays,
    referenceDate,
    orgTimeZone
  );
  return {
    recentServedDays: services.recent,
    last60Days: services.last60,
    last90Days: services.last90,
    totalServed: services.total,
    upcomingServices: services.upcoming,
    recentRehearsalOnlyDays: rehearsals.recent,
    rehearsalLast60Days: rehearsals.last60,
    rehearsalLast90Days: rehearsals.last90,
    totalRehearsals: rehearsals.total,
    upcomingRehearsals: rehearsals.upcoming,
    ...(services.latest ? { lastServedDate: services.latest } : undefined),
    ...(services.next ? { nextUpcomingDate: services.next } : undefined),
    ...(rehearsals.latest
      ? { lastRehearsalDate: rehearsals.latest }
      : undefined),
    ...(rehearsals.next ? { nextRehearsalDate: rehearsals.next } : undefined),
  };
};

export interface CandidateHistorySummary {
  frequency: ScheduleFrequency;
  /** Sorted by date and limited to the plan history window around the reference date. */
  serviceHistory: ServiceHistoryItem[];
}

/**
 * Frequency from every item, then the items within `PLAN_HISTORY_HALF_RANGE_DAYS` of the
 * reference day for display. Items with equal dates keep their input order.
 */
export const summarizeCandidateHistory = (
  items: readonly ServiceHistoryItem[],
  referenceDate: Date,
  orgTimeZone: string
): CandidateHistorySummary => {
  // Sorting is stable, so equal dates keep their input order.
  const sorted = items.toSorted((a, b) => a.date.getTime() - b.date.getTime());
  const frequency = buildFrequencyFromServiceHistory(
    sorted,
    referenceDate,
    orgTimeZone
  );
  const refDayKey = formatCalendarDayInTimeZone(referenceDate, orgTimeZone);
  const serviceHistory = sorted.filter((item) => {
    const itemDayKey = formatCalendarDayInTimeZone(item.date, orgTimeZone);
    const daysDiff = orgCalendarDaysRefMinusItem(itemDayKey, refDayKey);
    return (
      daysDiff >= -PLAN_HISTORY_HALF_RANGE_DAYS &&
      daysDiff <= PLAN_HISTORY_HALF_RANGE_DAYS
    );
  });
  return { frequency, serviceHistory };
};

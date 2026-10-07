/**
 * The Services agenda's pure rules, shared by the web plan list and the native Services tab:
 * plan rows, their org-calendar labels, month and day grouping, and the upcoming windows. Every
 * label is in the org zone, never the host zone.
 */
import {
  addCalendarDaysToDayKey,
  formatCalendarDateLabel,
  formatCalendarDayInTimeZone,
  orgCalendarDaysBetween,
} from "@pcobooster/planning-center-models/calendar";

export type DateRangeFilter = "all" | "14" | "30" | "60";

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

/** The service type fields a plan row carries. */
export interface ServicePlanRowServiceType {
  readonly id: string;
  readonly name: string;
  readonly sequence: number;
}

/** The plan fields a plan row carries. */
export interface ServicePlanRowPlan {
  readonly id: string;
  readonly title: string;
  readonly seriesTitle?: string | null;
  readonly seriesId?: string | null;
  readonly sortDate?: Date | string;
}

export const parsePlanDate = (
  value: Date | string | undefined
): Date | null => {
  if (value === undefined || value === "") {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * The agenda's rows: every dated plan of the selected service types, in date order, then
 * service type order (`sequence`, then name), then plan title. Plans without a sort date are
 * left out. `plansFor` answers a service type's plans (undefined while they load).
 */
export const buildServicePlanRows = (
  serviceTypes: readonly ServicePlanRowServiceType[],
  plansFor: (
    serviceType: ServicePlanRowServiceType,
    index: number
  ) => readonly ServicePlanRowPlan[] | undefined,
  selectedServiceTypeIds: ReadonlySet<string>
): ServicePlanRow[] => {
  const rows: ServicePlanRow[] = [];
  for (const [index, serviceType] of serviceTypes.entries()) {
    if (!selectedServiceTypeIds.has(serviceType.id)) {
      continue;
    }
    for (const plan of plansFor(serviceType, index) ?? []) {
      const sortDate = parsePlanDate(plan.sortDate);
      if (sortDate === null) {
        continue;
      }
      rows.push({
        serviceTypeId: serviceType.id,
        serviceTypeName: serviceType.name,
        serviceTypeSequence: serviceType.sequence,
        planId: plan.id,
        planTitle: plan.title,
        seriesTitle: plan.seriesTitle ?? null,
        seriesId: plan.seriesId ?? null,
        sortDate,
      });
    }
  }
  return rows.toSorted(
    (a, b) =>
      a.sortDate.getTime() - b.sortDate.getTime() ||
      a.serviceTypeSequence - b.serviceTypeSequence ||
      a.serviceTypeName.localeCompare(b.serviceTypeName) ||
      a.planTitle.localeCompare(b.planTitle)
  );
};

/** "Deep Roots · Rooted": the plan and series titles that are present, or null for neither. */
export const formatPlanDetail = (
  row: Pick<ServicePlanRow, "planTitle" | "seriesTitle">
): string | null => {
  const parts = [row.planTitle, row.seriesTitle].filter(
    (part): part is string => part !== null && part !== ""
  );
  return parts.length > 0 ? parts.join(" · ") : null;
};

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

export const isInDateWindow = (
  date: Date,
  range: DateRangeFilter,
  orgTz: string,
  now: Date = new Date()
): boolean => {
  if (range === "all") {
    return true;
  }

  const days = Number(range);
  if (!Number.isFinite(days)) {
    return true;
  }

  const nowKey = formatCalendarDayInTimeZone(now, orgTz);
  const maxKey = addCalendarDaysToDayKey(nowKey, days);
  const dateKey = formatCalendarDayInTimeZone(date, orgTz);

  return dateKey >= nowKey && dateKey <= maxKey;
};

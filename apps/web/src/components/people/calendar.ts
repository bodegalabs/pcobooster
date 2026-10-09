import type {
  PeopleDashboardDayKind,
  PeopleDashboardMonth,
  PeopleDashboardMonthDay,
} from "@pcobooster/contracts/http/people-schemas";
import { formatCalendarDateLabel } from "@pcobooster/planning-center-models/calendar";

import type { MonthGridDayTone } from "@/components/ui/month-grid-day";

export type CalendarCell =
  | { day: number; key: string }
  | { day: null; key: string };

/** Marker colors shared by calendars, the month grid, and their legends. */
export const commitmentDotClassName = {
  confirmed: "bg-status-confirmed-bright",
  pending: "bg-status-scheduled-bright",
  rehearsal: "bg-muted-foreground/70",
} as const;

export type CommitmentDot = keyof typeof commitmentDotClassName;

export const weekDayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const isConfirmedStatus = (status: string | undefined): boolean => {
  const raw = (status ?? "").trim();
  const normalized = raw.toLowerCase();
  return raw === "C" || normalized === "confirmed";
};

/** The marker a commitment gets: confirmed or pending service, or a rehearsal. */
export const commitmentDot = (
  kind: PeopleDashboardDayKind,
  status?: string
): CommitmentDot => {
  if (kind === "rehearsal") {
    return "rehearsal";
  }
  return isConfirmedStatus(status) ? "confirmed" : "pending";
};

export const commitmentCellTone = (
  kind: PeopleDashboardDayKind,
  status?: string
): MonthGridDayTone => {
  const dot = commitmentDot(kind, status);
  if (dot === "rehearsal") {
    return "rehearsal";
  }
  return dot === "confirmed" ? "confirmed" : "scheduled";
};

/** "Confirmed" or "Pending", as Services labels a scheduled person. */
export const commitmentStatusLabel = (status: string | undefined) =>
  isConfirmedStatus(status) ? "Confirmed" : "Pending";

export const engagementLabel = (
  kind: PeopleDashboardDayKind,
  status?: string
): string =>
  kind === "rehearsal"
    ? "Rehearsal"
    : `${commitmentStatusLabel(status)} service`;

export const pickCalendarMarker = (
  entries: readonly PeopleDashboardMonthDay[]
) =>
  entries.find(
    (entry) => entry.kind === "service" && isConfirmedStatus(entry.status)
  ) ??
  entries.find((entry) => entry.kind === "service") ??
  entries.at(0) ??
  null;

export const buildCalendarCells = (
  startsOnWeekday: number,
  daysInMonth: number
): CalendarCell[] => {
  const blanks: CalendarCell[] = Array.from(
    { length: startsOnWeekday },
    (_, index) => ({
      day: null,
      key: `blank-start-${index}`,
    })
  );
  const days: CalendarCell[] = Array.from(
    { length: daysInMonth },
    (_, index) => ({
      day: index + 1,
      key: `day-${index + 1}`,
    })
  );
  return [...blanks, ...days];
};

/** UTC noon on an org calendar day of the month: a civil-date carrier, read in UTC. */
const monthDayCarrier = (
  month: Pick<PeopleDashboardMonth, "year" | "monthIndex">,
  day: number
) => new Date(Date.UTC(month.year, month.monthIndex, day, 12));

/** "Oct 5" for a day of the dashboard month. */
export const formatMonthDay = (
  month: Pick<PeopleDashboardMonth, "year" | "monthIndex">,
  day: number
) => formatCalendarDateLabel(monthDayCarrier(month, day), "UTC", "monthDay");

/** "Sun, Oct 5" for a day of the dashboard month. */
export const formatWeekdayMonthDay = (
  month: Pick<PeopleDashboardMonth, "year" | "monthIndex">,
  day: number
) =>
  formatCalendarDateLabel(
    monthDayCarrier(month, day),
    "UTC",
    "weekdayMonthDay"
  );

/** "Sun" for a day of the dashboard month. */
export const formatWeekday = (
  month: Pick<PeopleDashboardMonth, "year" | "monthIndex">,
  day: number
) => formatCalendarDateLabel(monthDayCarrier(month, day), "UTC", "weekday");

/** Heatmap tone for a day; rehearsal-only days read as lightly busy. */
export const heatLevelTone = (
  serviceCount: number,
  rehearsalCount = 0
): MonthGridDayTone => {
  if (serviceCount >= 8) {
    return "peak";
  }
  if (serviceCount >= 3) {
    return "busy";
  }
  if (serviceCount > 0 || rehearsalCount > 0) {
    return "light";
  }
  return "empty";
};

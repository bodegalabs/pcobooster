import type {
  PeopleDashboardDayKind,
  PeopleDashboardPerson,
} from "@worship-admin/contracts/people-schemas";

export type CalendarCell =
  | { day: number; key: string }
  | { day: null; key: string };

export const monthDays = Array.from({ length: 31 }, (_, index) => index + 1);

const isConfirmedStatus = (status: string | undefined): boolean => {
  const raw = (status ?? "").trim();
  const normalized = raw.toLowerCase();
  return raw === "C" || normalized === "confirmed";
};

export const commitmentMarkerClass = (
  kind: PeopleDashboardDayKind,
  status?: string
): string => {
  if (kind === "service") {
    return isConfirmedStatus(status)
      ? "bg-status-confirmed-bright"
      : "bg-status-scheduled-bright";
  }
  if (kind === "rehearsal") {
    return "bg-muted-foreground/70";
  }
  if (kind === "blockout") {
    return "bg-destructive";
  }
  return "bg-border";
};

export const commitmentCellClass = (
  kind: PeopleDashboardPerson["monthDays"][number]["kind"],
  status?: string
): string => {
  if (kind === "service") {
    const confirmed = isConfirmedStatus(status);
    return confirmed
      ? "border-status-confirmed/30 bg-status-confirmed/15 text-status-confirmed"
      : "border-status-scheduled/35 bg-status-scheduled/15 text-status-scheduled";
  }
  if (kind === "rehearsal") {
    return "border-muted-foreground/20 bg-muted text-foreground";
  }
  return "bg-muted text-foreground";
};

export const engagementLabel = (
  kind: PeopleDashboardDayKind,
  status?: string
): string => {
  if (kind === "service") {
    return isConfirmedStatus(status)
      ? "Confirmed service"
      : "Potential service";
  }
  if (kind === "rehearsal") {
    return "Rehearsal";
  }
  if (kind === "blockout") {
    return "Blockout";
  }
  return "Open";
};

export const pickCalendarMarker = (
  entries: PeopleDashboardPerson["monthDays"]
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

export const loadBadge = (load: "low" | "normal" | "high" | "rest") => {
  if (load === "high") {
    return { label: "High", className: "text-status-scheduled" };
  }
  if (load === "rest") {
    return { label: "Rest", className: "text-destructive" };
  }
  if (load === "low") {
    return { label: "Low", className: "text-muted-foreground" };
  }
  return { label: "Normal", className: "text-foreground" };
};

export const heatLevelClass = (serviceCount: number): string => {
  if (serviceCount >= 8) {
    return "bg-status-confirmed-bright/20";
  }
  if (serviceCount >= 3) {
    return "bg-status-confirmed-bright/10";
  }
  if (serviceCount > 0) {
    return "bg-muted";
  }
  return "";
};

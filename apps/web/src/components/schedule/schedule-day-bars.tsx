import { formatCalendarDateLabel } from "@pcobooster/planning-center-models/calendar";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import { buildScheduleDays } from "@pcobooster/planning-center-models/schedule-days";
import type { ScheduleDay } from "@pcobooster/planning-center-models/schedule-days";
import type { ServiceHistoryItem } from "@pcobooster/planning-center-models/types";
import type { CSSProperties } from "react";

import { PositionPickerIcon } from "@/components/schedule/position-picker-icon";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizationTimeZone } from "@/hooks/use-organization-timezone";
import { cn } from "@/lib/utils";

const DAYS_PER_WEEK = 7;

/** A day key is a civil date, so it formats as UTC noon in UTC. */
const dayKeyLabel = (
  dayKey: string,
  style: "monthDay" | "weekdayMonthDay"
): string =>
  formatCalendarDateLabel(new Date(`${dayKey}T12:00:00Z`), "UTC", style);

/**
 * The position as Planning Center names it. History splits names on " - " into a team and
 * a position, which also splits positions named like "Rhythm - AM"; joining them back
 * shows the name leaders know.
 */
const positionLabel = (item: ServiceHistoryItem): string =>
  isNonEmptyString(item.teamName)
    ? `${item.teamName} - ${item.teamPositionName}`
    : item.teamPositionName;

/** "Sun, Oct 25 · Keys, Agape Worship Services"; a rehearsal-only line says so. */
const dayLines = (day: ScheduleDay): string[] => {
  const lines = new Map<string, boolean>();
  for (const item of day.items) {
    const what = [positionLabel(item), item.serviceTypeName]
      .filter((part) => part !== undefined && part !== "")
      .join(", ");
    const rehearsalOnly = item.timeType === "rehearsal";
    lines.set(what, (lines.get(what) ?? true) && rehearsalOnly);
  }
  return [...lines].map(([what, rehearsalOnly]) =>
    rehearsalOnly ? `${what} (rehearsal)` : what
  );
};

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

/** "3 days before", "This plan", "the next day". */
const distanceFromPlan = (offset: number): string => {
  if (offset === 0) {
    return "This plan";
  }
  const days = plural(Math.abs(offset), "day");
  return offset < 0 ? `${days} before` : `${days} after`;
};

interface DayEntry {
  key: string;
  item: ServiceHistoryItem;
  rehearsal: boolean;
  confirmed: boolean;
}

/** One entry per position, service, and kind; services before rehearsals. */
const dayEntries = (day: ScheduleDay): DayEntry[] => {
  const entries = new Map<string, DayEntry>();
  for (const item of day.items) {
    const rehearsal = item.timeType === "rehearsal";
    const key = [
      item.teamPositionName,
      item.serviceTypeName ?? "",
      item.planId ?? "",
      rehearsal ? "r" : "s",
    ].join("|");
    if (!entries.has(key)) {
      const status = item.status.trim().toLowerCase();
      entries.set(key, {
        key,
        item,
        rehearsal,
        confirmed: status === "c" || status === "confirmed",
      });
    }
  }
  return [...entries.values()].toSorted(
    (a, b) => Number(a.rehearsal) - Number(b.rehearsal)
  );
};

const entryTone = (entry: DayEntry) => {
  if (entry.rehearsal) {
    return {
      dot: "bg-muted-foreground/75",
      text: "text-muted-foreground",
      label: "Rehearsal",
    };
  }
  return entry.confirmed
    ? {
        dot: "bg-status-confirmed",
        text: "text-status-confirmed",
        label: "Confirmed",
      }
    : {
        dot: "bg-status-scheduled",
        text: "text-status-scheduled",
        label: "Pending",
      };
};

const DayEntryRow = ({ entry }: { entry: DayEntry }) => {
  const tone = entryTone(entry);
  const { item } = entry;
  const detail = [item.serviceTypeName, item.planTitle]
    .filter((part) => part !== undefined && part !== "")
    .join(" · ");
  return (
    <li className="flex items-center gap-2.5">
      <span className="text-muted-foreground flex shrink-0">
        <PositionPickerIcon
          positionName={item.teamPositionName}
          teamName={item.teamName ?? ""}
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-foreground truncate text-sm font-medium">
          {positionLabel(item)}
        </span>
        {detail === "" ? null : (
          <span className="text-muted-foreground truncate text-xs">
            {detail}
          </span>
        )}
      </span>
      <span
        className={cn(
          "flex shrink-0 items-center gap-1.5 text-xs font-medium",
          tone.text
        )}
      >
        <span aria-hidden className={cn("size-1.5 rounded-full", tone.dot)} />
        {tone.label}
      </span>
    </li>
  );
};

/** The day's date and distance from the plan, then everything they're on that day. */
const DayPanel = ({ day }: { day: ScheduleDay }) => (
  <div className="flex flex-col gap-3">
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-foreground text-sm font-semibold tracking-tight">
        {dayKeyLabel(day.dayKey, "weekdayMonthDay")}
      </span>
      <span
        className={cn(
          "text-xs",
          day.offset === 0
            ? "text-status-info font-medium"
            : "text-muted-foreground"
        )}
      >
        {distanceFromPlan(day.offset)}
      </span>
    </div>
    <ul className="flex flex-col gap-2.5">
      {dayEntries(day).map((entry) => (
        <DayEntryRow key={entry.key} entry={entry} />
      ))}
    </ul>
  </div>
);

const barClassName = (day: ScheduleDay): string => {
  if (day.kind === "service") {
    return day.status === "confirmed"
      ? "bg-status-confirmed h-6"
      : "bg-status-scheduled h-6";
  }
  return day.kind === "rehearsal"
    ? "bg-muted-foreground/75 h-4"
    : "bg-muted h-4";
};

const DayBar = ({ day }: { day: ScheduleDay }) => {
  // How far the reveal wave travels before reaching this day.
  const wave: CSSProperties & { "--day-distance": number } = {
    "--day-distance": Math.abs(day.offset),
  };
  const bar = (
    <span
      data-day-bar={day.offset === 0 ? undefined : ""}
      className={cn("block w-1 rounded-full", barClassName(day))}
      style={day.offset === 0 ? undefined : wave}
    />
  );
  const content =
    day.offset === 0 ? (
      <span
        data-day-bar=""
        className="border-status-info/80 flex h-8 w-3 items-end justify-center rounded-sm border border-dashed pb-0.5"
        style={wave}
      >
        {day.kind === "free" ? null : bar}
      </span>
    ) : (
      bar
    );
  if (day.kind === "free") {
    return (
      <span
        aria-hidden
        className="flex min-w-0 flex-1 items-end justify-center"
      >
        {content}
      </span>
    );
  }
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <span className="flex min-w-0 flex-1 items-end justify-center" />
        }
      >
        {content}
      </HoverCardTrigger>
      <HoverCardContent variant="panel" side="top" className="w-80">
        <DayPanel day={day} />
      </HoverCardContent>
    </HoverCard>
  );
};

/** A date under the bars, centered on its day; the ends align inward to stay in the row. */
const WeekDateLabel = ({
  day,
  index,
  count,
}: {
  day: ScheduleDay;
  index: number;
  count: number;
}) => {
  const position: CSSProperties & { "--label-left": string } = {
    "--label-left": `${((index + 0.5) / count) * 100}%`,
  };
  return (
    <span
      aria-hidden
      className={cn(
        "absolute bottom-0 left-(--label-left) -translate-x-1/2 text-xs whitespace-nowrap tabular-nums",
        day.offset === 0
          ? "text-status-info font-medium"
          : "text-muted-foreground",
        index === 0 && "translate-x-0",
        index === count - 1 && "-translate-x-full",
        // Phones only have room for a date every other week.
        day.offset % (DAYS_PER_WEEK * 2) !== 0 && "max-sm:hidden"
      )}
      style={position}
    >
      {dayKeyLabel(day.dayKey, "monthDay")}
    </span>
  );
};

/**
 * Someone's days around this plan as thin bars sharing the row's width: a tall colored bar
 * for a service (green confirmed, amber pending), a short darker gray bar for a rehearsal
 * only, a short gray bar for a free day. The plan's day sits in the middle in a dashed
 * frame, with dates every week either side. Hovering a busy day names what's on it.
 */
export const ScheduleDayBars = ({
  history,
  planReferenceDate,
  pending = false,
  reveal = true,
}: {
  history: readonly ServiceHistoryItem[];
  planReferenceDate: Date | null;
  /** History is still loading. */
  pending?: boolean;
  /** Play the bars' entrance wave when they appear. */
  reveal?: boolean;
}) => {
  const orgTimeZone = useOrganizationTimeZone();
  if (planReferenceDate === null || (pending && history.length === 0)) {
    return <Skeleton variant="text" className="h-12 w-full" />;
  }
  const days = buildScheduleDays(history, planReferenceDate, orgTimeZone);
  const busy = days.filter((day) => day.kind !== "free");
  return (
    <div className="relative w-full pb-5">
      <p className="sr-only">
        {busy.length === 0
          ? "Nothing scheduled in the 4 weeks either side of this plan."
          : busy
              .map(
                (day) =>
                  `${dayKeyLabel(day.dayKey, "weekdayMonthDay")}: ${dayLines(day).join("; ")}`
              )
              .join(". ")}
      </p>
      <div className={cn("flex h-8 items-end", reveal && "day-bars-reveal")}>
        {days.map((day) => (
          <DayBar key={day.dayKey} day={day} />
        ))}
      </div>
      {days.map((day, index) =>
        day.offset % DAYS_PER_WEEK === 0 ? (
          <WeekDateLabel
            key={day.dayKey}
            day={day}
            index={index}
            count={days.length}
          />
        ) : null
      )}
    </div>
  );
};

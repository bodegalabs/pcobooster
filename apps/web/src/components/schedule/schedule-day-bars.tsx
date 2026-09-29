import { formatCalendarDateLabel } from "@pcobooster/planning-center-models/calendar";
import type { ServiceHistoryItem } from "@pcobooster/planning-center-models/types";
import type { CSSProperties } from "react";

import { HoverLabel } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizationTimeZone } from "@/hooks/use-organization-timezone";
import { buildScheduleDays } from "@/lib/people/schedule-days";
import type { ScheduleDay } from "@/lib/people/schedule-days";
import { cn } from "@/lib/utils";

const DAYS_PER_WEEK = 7;

/** A day key is a civil date, so it formats as UTC noon in UTC. */
const dayKeyLabel = (
  dayKey: string,
  style: "monthDay" | "weekdayMonthDay"
): string =>
  formatCalendarDateLabel(new Date(`${dayKey}T12:00:00Z`), "UTC", style);

/** "Sun, Oct 25 · Keys, Agape Worship Services"; a rehearsal-only line says so. */
const dayLines = (day: ScheduleDay): string[] => {
  const lines = new Map<string, boolean>();
  for (const item of day.items) {
    const what = [item.teamPositionName, item.serviceTypeName]
      .filter((part) => part !== undefined && part !== "")
      .join(", ");
    const rehearsalOnly = item.timeType === "rehearsal";
    lines.set(what, (lines.get(what) ?? true) && rehearsalOnly);
  }
  return [...lines].map(([what, rehearsalOnly]) =>
    rehearsalOnly ? `${what} (rehearsal)` : what
  );
};

const DayLabel = ({ day }: { day: ScheduleDay }) => (
  <span className="flex flex-col gap-0.5">
    <span className="font-medium">
      {dayKeyLabel(day.dayKey, "weekdayMonthDay")}
      {day.offset === 0 ? " · this plan" : ""}
    </span>
    {dayLines(day).map((line) => (
      <span key={line}>{line}</span>
    ))}
  </span>
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
  const bar = (
    <span className={cn("block w-1 rounded-full", barClassName(day))} />
  );
  const content =
    day.offset === 0 ? (
      <span className="border-status-info/80 flex h-8 w-3 items-end justify-center rounded-sm border border-dashed pb-0.5">
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
    <HoverLabel
      label={<DayLabel day={day} />}
      className="max-w-72 text-left whitespace-normal"
      render={<span className="flex min-w-0 flex-1 items-end justify-center" />}
    >
      {content}
    </HoverLabel>
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
}: {
  history: readonly ServiceHistoryItem[];
  planReferenceDate: Date | null;
  /** History is still loading. */
  pending?: boolean;
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
      <div className="flex h-8 items-end">
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

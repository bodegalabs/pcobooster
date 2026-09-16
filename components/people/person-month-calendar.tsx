"use client";

import {
  commitmentCellClass,
  commitmentMarkerClass,
  engagementLabel,
  pickCalendarMarker,
} from "@/components/people/calendar";
import type { CalendarCell } from "@/components/people/calendar";
import { CommitmentEntryText } from "@/components/people/shared-components";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { PeopleDashboardPerson } from "@/lib/use-cases/planning-center/people-dashboard-types";
import { cn } from "@/lib/utils";

const weekDayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const PersonMonthCalendar = ({
  person,
  monthLabel,
  calendarCells,
}: {
  person: PeopleDashboardPerson;
  monthLabel: string;
  calendarCells: CalendarCell[];
}) => (
  <>
    <div className="text-muted-foreground grid grid-cols-7 gap-0.5 pb-1.5 text-center text-xs">
      {weekDayNames.map((dayName) => (
        <div key={dayName}>{dayName}</div>
      ))}
    </div>
    <div className="grid grid-cols-7 gap-0.5">
      {calendarCells.map((cell) => {
        if (cell.day === null) {
          return <div key={cell.key} className="aspect-square min-h-7" />;
        }
        const { day } = cell;
        const entries = person.monthDays.filter((entry) => entry.day === day);
        const marker = pickCalendarMarker(entries);
        const button = (
          <button
            key={cell.key}
            type="button"
            className={cn(
              "border-border/40 text-muted-foreground hover:bg-muted/60 relative flex aspect-square min-h-7 items-start justify-start rounded-sm border p-1 text-xs tabular-nums",
              marker ? commitmentCellClass(marker.kind, marker.status) : null
            )}
          >
            {day}
          </button>
        );
        if (!marker) {
          return button;
        }
        return (
          <HoverCard key={cell.key} openDelay={120} closeDelay={120}>
            <HoverCardTrigger asChild>{button}</HoverCardTrigger>
            <HoverCardContent side="top" density="compact" className="w-72">
              <p className="text-xs font-medium">
                {monthLabel.split(" ")[0]} {day}
              </p>
              <div className="text-muted-foreground mt-1 grid gap-1 text-xs">
                {entries.map((entry) => (
                  <div
                    key={`${entry.day}:${entry.kind}:${entry.positionName ?? ""}:${entry.serviceTypeName ?? ""}:${entry.status ?? ""}`}
                    className="flex items-start gap-2"
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-1.5 shrink-0 rounded-full",
                        commitmentMarkerClass(entry.kind, entry.status)
                      )}
                    />
                    <p>
                      <span className="text-foreground font-medium">
                        {engagementLabel(entry.kind, entry.status)}
                      </span>
                      {" · "}
                      <CommitmentEntryText entry={entry} />
                    </p>
                  </div>
                ))}
              </div>
            </HoverCardContent>
          </HoverCard>
        );
      })}
    </div>
  </>
);

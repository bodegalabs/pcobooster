"use client";

import type { PeopleDashboardPerson } from "@pcobooster/contracts/people-schemas";

import {
  commitmentCellTone,
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
import { MonthGridDay } from "@/components/ui/month-grid-day";
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from "@/components/ui/responsive-popover";
import { useIsMobile } from "@/hooks/use-mobile";
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
}) => {
  // Phones cannot hover, so a tap opens the day as a sheet instead.
  const isMobile = useIsMobile();
  return (
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
            <MonthGridDay
              key={cell.key}
              size="sm"
              tone={
                marker
                  ? commitmentCellTone(marker.kind, marker.status)
                  : "empty"
              }
            >
              {day}
            </MonthGridDay>
          );
          if (!marker) {
            return button;
          }
          const details = (
            <div className="text-muted-foreground mt-1 grid gap-1 text-xs max-md:gap-2 max-md:text-sm">
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
          );
          const dateLabel = `${monthLabel.split(" ")[0]} ${day}`;
          if (isMobile) {
            return (
              <ResponsivePopover key={cell.key}>
                <ResponsivePopoverTrigger render={button} />
                <ResponsivePopoverContent title={dateLabel} showTitle>
                  <div className="px-3 pb-4">{details}</div>
                </ResponsivePopoverContent>
              </ResponsivePopover>
            );
          }
          return (
            <HoverCard key={cell.key}>
              <HoverCardTrigger render={button} />
              <HoverCardContent side="top" variant="panel" className="w-72">
                <p className="text-xs font-medium">{dateLabel}</p>
                {details}
              </HoverCardContent>
            </HoverCard>
          );
        })}
      </div>
    </>
  );
};

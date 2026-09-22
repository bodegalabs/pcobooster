"use client";

import type { PeopleDashboardData } from "@pcobooster/contracts/people-schemas";
import { CalendarDays } from "lucide-react";

import {
  commitmentMarkerClass,
  heatLevelClass,
} from "@/components/people/calendar";
import type { CalendarCell } from "@/components/people/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

type MonthDay = PeopleDashboardData["monthDays"][number];

interface RhythmDayProps {
  cell: CalendarCell;
  monthDay: MonthDay | undefined;
  monthLabel: string;
}

interface RhythmDetailsProps {
  confirmedServiceCount: number;
  potentialServiceCount: number;
  rehearsalCount: number;
}

const RhythmDetails = ({
  confirmedServiceCount,
  potentialServiceCount,
  rehearsalCount,
}: RhythmDetailsProps) => {
  const hasCommitments =
    confirmedServiceCount > 0 ||
    potentialServiceCount > 0 ||
    rehearsalCount > 0;

  if (!hasCommitments) {
    return (
      <p className="text-muted-foreground mt-1 text-xs">
        No scheduled commitments.
      </p>
    );
  }

  return (
    <div className="text-muted-foreground mt-1 grid gap-1 text-xs">
      {confirmedServiceCount > 0 ? (
        <div className="flex items-center gap-2">
          <span className="bg-status-confirmed-bright size-1.5 rounded-full" />
          <span>{confirmedServiceCount} confirmed</span>
        </div>
      ) : null}
      {potentialServiceCount > 0 ? (
        <div className="flex items-center gap-2">
          <span className="bg-status-scheduled-bright size-1.5 rounded-full" />
          <span>{potentialServiceCount} potential</span>
        </div>
      ) : null}
      {rehearsalCount > 0 ? (
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-1.5 rounded-full",
              commitmentMarkerClass("rehearsal")
            )}
          />
          <span>{rehearsalCount} rehearsals</span>
        </div>
      ) : null}
    </div>
  );
};

const RhythmDay = ({ cell, monthDay, monthLabel }: RhythmDayProps) => {
  if (cell.day === null) {
    return <div className="aspect-square" />;
  }

  const { day } = cell;
  const confirmedServiceCount = monthDay?.confirmedServiceCount ?? 0;
  const potentialServiceCount = monthDay?.potentialServiceCount ?? 0;
  const rehearsalCount = monthDay?.rehearsalCount ?? 0;
  const serviceCount = monthDay?.serviceCount ?? 0;
  const hasRehearsalOnly = serviceCount === 0 && rehearsalCount > 0;
  const hasNoCommitments = serviceCount === 0 && rehearsalCount === 0;

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <button
            type="button"
            aria-label={`${monthLabel.split(" ")[0]} ${day}`}
            className={cn(
              "border-border/35 hover:bg-muted/60 flex aspect-square flex-col items-start justify-between rounded-md border p-1.5 text-left text-xs tabular-nums",
              heatLevelClass(serviceCount),
              hasRehearsalOnly ? "bg-muted" : "",
              hasNoCommitments && "text-muted-foreground"
            )}
          />
        }
      >
        <span>{day}</span>
        <span className="flex items-center gap-0.5">
          {confirmedServiceCount > 0 ? (
            <span className="bg-status-confirmed-bright size-1.5 rounded-full" />
          ) : null}
          {potentialServiceCount > 0 ? (
            <span className="bg-status-scheduled-bright size-1.5 rounded-full" />
          ) : null}
          {rehearsalCount > 0 ? (
            <span
              className={cn(
                "size-1.5 rounded-full",
                commitmentMarkerClass("rehearsal")
              )}
            />
          ) : null}
        </span>
      </HoverCardTrigger>
      <HoverCardContent side="top" variant="panel" className="w-48">
        <p className="text-xs font-medium">
          {monthLabel.split(" ")[0]} {day}
        </p>
        <RhythmDetails
          confirmedServiceCount={confirmedServiceCount}
          potentialServiceCount={potentialServiceCount}
          rehearsalCount={rehearsalCount}
        />
      </HoverCardContent>
    </HoverCard>
  );
};

interface HealthRhythmProps {
  dashboard: PeopleDashboardData | undefined;
  calendarCells: CalendarCell[];
}

export const HealthRhythm = ({
  dashboard,
  calendarCells,
}: HealthRhythmProps) => (
  <Card>
    <CardHeader>
      <CardTitle>
        <CalendarDays className="text-muted-foreground size-4" />
        {dashboard?.month.label ?? "Month"} rhythm
      </CardTitle>
      <CardDescription>
        Org-level serving pressure across the month.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className="text-muted-foreground grid grid-cols-7 gap-1 pb-2 text-center text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
          <div key={dayName}>{dayName}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {calendarCells.map((cell) => (
          <RhythmDay
            key={cell.key}
            cell={cell}
            monthDay={dashboard?.monthDays.find(
              (entry) => entry.day === cell.day
            )}
            monthLabel={dashboard?.month.label ?? "Month"}
          />
        ))}
      </div>
      {dashboard?.requestBudget.sampled === true ? (
        <p className="text-muted-foreground mt-3 text-xs">
          Showing {dashboard.requestBudget.hydratedPeopleCount} of{" "}
          {dashboard.requestBudget.rosterPeopleCount} roster people.
        </p>
      ) : null}
    </CardContent>
  </Card>
);

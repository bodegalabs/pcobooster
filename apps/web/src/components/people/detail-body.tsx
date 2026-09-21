"use client";

import type { PeopleDashboardPersonDetail } from "@worship-admin/contracts/people-schemas";
import { CalendarDays, Clock3, Sparkles } from "lucide-react";

import type { CalendarCell } from "@/components/people/calendar";
import { PersonMonthCalendar } from "@/components/people/person-month-calendar";
import { LegendDot, Metric } from "@/components/people/shared-components";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const PersonDetailBody = ({
  data,
  monthLabel,
  calendarCells,
  isPlaceholderData,
}: {
  data: PeopleDashboardPersonDetail;
  monthLabel: string;
  calendarCells: CalendarCell[];
  isPlaceholderData: boolean;
}) => {
  const { person } = data;
  return (
    <div
      className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_20rem]"
      aria-busy={isPlaceholderData}
    >
      <section className="flex flex-col gap-3">
        {isPlaceholderData ? (
          <div className="border-border/60 bg-background/95 text-muted-foreground w-fit rounded-md border px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
            Refreshing detail...
          </div>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-3">
          <Metric label="Month" value={String(person.monthCount)} />
          <Metric label="30 days" value={String(person.thirtyDayCount)} />
          <Metric label="90 days" value={String(person.ninetyDayCount)} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              <CalendarDays className="text-muted-foreground size-4" />
              {monthLabel} calendar
            </CardTitle>
            <CardDescription>
              Hover a scheduled date to see service, rehearsal, position, and
              status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PersonMonthCalendar
              person={person}
              monthLabel={monthLabel}
              calendarCells={calendarCells}
            />
          </CardContent>
        </Card>
      </section>

      <aside className="flex flex-col gap-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <Sparkles className="text-muted-foreground size-4" />
              Current signal
            </CardTitle>
            <CardAction>
              <Badge variant="outline">{person.status}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>{person.highlight}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Clock3 className="text-muted-foreground size-4" />
              Rotation notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              Last service:{" "}
              <span className="text-foreground">{person.lastServed}</span>
            </p>
            <p>
              Next service:{" "}
              <span className="text-foreground">{person.nextScheduled}</span>
            </p>
            <p>
              Next rehearsal:{" "}
              <span className="text-foreground">
                {person.nextRehearsal ?? "Not scheduled"}
              </span>
            </p>
            <p>
              Upcoming services:{" "}
              <span className="text-foreground">{person.upcomingCount}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Legend</CardTitle>
            <CardDescription>
              Markers use live Planning Center schedule status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LegendDot
              className="bg-status-confirmed-bright"
              label="Confirmed"
            />
            <LegendDot
              className="bg-status-scheduled-bright"
              label="Potential"
            />
            <LegendDot className="bg-muted-foreground/70" label="Rehearsal" />
          </CardContent>
        </Card>
      </aside>
    </div>
  );
};

export const PersonDetailState = ({
  data,
  monthLabel,
  calendarCells,
  isLoading,
  isPlaceholderData,
}: {
  data: PeopleDashboardPersonDetail | undefined;
  monthLabel: string;
  calendarCells: CalendarCell[];
  isLoading: boolean;
  isPlaceholderData: boolean;
}) => {
  if (isLoading || !data) {
    return (
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-[34rem]" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  return (
    <PersonDetailBody
      data={data}
      monthLabel={monthLabel}
      calendarCells={calendarCells}
      isPlaceholderData={isPlaceholderData}
    />
  );
};

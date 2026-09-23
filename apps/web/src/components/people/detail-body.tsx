"use client";

import type { PeopleDashboardPersonDetail } from "@pcobooster/contracts/people-schemas";
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

const metricKeys = ["month", "thirty", "ninety"];
const sideCardLines = [
  [
    { key: "signal-a", width: "10rem" },
    { key: "signal-b", width: "8rem" },
  ],
  [
    { key: "notes-a", width: "11rem" },
    { key: "notes-b", width: "9rem" },
    { key: "notes-c", width: "10rem" },
    { key: "notes-d", width: "7rem" },
  ],
  [
    { key: "legend-a", width: "6rem" },
    { key: "legend-b", width: "6rem" },
    { key: "legend-c", width: "6rem" },
  ],
];

export const PersonDetailBodySkeleton = () => (
  <div
    className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_20rem]"
    aria-busy
    aria-label="Loading person"
  >
    <section className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {metricKeys.map((key) => (
          <div
            key={key}
            className="border-border/40 rounded-lg border px-3 py-2"
          >
            <Skeleton variant="text" className="h-3 w-14" />
            <Skeleton variant="text" className="mt-2 h-4 w-6" />
          </div>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton variant="text" className="h-4 w-40" />
          <Skeleton variant="text" className="mt-1 h-3.5 w-72 max-w-full" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 35 }, (_, index) => (
              <Skeleton
                key={index}
                variant="control"
                className="aspect-square"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
    <aside className="flex flex-col gap-2">
      {sideCardLines.map((lines) => (
        <Card key={lines[0].key}>
          <CardHeader>
            <Skeleton variant="text" className="h-4 w-32" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {lines.map((line) => (
                <Skeleton
                  key={line.key}
                  variant="text"
                  className="h-3.5"
                  width={line.width}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </aside>
  </div>
);

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
      className="stale-while-busy grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_20rem]"
      aria-busy={isPlaceholderData}
    >
      <section className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
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
              <span className="md:hidden">Tap</span>
              <span className="max-md:hidden">Hover</span> a scheduled date to
              see service, rehearsal, position, and status.
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
    return <PersonDetailBodySkeleton />;
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

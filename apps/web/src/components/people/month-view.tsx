import type {
  PeopleDashboardDay,
  PeopleDashboardPerson,
} from "@pcobooster/contracts/people-schemas";
import { CalendarDays } from "lucide-react";
import { useState } from "react";

import {
  buildCalendarCells,
  commitmentMarkerClass,
  engagementLabel,
  heatLevelTone,
  pickCalendarMarker,
} from "@/components/people/calendar";
import type { CalendarCell } from "@/components/people/calendar";
import {
  CommitmentEntryText,
  LegendDot,
  PersonAvatar,
  PersonRowButton,
} from "@/components/people/shared-components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { MonthGridDay } from "@/components/ui/month-grid-day";
import { cn } from "@/lib/utils";

interface Month {
  year: number;
  monthIndex: number;
  label: string;
  daysInMonth: number;
  startsOnWeekday: number;
}

interface MonthViewProps {
  people: PeopleDashboardPerson[];
  month: Month;
  monthDays: PeopleDashboardDay[];
  matrixDays: number[];
  onSelectPerson: (person: PeopleDashboardPerson) => void;
  onPreviewPerson: (person: PeopleDashboardPerson) => void;
}

const weekDayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SelectedDayPanel = ({
  month,
  selectedDay,
  scheduledPeople,
  onSelectPerson,
  onPreviewPerson,
}: {
  month: Month;
  selectedDay: number;
  scheduledPeople: PeopleDashboardPerson[];
  onSelectPerson: (person: PeopleDashboardPerson) => void;
  onPreviewPerson: (person: PeopleDashboardPerson) => void;
}) => (
  <aside className="flex min-w-0 flex-col gap-2 pb-1">
    <Card>
      <CardHeader>
        <CardTitle>
          {month.label.split(" ")[0]} {selectedDay}
        </CardTitle>
        <CardDescription>Selected service day snapshot.</CardDescription>
      </CardHeader>
      <CardContent>
        {scheduledPeople.length === 0 ? (
          <p className="text-muted-foreground px-2 py-1.5 text-sm">
            No scheduled people on this date.
          </p>
        ) : (
          scheduledPeople.map((person) => (
            <PersonRowButton
              key={`day-${person.id}`}
              person={person}
              onPreviewPerson={onPreviewPerson}
              onOpenPerson={onSelectPerson}
            >
              <PersonAvatar person={person} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {person.name}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {person.roles}
                </span>
              </span>
            </PersonRowButton>
          ))
        )}
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>Legend</CardTitle>
        <CardDescription>
          Calendar markers match person detail markers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LegendDot className="bg-status-confirmed-bright" label="Confirmed" />
        <LegendDot className="bg-status-scheduled-bright" label="Potential" />
        <LegendDot className="bg-muted-foreground/70" label="Rehearsal" />
        <LegendDot className="bg-border" label="No service shown" />
      </CardContent>
    </Card>
  </aside>
);

const MonthDayCount = ({
  count,
  label,
  kind = "service",
  status,
}: {
  count: number;
  label: string;
  kind?: "service" | "rehearsal";
  status?: string;
}) => (
  <div className="flex items-center gap-2">
    <span
      className={cn(
        "size-1.5 rounded-full",
        commitmentMarkerClass(kind, status)
      )}
    />
    <span>
      {count} {label}
    </span>
  </div>
);

const MonthDayDetails = ({
  serviceCount,
  confirmedServiceCount,
  potentialServiceCount,
  rehearsalCount,
}: {
  serviceCount: number;
  confirmedServiceCount: number;
  potentialServiceCount: number;
  rehearsalCount: number;
}) => {
  const hasCommitments = serviceCount > 0 || rehearsalCount > 0;
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
        <MonthDayCount
          count={confirmedServiceCount}
          label="confirmed service commitments"
          status="C"
        />
      ) : null}
      {potentialServiceCount > 0 ? (
        <MonthDayCount
          count={potentialServiceCount}
          label="potential service commitments"
          status="U"
        />
      ) : null}
      {rehearsalCount > 0 ? (
        <MonthDayCount
          count={rehearsalCount}
          label="rehearsal commitments"
          kind="rehearsal"
        />
      ) : null}
    </div>
  );
};

const HeatmapCell = ({
  cell,
  month,
  monthDays,
  selectedDay,
  onSelectDay,
}: {
  cell: CalendarCell;
  month: Month;
  monthDays: PeopleDashboardDay[];
  selectedDay: number;
  onSelectDay: (day: number) => void;
}) => {
  if (cell.day === null) {
    return <div className="aspect-square min-h-10 sm:min-h-16" />;
  }
  const { day } = cell;
  const monthDay = monthDays.find((entry) => entry.day === day);
  const serviceCount = monthDay?.serviceCount ?? 0;
  const confirmedServiceCount = monthDay?.confirmedServiceCount ?? 0;
  const potentialServiceCount = monthDay?.potentialServiceCount ?? 0;
  const rehearsalCount = monthDay?.rehearsalCount ?? 0;

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <MonthGridDay
            size="lg"
            tone={heatLevelTone(serviceCount, rehearsalCount)}
            selected={day === selectedDay}
            aria-label={`${month.label.split(" ")[0]} ${day}`}
            onClick={() => {
              onSelectDay(day);
            }}
          />
        }
      >
        <span className="text-muted-foreground text-xs tabular-nums">
          {day}
        </span>
        <span className="flex items-center gap-1">
          {confirmedServiceCount > 0 ? (
            <Badge variant="secondary">{confirmedServiceCount}</Badge>
          ) : null}
          {potentialServiceCount > 0 ? (
            <Badge variant="outline">{potentialServiceCount}</Badge>
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
      <HoverCardContent side="top" variant="panel" className="w-52">
        <p className="text-xs font-medium">
          {month.label.split(" ")[0]} {day}
        </p>
        <MonthDayDetails
          serviceCount={serviceCount}
          confirmedServiceCount={confirmedServiceCount}
          potentialServiceCount={potentialServiceCount}
          rehearsalCount={rehearsalCount}
        />
      </HoverCardContent>
    </HoverCard>
  );
};

const MonthHeatmap = ({
  month,
  monthDays,
  calendarCells,
  selectedDay,
  onSelectDay,
}: {
  month: Month;
  monthDays: PeopleDashboardDay[];
  calendarCells: CalendarCell[];
  selectedDay: number;
  onSelectDay: (day: number) => void;
}) => (
  <Card>
    <CardHeader>
      <CardTitle>
        <CalendarDays className="text-muted-foreground size-4" />
        {month.label} serving rhythm
      </CardTitle>
      <CardDescription>
        Heatmap of scheduled people across all service days.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className="text-muted-foreground grid grid-cols-7 gap-1.5 pb-2 text-center text-xs">
        {weekDayNames.map((dayName) => (
          <div key={dayName}>{dayName}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {calendarCells.map((cell) => (
          <HeatmapCell
            key={cell.key}
            cell={cell}
            month={month}
            monthDays={monthDays}
            selectedDay={selectedDay}
            onSelectDay={onSelectDay}
          />
        ))}
      </div>
    </CardContent>
  </Card>
);

const MatrixDay = ({
  person,
  month,
  day,
}: {
  person: PeopleDashboardPerson;
  month: Month;
  day: number;
}) => {
  const entries = person.monthDays.filter((entry) => entry.day === day);
  const marker = pickCalendarMarker(entries);
  const dot = marker ? (
    <span
      className={cn(
        "size-2 rounded-full",
        commitmentMarkerClass(marker.kind, marker.status)
      )}
    />
  ) : (
    <span className="bg-border/60 size-2 rounded-full" />
  );

  return (
    <div className="flex justify-center px-3 py-2">
      {marker ? (
        <HoverCard>
          <HoverCardTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`${person.name} ${month.label.split(" ")[0]} ${day}`}
              />
            }
          >
            {dot}
          </HoverCardTrigger>
          <HoverCardContent side="top" variant="panel" className="w-64">
            <p className="text-xs font-medium">{person.name}</p>
            <div className="text-muted-foreground mt-1 flex items-start gap-2 text-xs">
              <span
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  commitmentMarkerClass(marker.kind, marker.status)
                )}
              />
              <p>
                {month.label.split(" ")[0]} {day}
                {" · "}
                <span className="text-foreground font-medium">
                  {engagementLabel(marker.kind, marker.status)}
                </span>
                {" · "}
                <CommitmentEntryText entry={marker} />
              </p>
            </div>
          </HoverCardContent>
        </HoverCard>
      ) : (
        dot
      )}
    </div>
  );
};

const MatrixPersonRow = ({
  person,
  month,
  matrixDays,
  onSelectPerson,
  onPreviewPerson,
}: {
  person: PeopleDashboardPerson;
  month: Month;
  matrixDays: number[];
  onSelectPerson: (person: PeopleDashboardPerson) => void;
  onPreviewPerson: (person: PeopleDashboardPerson) => void;
}) => (
  <div className="group/matrix-row hover:bg-muted/50 grid w-full grid-cols-[minmax(10.5rem,1.2fr)_repeat(5,minmax(4rem,1fr))] items-center text-left">
    <div className="bg-background group-hover/matrix-row:bg-muted/50 border-border/40 sticky left-0 z-[1] min-w-0 max-md:border-r md:static md:bg-transparent">
      <PersonRowButton
        person={person}
        onPreviewPerson={onPreviewPerson}
        onOpenPerson={onSelectPerson}
      >
        <PersonAvatar person={person} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{person.name}</p>
          <p className="text-muted-foreground truncate text-xs">
            {person.teams.join(", ")}
          </p>
        </div>
      </PersonRowButton>
    </div>
    {matrixDays.map((day) => (
      <MatrixDay
        key={`${person.id}-${day}`}
        person={person}
        month={month}
        day={day}
      />
    ))}
  </div>
);

const PeopleMonthMatrix = ({
  people,
  month,
  matrixDays,
  onSelectPerson,
  onPreviewPerson,
}: {
  people: PeopleDashboardPerson[];
  month: Month;
  matrixDays: number[];
  onSelectPerson: (person: PeopleDashboardPerson) => void;
  onPreviewPerson: (person: PeopleDashboardPerson) => void;
}) => (
  <div className="border-border/40 overflow-x-auto rounded-lg border">
    <div className="min-w-[31rem]">
      <div className="border-border/40 bg-background text-muted-foreground grid grid-cols-[minmax(10.5rem,1.2fr)_repeat(5,minmax(4rem,1fr))] border-b text-xs font-medium">
        <div className="bg-background border-border/40 sticky left-0 z-[1] px-4 py-2 max-md:border-r md:static">
          Person
        </div>
        {matrixDays.map((day) => (
          <div key={day} className="px-3 py-2 text-center tabular-nums">
            {month.label.split(" ")[0]} {day}
          </div>
        ))}
      </div>
      <div className="divide-border/30 divide-y">
        {people.map((person) => (
          <MatrixPersonRow
            key={person.id}
            person={person}
            month={month}
            matrixDays={matrixDays}
            onSelectPerson={onSelectPerson}
            onPreviewPerson={onPreviewPerson}
          />
        ))}
      </div>
    </div>
  </div>
);

export const MonthView = ({
  people,
  month,
  monthDays,
  matrixDays,
  onSelectPerson,
  onPreviewPerson,
}: MonthViewProps) => {
  const [selectedDay, setSelectedDay] = useState(
    () => monthDays.find((day) => day.serviceCount > 0)?.day ?? 1
  );
  const calendarCells = buildCalendarCells(
    month.startsOnWeekday,
    month.daysInMonth
  );
  const scheduledPeople = people.filter((person) =>
    person.monthDays.some(
      (entry) => entry.day === selectedDay && entry.kind === "service"
    )
  );

  return (
    <div className="grid shrink-0 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="flex min-w-0 flex-col gap-3">
        <MonthHeatmap
          month={month}
          monthDays={monthDays}
          calendarCells={calendarCells}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />
        <PeopleMonthMatrix
          people={people}
          month={month}
          matrixDays={matrixDays}
          onSelectPerson={onSelectPerson}
          onPreviewPerson={onPreviewPerson}
        />
      </section>
      <SelectedDayPanel
        month={month}
        selectedDay={selectedDay}
        scheduledPeople={scheduledPeople}
        onSelectPerson={onSelectPerson}
        onPreviewPerson={onPreviewPerson}
      />
    </div>
  );
};

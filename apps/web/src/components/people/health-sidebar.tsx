"use client";

import type {
  PeopleDashboardData,
  PeopleDashboardPerson,
} from "@pcobooster/contracts/people-schemas";
import { Medal, ShieldAlert } from "lucide-react";

import type { CalendarCell } from "@/components/people/calendar";
import { HealthRhythm } from "@/components/people/health-rhythm";
import { PersonAvatar } from "@/components/people/shared-components";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface HealthSidebarProps {
  dashboard: PeopleDashboardData | undefined;
  isLoading: boolean;
  mvp: PeopleDashboardPerson | null;
  needsRest: PeopleDashboardPerson[];
  underused: PeopleDashboardPerson[];
  rhythmCalendarCells: CalendarCell[];
  onPreviewPerson: (person: PeopleDashboardPerson) => void;
  onOpenPerson: (person: PeopleDashboardPerson) => void;
}

export const HealthSidebar = ({
  dashboard,
  isLoading,
  mvp,
  needsRest,
  underused,
  rhythmCalendarCells,
  onPreviewPerson,
  onOpenPerson,
}: HealthSidebarProps) => (
  <aside className="flex min-w-0 flex-col gap-2 pb-1">
    <Card>
      <CardHeader>
        <CardTitle>
          <Medal className="text-muted-foreground size-4" />
          MVP of the month
        </CardTitle>
        <CardDescription>
          {mvp?.highlight ??
            (isLoading ? "Loading current roster..." : "No people loaded yet.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {mvp ? (
          <button
            type="button"
            className="border-border/40 bg-card/40 hover:bg-muted/50 flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left"
            onFocus={() => {
              onPreviewPerson(mvp);
            }}
            onPointerEnter={() => {
              onPreviewPerson(mvp);
            }}
            onTouchStart={() => {
              onPreviewPerson(mvp);
            }}
            onClick={() => {
              onOpenPerson(mvp);
            }}
          >
            <PersonAvatar person={mvp} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {mvp.name}
              </span>
              <span className="text-muted-foreground block truncate text-xs">
                {mvp.streak}
              </span>
            </span>
            <Badge variant="secondary">{mvp.monthCount}</Badge>
          </button>
        ) : (
          <Skeleton className="h-12 w-full" />
        )}
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>
          <ShieldAlert className="text-muted-foreground size-4" />
          Needs attention
        </CardTitle>
        <CardDescription>
          People above cadence or ready to re-enter rotation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {[...needsRest, ...underused].length === 0 && !isLoading ? (
          <p className="text-muted-foreground px-2 py-1.5 text-sm">
            No attention items in this sample.
          </p>
        ) : (
          [...needsRest, ...underused].slice(0, 4).map((person) => (
            <button
              key={person.id}
              type="button"
              className="hover:bg-muted/50 flex items-center gap-2 rounded-md px-2 py-1 text-left"
              onFocus={() => {
                onPreviewPerson(person);
              }}
              onPointerEnter={() => {
                onPreviewPerson(person);
              }}
              onTouchStart={() => {
                onPreviewPerson(person);
              }}
              onClick={() => {
                onOpenPerson(person);
              }}
            >
              <span className="bg-muted-foreground size-1.5 shrink-0 rounded-full" />
              <span className="min-w-0 flex-1 truncate text-sm">
                {person.name}
              </span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {person.status}
              </span>
            </button>
          ))
        )}
      </CardContent>
    </Card>

    <HealthRhythm dashboard={dashboard} calendarCells={rhythmCalendarCells} />
  </aside>
);

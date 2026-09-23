"use client";

import type {
  PeopleDashboardData,
  PeopleDashboardPerson,
} from "@pcobooster/contracts/people-schemas";

import { loadBadge } from "@/components/people/calendar";
import { PersonLineSkeleton } from "@/components/people/people-skeletons";
import { RosterTableBody } from "@/components/people/roster-table-body";
import { PersonAvatar } from "@/components/people/shared-components";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface HealthRosterProps {
  dashboard: PeopleDashboardData | undefined;
  visiblePeople: PeopleDashboardPerson[];
  isLoading: boolean;
  onPreviewPerson: (person: PeopleDashboardPerson) => void;
  onOpenPerson: (person: PeopleDashboardPerson) => void;
}

export const HealthRoster = ({
  dashboard,
  visiblePeople,
  isLoading,
  onPreviewPerson,
  onOpenPerson,
}: HealthRosterProps) => (
  <>
    <div className="grid shrink-0 gap-2 sm:grid-cols-3">
      <Card>
        <CardHeader>
          <CardDescription>Scheduled people</CardDescription>
          <CardTitle>
            {isLoading ? (
              <Skeleton variant="text" className="h-7 w-10" />
            ) : (
              (dashboard?.stats.scheduledPeople ?? 0)
            )}
          </CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>High load</CardDescription>
          <CardTitle>
            {isLoading ? (
              <Skeleton variant="text" className="h-7 w-8" />
            ) : (
              (dashboard?.stats.highLoadPeople ?? 0)
            )}
          </CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Available soon</CardDescription>
          <CardTitle>
            {isLoading ? (
              <Skeleton variant="text" className="h-7 w-10" />
            ) : (
              (dashboard?.stats.availableSoonPeople ?? 0)
            )}
          </CardTitle>
        </CardHeader>
      </Card>
    </div>

    <div className="border-border/40 shrink-0 overflow-hidden rounded-lg border md:h-96">
      <ScrollArea className="hidden h-full md:block">
        <Table className="table-fixed">
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="[&>th]:h-9">
              <TableHead className="w-[34%]">Person</TableHead>
              <TableHead>Load</TableHead>
              <TableHead>Last</TableHead>
              <TableHead>Next</TableHead>
              <TableHead>Month</TableHead>
              <TableHead>Signal</TableHead>
            </TableRow>
          </TableHeader>
          <RosterTableBody
            visiblePeople={visiblePeople}
            isLoading={isLoading}
            onPreviewPerson={onPreviewPerson}
            onOpenPerson={onOpenPerson}
          />
        </Table>
      </ScrollArea>
      <div className="flex flex-col md:hidden">
        {isLoading
          ? Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`mobile-loading-${index}`}
                className="border-border/35 border-b px-2 py-1.5 last:border-b-0"
              >
                <PersonLineSkeleton index={index} />
              </div>
            ))
          : visiblePeople.map((person) => {
              const badge = loadBadge(person.load);
              return (
                <button
                  key={`mobile-${person.id}`}
                  type="button"
                  className="border-border/35 hover:bg-muted/50 flex w-full flex-col gap-2 border-b px-4 py-3 text-left last:border-b-0"
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
                  <div className="flex min-w-0 items-start gap-3">
                    <PersonAvatar person={person} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm leading-tight font-semibold">
                        {person.name}
                      </p>
                      <p className="text-muted-foreground mt-1 truncate text-xs">
                        {person.teams.join(", ")} · {person.roles}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-medium",
                        badge.className
                      )}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
                    <span className="shrink-0 tabular-nums">
                      {person.monthCount} this month
                    </span>
                    <span
                      aria-hidden
                      className="bg-border size-1 rounded-full"
                    />
                    <span className="min-w-0 truncate">{person.status}</span>
                  </div>
                </button>
              );
            })}
      </div>
    </div>
  </>
);

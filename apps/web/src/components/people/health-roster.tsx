"use client";

import type {
  PeopleDashboardData,
  PeopleDashboardPerson,
} from "@pcobooster/contracts/people-schemas";

import { loadBadge } from "@/components/people/calendar";
import { RosterTableBody } from "@/components/people/roster-table-body";
import {
  PersonAvatar,
  PersonRowButton,
} from "@/components/people/shared-components";
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
    <div className="grid shrink-0 grid-cols-3 gap-2">
      <Card>
        <CardHeader>
          <CardDescription>Scheduled people</CardDescription>
          <CardTitle>
            {isLoading ? (
              <Skeleton className="h-7 w-10" />
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
              <Skeleton className="h-7 w-8" />
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
              <Skeleton className="h-7 w-10" />
            ) : (
              (dashboard?.stats.availableSoonPeople ?? 0)
            )}
          </CardTitle>
        </CardHeader>
      </Card>
    </div>

    <div className="border-border/40 shrink-0 overflow-hidden rounded-2xl border md:h-96 md:rounded-lg">
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
      <div className="divide-border/35 flex flex-col divide-y p-1 md:hidden">
        {isLoading
          ? Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`mobile-loading-${index}`}
                className="border-border/35 border-b px-4 py-3 last:border-b-0"
              >
                <div className="flex items-start gap-3">
                  <Skeleton className="size-8" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                </div>
              </div>
            ))
          : visiblePeople.map((person) => {
              const badge = loadBadge(person.load);
              return (
                <PersonRowButton
                  key={`mobile-${person.id}`}
                  person={person}
                  onPreviewPerson={onPreviewPerson}
                  onOpenPerson={onOpenPerson}
                  className="flex-col items-stretch"
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
                </PersonRowButton>
              );
            })}
      </div>
    </div>
  </>
);

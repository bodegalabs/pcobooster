"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronRight,
  Clock3,
  ListChecks,
  Medal,
  Search,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePeopleDashboard } from "@/hooks/use-people-dashboard";
import { createPeopleDashboardPersonQueryOptions } from "@/hooks/use-people-dashboard-person";
import type {
  PeopleDashboardDayKind,
  PeopleDashboardLoad,
  PeopleDashboardPerson,
  PeopleDashboardRange,
} from "@/lib/use-cases/planning-center/people-dashboard-types";
import { cn } from "@/lib/utils";

const monthDays = Array.from({ length: 31 }, (_, index) => index + 1);
const EMPTY_PEOPLE: PeopleDashboardPerson[] = [];
type CalendarCell = { day: number; key: string } | { day: null; key: string };

function loadBadge(load: PeopleDashboardLoad) {
  if (load === "high")
    return { label: "High", className: "text-amber-700 dark:text-amber-300" };
  if (load === "rest") return { label: "Rest", className: "text-destructive" };
  if (load === "low")
    return { label: "Low", className: "text-muted-foreground" };
  return { label: "Normal", className: "text-foreground" };
}

export function commitmentMarkerClass(
  kind: PeopleDashboardDayKind,
  status?: string
) {
  if (kind === "service")
    return isConfirmedStatus(status) ? "bg-emerald-500" : "bg-amber-500";
  if (kind === "rehearsal") return "bg-muted-foreground/70";
  if (kind === "blockout") return "bg-destructive";
  return "bg-border";
}

export function engagementLabel(kind: PeopleDashboardDayKind, status?: string) {
  if (kind === "service")
    return isConfirmedStatus(status)
      ? "Confirmed service"
      : "Potential service";
  if (kind === "rehearsal") return "Rehearsal";
  if (kind === "blockout") return "Blockout";
  return "Open";
}

function isConfirmedStatus(status: string | undefined) {
  const raw = (status || "").trim();
  const normalized = raw.toLowerCase();
  return raw === "C" || normalized === "confirmed";
}

export function pickCalendarMarker(
  entries: PeopleDashboardPerson["monthDays"]
) {
  return (
    entries.find(
      (entry) => entry.kind === "service" && isConfirmedStatus(entry.status)
    ) ??
    entries.find((entry) => entry.kind === "service") ??
    entries[0] ??
    null
  );
}

export function CommitmentEntryText({
  entry,
}: {
  entry: PeopleDashboardPerson["monthDays"][number];
}) {
  return (
    <>
      {entry.positionName ?? "Scheduled"}
      {entry.serviceTypeName ? (
        <>
          {" · "}
          {entry.planUrl ? (
            <Link
              href={entry.planUrl}
              className="text-foreground font-medium underline-offset-2 hover:underline"
            >
              {entry.serviceTypeName}
            </Link>
          ) : (
            entry.serviceTypeName
          )}
        </>
      ) : null}
    </>
  );
}

export function PersonAvatar({ person }: { person: PeopleDashboardPerson }) {
  return (
    <Avatar className="size-8 rounded-md">
      {person.photoThumbnailUrl ? (
        <AvatarImage
          src={person.photoThumbnailUrl}
          alt={person.name}
          className="rounded-md object-cover"
        />
      ) : null}
      <AvatarFallback className="bg-primary/10 text-primary rounded-md text-xs font-medium">
        {person.initials}
      </AvatarFallback>
    </Avatar>
  );
}

export function PeoplePage() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<"health" | "month">("health");
  const [range, setRange] = useState<PeopleDashboardRange>("month");
  const [selectedTeam, setSelectedTeam] = useState("all");
  const {
    data: dashboard,
    isLoading,
    isError,
    isPlaceholderData,
  } = usePeopleDashboard(range);
  const people = dashboard?.people ?? EMPTY_PEOPLE;
  const rhythmCalendarCells = dashboard
    ? buildCalendarCells(
        dashboard.month.startsOnWeekday,
        dashboard.month.daysInMonth
      )
    : buildCalendarCells(0, monthDays.length);
  const teamOptions = useMemo(
    () =>
      [...new Set(people.flatMap((person) => person.teams))].toSorted((a, b) =>
        a.localeCompare(b)
      ),
    [people]
  );

  const visiblePeople = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    return people.filter(
      (person) =>
        (selectedTeam === "all" || person.teams.includes(selectedTeam)) &&
        (!normalized ||
          [person.name, person.roles, ...person.teams]
            .join(" ")
            .toLowerCase()
            .includes(normalized))
    );
  }, [deferredQuery, people, selectedTeam]);

  const mvp = people[0] ?? null;
  const needsRest = people.filter(
    (person) => person.load === "rest" || person.load === "high"
  );
  const underused = people.filter((person) => person.load === "low");
  const prefetchPersonDetail = useCallback(
    (person: PeopleDashboardPerson) => {
      router.prefetch(`/people/${person.id}`);
      void queryClient.prefetchQuery(
        createPeopleDashboardPersonQueryOptions(person.id, null)
      );
    },
    [queryClient, router]
  );
  const openPerson = useCallback(
    (person: PeopleDashboardPerson) => {
      prefetchPersonDetail(person);
      router.push(`/people/${person.id}`);
    },
    [prefetchPersonDetail, router]
  );

  return (
    <main className="bg-background flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-3 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 lg:overflow-hidden">
        <header className="flex shrink-0 flex-col gap-3">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight md:text-2xl">
                People
              </h1>
              <p className="text-muted-foreground text-sm">
                Serving health, rotation rhythm, and monthly people insights.
              </p>
            </div>
            <Tabs
              value={activeView}
              onValueChange={(value) =>
                setActiveView(value === "month" ? "month" : "health")
              }
            >
              <TabsList className="h-8">
                <TabsTrigger value="health" className="px-3 text-xs">
                  Health
                </TabsTrigger>
                <TabsTrigger value="month" className="px-3 text-xs">
                  Month
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="grid shrink-0 items-center gap-2 md:grid-cols-[minmax(0,1fr)_160px_190px]">
            <InputGroup>
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search people, teams, or roles"
                aria-label="Search people"
              />
            </InputGroup>
            <NativeSelect
              wrapperClassName="w-full"
              aria-label="Select time range"
              value={range}
              onChange={(event) =>
                setRange(event.target.value as PeopleDashboardRange)
              }
            >
              <NativeSelectOption value="month">This month</NativeSelectOption>
              <NativeSelectOption value="30">Last 30 days</NativeSelectOption>
              <NativeSelectOption value="90">Last 90 days</NativeSelectOption>
            </NativeSelect>
            <NativeSelect
              wrapperClassName="w-full"
              aria-label="Filter team"
              value={selectedTeam}
              onChange={(event) => setSelectedTeam(event.target.value)}
            >
              <NativeSelectOption value="all">All teams</NativeSelectOption>
              {teamOptions.map((team) => (
                <NativeSelectOption key={team} value={team}>
                  {team}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </header>

        {isPlaceholderData && !isError ? (
          <div className="border-border/60 bg-background/95 text-muted-foreground -mb-1 w-fit rounded-md border px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
            Loading selected range...
          </div>
        ) : null}

        {isError ? (
          <div className="border-border/40 text-muted-foreground rounded-lg border px-4 py-8 text-sm">
            People dashboard failed to load. Refresh and try again.
          </div>
        ) : activeView === "health" ? (
          <div
            className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_20rem]"
            aria-busy={isPlaceholderData}
          >
            <section className="flex flex-col gap-3 lg:min-h-0">
              <div className="grid shrink-0 gap-2 sm:grid-cols-3">
                <Card className="border-border/40 gap-3 rounded-lg py-3 shadow-none">
                  <CardHeader className="gap-1 px-4">
                    <CardDescription>Scheduled people</CardDescription>
                    <CardTitle className="text-2xl tabular-nums">
                      {isLoading ? (
                        <Skeleton className="h-7 w-10" />
                      ) : (
                        (dashboard?.stats.scheduledPeople ?? 0)
                      )}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-border/40 gap-3 rounded-lg py-3 shadow-none">
                  <CardHeader className="gap-1 px-4">
                    <CardDescription>High load</CardDescription>
                    <CardTitle className="text-2xl tabular-nums">
                      {isLoading ? (
                        <Skeleton className="h-7 w-8" />
                      ) : (
                        (dashboard?.stats.highLoadPeople ?? 0)
                      )}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-border/40 gap-3 rounded-lg py-3 shadow-none">
                  <CardHeader className="gap-1 px-4">
                    <CardDescription>Available soon</CardDescription>
                    <CardTitle className="text-2xl tabular-nums">
                      {isLoading ? (
                        <Skeleton className="h-7 w-10" />
                      ) : (
                        (dashboard?.stats.availableSoonPeople ?? 0)
                      )}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              <div className="border-border/40 overflow-hidden rounded-lg border">
                <ScrollArea className="hidden h-full md:block">
                  <Table>
                    <TableHeader className="bg-background sticky top-0 z-10">
                      <TableRow className="border-border/40 [&>th]:text-muted-foreground border-b hover:bg-transparent [&>th]:h-9 [&>th]:text-xs [&>th]:font-medium">
                        <TableHead className="w-[34%] pr-3 pl-4">
                          Person
                        </TableHead>
                        <TableHead className="px-3">Load</TableHead>
                        <TableHead className="px-3">Last</TableHead>
                        <TableHead className="px-3">Next</TableHead>
                        <TableHead className="px-3">Month</TableHead>
                        <TableHead className="px-3">Signal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        Array.from({ length: 6 }).map((_, index) => (
                          <TableRow
                            key={`loading-${index}`}
                            className="[&>td]:h-12 [&>td]:py-0"
                          >
                            <TableCell className="pr-3 pl-4">
                              <div className="flex items-center gap-3">
                                <Skeleton className="size-8 rounded-md" />
                                <div className="flex flex-col gap-1.5">
                                  <Skeleton className="h-3.5 w-32" />
                                  <Skeleton className="h-3 w-48" />
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="px-3">
                              <Skeleton className="h-3.5 w-12" />
                            </TableCell>
                            <TableCell className="px-3">
                              <Skeleton className="h-3.5 w-12" />
                            </TableCell>
                            <TableCell className="px-3">
                              <Skeleton className="h-3.5 w-16" />
                            </TableCell>
                            <TableCell className="px-3">
                              <Skeleton className="h-3.5 w-6" />
                            </TableCell>
                            <TableCell className="px-3">
                              <Skeleton className="h-3.5 w-24" />
                            </TableCell>
                          </TableRow>
                        ))
                      ) : visiblePeople.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="text-muted-foreground px-4 py-8 text-center text-sm"
                          >
                            No people matched the current filters.
                          </TableCell>
                        </TableRow>
                      ) : (
                        visiblePeople.map((person) => {
                          const badge = loadBadge(person.load);
                          return (
                            <TableRow
                              key={person.id}
                              className="group/row hover:bg-muted/60 cursor-pointer transition-none [&>td]:h-12 [&>td]:py-0"
                              onPointerEnter={() =>
                                prefetchPersonDetail(person)
                              }
                              onClick={() => openPerson(person)}
                            >
                              <TableCell className="pr-3 pl-4">
                                <div className="flex min-w-0 items-center gap-3">
                                  <PersonAvatar person={person} />
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">
                                      {person.name}
                                    </p>
                                    <p className="text-muted-foreground truncate text-xs">
                                      {person.teams.join(", ")} · {person.roles}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "px-3 text-sm font-medium",
                                  badge.className
                                )}
                              >
                                {badge.label}
                              </TableCell>
                              <TableCell className="text-muted-foreground px-3 text-sm tabular-nums">
                                {person.lastServed}
                              </TableCell>
                              <TableCell className="px-3 text-sm tabular-nums">
                                {person.nextScheduled}
                              </TableCell>
                              <TableCell className="px-3 text-sm tabular-nums">
                                {person.monthCount}
                              </TableCell>
                              <TableCell className="px-3">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-muted-foreground truncate text-sm">
                                    {person.status}
                                  </span>
                                  <ChevronRight className="text-muted-foreground size-4 shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100" />
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
                <div className="flex flex-col md:hidden">
                  {isLoading
                    ? Array.from({ length: 4 }).map((_, index) => (
                        <div
                          key={`mobile-loading-${index}`}
                          className="border-border/35 border-b px-4 py-3 last:border-b-0"
                        >
                          <div className="flex items-start gap-3">
                            <Skeleton className="size-8 rounded-md" />
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
                          <button
                            key={`mobile-${person.id}`}
                            type="button"
                            className="border-border/35 hover:bg-muted/50 flex w-full flex-col gap-2 border-b px-4 py-3 text-left last:border-b-0"
                            onFocus={() => prefetchPersonDetail(person)}
                            onPointerEnter={() => prefetchPersonDetail(person)}
                            onTouchStart={() => prefetchPersonDetail(person)}
                            onClick={() => openPerson(person)}
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
                              <span className="min-w-0 truncate">
                                {person.status}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <Card className="border-border/40 gap-3 rounded-lg py-3 shadow-none">
                  <CardHeader className="gap-1 px-4">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <ListChecks className="text-muted-foreground size-4" />
                      Rotation queue
                    </CardTitle>
                    <CardDescription>
                      Good candidates to consider next.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-1 px-4">
                    {underused.length === 0 && !isLoading ? (
                      <p className="text-muted-foreground px-2 py-1.5 text-sm">
                        No underused people in this sample.
                      </p>
                    ) : (
                      underused.slice(0, 6).map((person) => (
                        <button
                          key={`queue-${person.id}`}
                          type="button"
                          className="hover:bg-muted/50 flex items-center gap-3 rounded-md px-2 py-1.5 text-left"
                          onFocus={() => prefetchPersonDetail(person)}
                          onPointerEnter={() => prefetchPersonDetail(person)}
                          onTouchStart={() => prefetchPersonDetail(person)}
                          onClick={() => openPerson(person)}
                        >
                          <PersonAvatar person={person} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {person.name}
                            </span>
                            <span className="text-muted-foreground block truncate text-xs">
                              {person.highlight}
                            </span>
                          </span>
                        </button>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/40 gap-3 rounded-lg py-3 shadow-none">
                  <CardHeader className="gap-1 px-4">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Clock3 className="text-muted-foreground size-4" />
                      Cadence watch
                    </CardTitle>
                    <CardDescription>
                      People whose serving rhythm changed this month.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-1 px-4">
                    {needsRest.length === 0 && !isLoading ? (
                      <p className="text-muted-foreground px-2 py-1.5 text-sm">
                        No high-load people in this sample.
                      </p>
                    ) : (
                      needsRest.slice(0, 3).map((person) => (
                        <button
                          key={`cadence-${person.id}`}
                          type="button"
                          className="hover:bg-muted/50 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left"
                          onFocus={() => prefetchPersonDetail(person)}
                          onPointerEnter={() => prefetchPersonDetail(person)}
                          onTouchStart={() => prefetchPersonDetail(person)}
                          onClick={() => openPerson(person)}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {person.name}
                            </span>
                            <span className="text-muted-foreground block truncate text-xs">
                              {person.streak}
                            </span>
                          </span>
                          <Badge variant="outline">{person.monthCount}</Badge>
                        </button>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </section>

            <aside className="flex flex-col gap-2 pb-1 lg:min-h-0 lg:overflow-y-auto">
              <Card className="border-border/40 gap-3 rounded-lg py-3 shadow-none">
                <CardHeader className="gap-1 px-4">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Medal className="text-muted-foreground size-4" />
                    MVP of the month
                  </CardTitle>
                  <CardDescription>
                    {mvp
                      ? mvp.highlight
                      : isLoading
                        ? "Loading current roster..."
                        : "No people loaded yet."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4">
                  {mvp ? (
                    <button
                      type="button"
                      className="border-border/40 bg-card/40 hover:bg-muted/50 flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left"
                      onFocus={() => prefetchPersonDetail(mvp)}
                      onPointerEnter={() => prefetchPersonDetail(mvp)}
                      onTouchStart={() => prefetchPersonDetail(mvp)}
                      onClick={() => openPerson(mvp)}
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

              <Card className="border-border/40 gap-3 rounded-lg py-3 shadow-none">
                <CardHeader className="gap-1 px-4">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <ShieldAlert className="text-muted-foreground size-4" />
                    Needs attention
                  </CardTitle>
                  <CardDescription>
                    People above cadence or ready to re-enter rotation.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-1 px-4">
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
                        onFocus={() => prefetchPersonDetail(person)}
                        onPointerEnter={() => prefetchPersonDetail(person)}
                        onTouchStart={() => prefetchPersonDetail(person)}
                        onClick={() => openPerson(person)}
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

              <Card className="border-border/40 gap-3 rounded-lg py-3 shadow-none">
                <CardHeader className="gap-1 px-4">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <CalendarDays className="text-muted-foreground size-4" />
                    {dashboard?.month.label ?? "Month"} rhythm
                  </CardTitle>
                  <CardDescription>
                    Org-level serving pressure across the month.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4">
                  <div className="text-muted-foreground grid grid-cols-7 gap-1 pb-2 text-center text-xs">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                      (dayName) => (
                        <div key={dayName}>{dayName}</div>
                      )
                    )}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {rhythmCalendarCells.map((cell) => {
                      if (cell.day === null) {
                        return <div key={cell.key} className="aspect-square" />;
                      }
                      const day = cell.day;
                      const monthDay = dashboard?.monthDays.find(
                        (entry) => entry.day === day
                      );
                      const confirmedServiceCount =
                        monthDay?.confirmedServiceCount ?? 0;
                      const potentialServiceCount =
                        monthDay?.potentialServiceCount ?? 0;
                      const rehearsalCount = monthDay?.rehearsalCount ?? 0;
                      const serviceCount = monthDay?.serviceCount ?? 0;
                      const heatLevel =
                        serviceCount >= 8
                          ? "high"
                          : serviceCount >= 3
                            ? "medium"
                            : serviceCount > 0
                              ? "low"
                              : "empty";
                      const hasRehearsalOnly =
                        serviceCount === 0 && rehearsalCount > 0;
                      return (
                        <HoverCard
                          key={cell.key}
                          openDelay={120}
                          closeDelay={120}
                        >
                          <HoverCardTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "border-border/35 hover:bg-muted/60 flex aspect-square flex-col items-start justify-between rounded-md border p-1.5 text-left text-xs tabular-nums",
                                heatLevel === "high" && "bg-emerald-500/20",
                                heatLevel === "medium" && "bg-emerald-500/10",
                                heatLevel === "low" && "bg-muted",
                                hasRehearsalOnly && "bg-muted",
                                serviceCount === 0 &&
                                  rehearsalCount === 0 &&
                                  "text-muted-foreground"
                              )}
                            >
                              <span>{day}</span>
                              <span className="flex items-center gap-0.5">
                                {confirmedServiceCount > 0 ? (
                                  <span className="size-1.5 rounded-full bg-emerald-500" />
                                ) : null}
                                {potentialServiceCount > 0 ? (
                                  <span className="size-1.5 rounded-full bg-amber-500" />
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
                            </button>
                          </HoverCardTrigger>
                          <HoverCardContent
                            side="top"
                            className="w-48 px-3 py-2"
                          >
                            <p className="text-xs font-medium">
                              {dashboard?.month.label.split(" ")[0] ?? "Month"}{" "}
                              {day}
                            </p>
                            {serviceCount > 0 || rehearsalCount > 0 ? (
                              <div className="text-muted-foreground mt-1 grid gap-1 text-xs">
                                {confirmedServiceCount > 0 ? (
                                  <div className="flex items-center gap-2">
                                    <span className="size-1.5 rounded-full bg-emerald-500" />
                                    <span>
                                      {confirmedServiceCount} confirmed
                                    </span>
                                  </div>
                                ) : null}
                                {potentialServiceCount > 0 ? (
                                  <div className="flex items-center gap-2">
                                    <span className="size-1.5 rounded-full bg-amber-500" />
                                    <span>
                                      {potentialServiceCount} potential
                                    </span>
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
                            ) : (
                              <p className="text-muted-foreground mt-1 text-xs">
                                No scheduled commitments.
                              </p>
                            )}
                          </HoverCardContent>
                        </HoverCard>
                      );
                    })}
                  </div>
                  {dashboard?.requestBudget.sampled ? (
                    <p className="text-muted-foreground mt-3 text-xs">
                      Showing {dashboard.requestBudget.hydratedPeopleCount} of{" "}
                      {dashboard.requestBudget.rosterPeopleCount} roster people.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </aside>
          </div>
        ) : dashboard ? (
          <MonthView
            people={visiblePeople}
            month={dashboard.month}
            monthDays={dashboard.monthDays}
            matrixDays={dashboard.matrixDays}
            onSelectPerson={openPerson}
            onPreviewPerson={prefetchPersonDetail}
          />
        ) : (
          <div className="border-border/40 text-muted-foreground rounded-lg border px-4 py-8 text-sm">
            Loading month view…
          </div>
        )}
      </div>
    </main>
  );
}

function MonthView({
  people,
  month,
  monthDays,
  matrixDays,
  onSelectPerson,
  onPreviewPerson,
}: {
  people: PeopleDashboardPerson[];
  month: {
    year: number;
    monthIndex: number;
    label: string;
    daysInMonth: number;
    startsOnWeekday: number;
  };
  monthDays: Array<{
    day: number;
    serviceCount: number;
    confirmedServiceCount: number;
    potentialServiceCount: number;
    rehearsalCount: number;
    blockoutCount: number;
  }>;
  matrixDays: number[];
  onSelectPerson: (person: PeopleDashboardPerson) => void;
  onPreviewPerson: (person: PeopleDashboardPerson) => void;
}) {
  const [selectedDay, setSelectedDay] = useState(
    monthDays.find((day) => day.serviceCount > 0)?.day ?? 1
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
    <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="flex flex-col gap-3 lg:min-h-0">
        <Card className="border-border/40 gap-3 rounded-lg py-3 shadow-none">
          <CardHeader className="gap-1 px-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarDays className="text-muted-foreground size-4" />
              {month.label} serving rhythm
            </CardTitle>
            <CardDescription>
              Heatmap of scheduled people across all service days.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            <div className="text-muted-foreground grid grid-cols-7 gap-1.5 pb-2 text-center text-xs">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                (dayName) => (
                  <div key={dayName}>{dayName}</div>
                )
              )}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {calendarCells.map((cell) => {
                if (cell.day === null) {
                  return (
                    <div key={cell.key} className="aspect-square min-h-16" />
                  );
                }
                const day = cell.day;
                const monthDay = monthDays.find((entry) => entry.day === day);
                const serviceCount = monthDay?.serviceCount ?? 0;
                const confirmedServiceCount =
                  monthDay?.confirmedServiceCount ?? 0;
                const potentialServiceCount =
                  monthDay?.potentialServiceCount ?? 0;
                const rehearsalCount = monthDay?.rehearsalCount ?? 0;
                const heatLevel =
                  serviceCount >= 8
                    ? "high"
                    : serviceCount >= 3
                      ? "medium"
                      : serviceCount > 0
                        ? "low"
                        : "empty";
                const hasRehearsalOnly =
                  serviceCount === 0 && rehearsalCount > 0;
                return (
                  <HoverCard key={day} openDelay={120} closeDelay={120}>
                    <HoverCardTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "border-border/40 hover:bg-muted/60 flex aspect-square min-h-16 flex-col items-start justify-between rounded-md border p-2 text-left",
                          heatLevel === "high" && "bg-emerald-500/20",
                          heatLevel === "medium" && "bg-emerald-500/10",
                          heatLevel === "low" && "bg-muted",
                          hasRehearsalOnly && "bg-muted",
                          day === selectedDay && "ring-ring/40 ring-2"
                        )}
                        onClick={() => setSelectedDay(day)}
                      >
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {day}
                        </span>
                        <span className="flex items-center gap-1">
                          {confirmedServiceCount > 0 ? (
                            <Badge
                              variant="secondary"
                              className="h-5 bg-emerald-500/15 px-1.5 text-[11px] text-emerald-700 dark:text-emerald-300"
                            >
                              {confirmedServiceCount}
                            </Badge>
                          ) : null}
                          {potentialServiceCount > 0 ? (
                            <Badge
                              variant="secondary"
                              className="h-5 bg-amber-500/15 px-1.5 text-[11px] text-amber-700 dark:text-amber-300"
                            >
                              {potentialServiceCount}
                            </Badge>
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
                      </button>
                    </HoverCardTrigger>
                    <HoverCardContent side="top" className="w-52 px-3 py-2">
                      <p className="text-xs font-medium">
                        {month.label.split(" ")[0]} {day}
                      </p>
                      {serviceCount > 0 || rehearsalCount > 0 ? (
                        <div className="text-muted-foreground mt-1 grid gap-1 text-xs">
                          {(monthDay?.confirmedServiceCount ?? 0) > 0 ? (
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "size-1.5 rounded-full",
                                  commitmentMarkerClass("service", "C")
                                )}
                              />
                              <span>
                                {monthDay?.confirmedServiceCount ?? 0} confirmed
                                service commitments
                              </span>
                            </div>
                          ) : null}
                          {(monthDay?.potentialServiceCount ?? 0) > 0 ? (
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "size-1.5 rounded-full",
                                  commitmentMarkerClass("service", "U")
                                )}
                              />
                              <span>
                                {monthDay?.potentialServiceCount ?? 0} potential
                                service commitments
                              </span>
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
                              <span>
                                {rehearsalCount} rehearsal commitments
                              </span>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-muted-foreground mt-1 text-xs">
                          No scheduled commitments.
                        </p>
                      )}
                    </HoverCardContent>
                  </HoverCard>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="border-border/40 overflow-hidden rounded-lg border">
          <div className="border-border/40 bg-background text-muted-foreground grid grid-cols-[1.2fr_repeat(5,minmax(4.5rem,1fr))] border-b text-xs font-medium">
            <div className="px-4 py-2">Person</div>
            {matrixDays.map((day) => (
              <div key={day} className="px-3 py-2 text-center tabular-nums">
                {month.label.split(" ")[0]} {day}
              </div>
            ))}
          </div>
          <div className="divide-border/30 divide-y">
            {people.map((person) => (
              <div
                key={`matrix-${person.id}`}
                className="hover:bg-muted/50 grid w-full grid-cols-[1.2fr_repeat(5,minmax(4.5rem,1fr))] items-center text-left"
              >
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-3 px-4 py-2.5 text-left"
                  onFocus={() => onPreviewPerson(person)}
                  onPointerEnter={() => onPreviewPerson(person)}
                  onTouchStart={() => onPreviewPerson(person)}
                  onClick={() => onSelectPerson(person)}
                >
                  <PersonAvatar person={person} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {person.name}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {person.teams.join(", ")}
                    </p>
                  </div>
                </button>
                {matrixDays.map((day) => {
                  const entries = person.monthDays.filter(
                    (entry) => entry.day === day
                  );
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
                    <div
                      key={`${person.id}-${day}`}
                      className="flex justify-center px-3 py-2"
                    >
                      {marker ? (
                        <HoverCard openDelay={120} closeDelay={120}>
                          <HoverCardTrigger asChild>
                            <button
                              type="button"
                              className="hover:bg-muted flex size-6 items-center justify-center rounded-md"
                              aria-label={`${person.name} ${month.label.split(" ")[0]} ${day}`}
                            >
                              {dot}
                            </button>
                          </HoverCardTrigger>
                          <HoverCardContent
                            side="top"
                            className="w-64 px-3 py-2"
                          >
                            <p className="text-xs font-medium">{person.name}</p>
                            <div className="text-muted-foreground mt-1 flex items-start gap-2 text-xs">
                              <span
                                className={cn(
                                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                                  commitmentMarkerClass(
                                    marker.kind,
                                    marker.status
                                  )
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
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <aside className="flex flex-col gap-2 pb-1 lg:min-h-0 lg:overflow-y-auto">
        <Card className="border-border/40 gap-3 rounded-lg py-3 shadow-none">
          <CardHeader className="gap-1 px-4">
            <CardTitle className="text-sm">
              {month.label.split(" ")[0]} {selectedDay}
            </CardTitle>
            <CardDescription>Selected service day snapshot.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 px-4">
            {scheduledPeople.length === 0 ? (
              <p className="text-muted-foreground px-2 py-1.5 text-sm">
                No scheduled people on this date.
              </p>
            ) : (
              scheduledPeople.map((person) => (
                <button
                  key={`day-${person.id}`}
                  type="button"
                  className="hover:bg-muted/50 flex items-center gap-3 rounded-md px-2 py-1.5 text-left"
                  onFocus={() => onPreviewPerson(person)}
                  onPointerEnter={() => onPreviewPerson(person)}
                  onTouchStart={() => onPreviewPerson(person)}
                  onClick={() => onSelectPerson(person)}
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
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border/40 gap-3 rounded-lg py-3 shadow-none">
          <CardHeader className="gap-1 px-4">
            <CardTitle className="text-sm">Legend</CardTitle>
            <CardDescription>
              Calendar markers match person detail markers.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 px-4 text-sm">
            <LegendDot className="bg-emerald-500" label="Confirmed" />
            <LegendDot className="bg-amber-500" label="Potential" />
            <LegendDot className="bg-muted-foreground/70" label="Rehearsal" />
            <LegendDot className="bg-border" label="No service shown" />
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("size-2 rounded-full", className)} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

export function buildCalendarCells(
  startsOnWeekday: number,
  daysInMonth: number
): CalendarCell[] {
  const blanks: CalendarCell[] = Array.from(
    { length: startsOnWeekday },
    (_, index) => ({
      day: null,
      key: `blank-start-${index}`,
    })
  );
  const days: CalendarCell[] = Array.from(
    { length: daysInMonth },
    (_, index) => ({
      day: index + 1,
      key: `day-${index + 1}`,
    })
  );
  return [...blanks, ...days];
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border/40 rounded-lg border px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

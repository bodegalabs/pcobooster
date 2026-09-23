"use client";

import type {
  PeopleDashboardData,
  PeopleDashboardPerson,
  PeopleDashboardRange,
} from "@pcobooster/contracts/people-schemas";
import { useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useMemo, useState } from "react";

import {
  buildCalendarCells,
  monthDays as defaultMonthDays,
} from "@/components/people/calendar";
import { PeopleHealthView } from "@/components/people/health-view";
import { MonthView } from "@/components/people/month-view";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { LoadingBar } from "@/components/ui/loading-bar";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePeopleDashboard } from "@/hooks/use-people-dashboard";
import { createPeopleDashboardPersonQueryOptions } from "@/hooks/use-people-dashboard-person";

const EMPTY_PEOPLE: PeopleDashboardPerson[] = [];

interface PeoplePageContentProps {
  activeView: "health" | "month";
  dashboard: PeopleDashboardData | undefined;
  isError: boolean;
  isLoading: boolean;
  visiblePeople: PeopleDashboardPerson[];
  mvp: PeopleDashboardPerson | null;
  needsRest: PeopleDashboardPerson[];
  underused: PeopleDashboardPerson[];
  rhythmCalendarCells: ReturnType<typeof buildCalendarCells>;
  onPreviewPerson: (person: PeopleDashboardPerson) => void;
  onOpenPerson: (person: PeopleDashboardPerson) => void;
}

const PeoplePageContent = ({
  activeView,
  dashboard,
  isError,
  isLoading,
  visiblePeople,
  mvp,
  needsRest,
  underused,
  rhythmCalendarCells,
  onPreviewPerson,
  onOpenPerson,
}: PeoplePageContentProps) => {
  if (isError) {
    return (
      <div className="border-border/40 text-muted-foreground rounded-lg border px-4 py-8 text-sm">
        People dashboard failed to load. Refresh and try again.
      </div>
    );
  }
  if (activeView === "health") {
    return (
      <PeopleHealthView
        dashboard={dashboard}
        visiblePeople={visiblePeople}
        isLoading={isLoading}
        mvp={mvp}
        needsRest={needsRest}
        underused={underused}
        rhythmCalendarCells={rhythmCalendarCells}
        onPreviewPerson={onPreviewPerson}
        onOpenPerson={onOpenPerson}
      />
    );
  }
  if (dashboard) {
    return (
      <MonthView
        people={visiblePeople}
        month={dashboard.month}
        monthDays={dashboard.monthDays}
        matrixDays={dashboard.matrixDays}
        onSelectPerson={onOpenPerson}
        onPreviewPerson={onPreviewPerson}
      />
    );
  }
  return (
    <div
      className="grid shrink-0 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]"
      aria-busy
      aria-label="Loading month view"
    >
      <div className="border-border/40 flex flex-col gap-2 rounded-xl border p-4">
        <Skeleton variant="text" className="h-4 w-36" />
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 py-1">
            <Skeleton variant="round" className="size-7 shrink-0" />
            <Skeleton variant="text" className="h-3 w-28" />
            <Skeleton variant="text" className="ml-auto h-5 w-2/3" />
          </div>
        ))}
      </div>
      <Skeleton variant="control" className="h-72" />
    </div>
  );
};

export const PeoplePage = () => {
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
    : buildCalendarCells(0, defaultMonthDays.length);
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

  const mvp = people.at(0) ?? null;
  const needsRest = people.filter(
    (person) => person.load === "rest" || person.load === "high"
  );
  const underused = people.filter((person) => person.load === "low");
  const prefetchPersonDetail = useCallback(
    (person: PeopleDashboardPerson) => {
      router.prefetch(`/people/${person.id}`);
      void (async () => {
        try {
          await queryClient.query(
            createPeopleDashboardPersonQueryOptions(person.id, null)
          );
        } catch {
          // Prefetching improves navigation speed but is optional.
        }
      })();
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
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-3 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
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
              onValueChange={(value) => {
                setActiveView(value === "month" ? "month" : "health");
              }}
            >
              <TabsList className="h-8">
                <TabsTrigger value="health">Health</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
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
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
                placeholder="Search people, teams, or roles"
                aria-label="Search people"
              />
            </InputGroup>
            <NativeSelect
              className="w-full"
              aria-label="Select time range"
              value={range}
              onChange={(event) => {
                const nextRange = event.target.value;
                if (
                  nextRange === "month" ||
                  nextRange === "30" ||
                  nextRange === "90"
                ) {
                  setRange(nextRange);
                }
              }}
            >
              <NativeSelectOption value="month">This month</NativeSelectOption>
              <NativeSelectOption value="30">Last 30 days</NativeSelectOption>
              <NativeSelectOption value="90">Last 90 days</NativeSelectOption>
            </NativeSelect>
            <NativeSelect
              className="w-full"
              aria-label="Filter team"
              value={selectedTeam}
              onChange={(event) => {
                setSelectedTeam(event.target.value);
              }}
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

        <LoadingBar
          active={isPlaceholderData && !isError}
          className="-my-1.5 shrink-0"
        />

        <div
          className="stale-while-busy shrink-0"
          aria-busy={isPlaceholderData && !isError}
        >
          <PeoplePageContent
            activeView={activeView}
            dashboard={dashboard}
            isError={isError}
            isLoading={isLoading}
            visiblePeople={visiblePeople}
            mvp={mvp}
            needsRest={needsRest}
            underused={underused}
            rhythmCalendarCells={rhythmCalendarCells}
            onPreviewPerson={prefetchPersonDetail}
            onOpenPerson={openPerson}
          />
        </div>
      </div>
    </main>
  );
};

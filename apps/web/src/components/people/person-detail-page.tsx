import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buildCalendarCells } from "@/components/people/calendar";
import {
  PersonDetailBodySkeleton,
  PersonDetailState,
} from "@/components/people/detail-body";
import { PersonAvatar } from "@/components/people/shared-components";
import { Button } from "@/components/ui/button";
import { LoadingBar } from "@/components/ui/loading-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { usePeopleDashboardPerson } from "@/hooks/use-people-dashboard-person";

const PersonHeaderSkeleton = () => (
  <div className="flex min-w-0 items-center gap-3">
    <Skeleton variant="round" className="size-6 shrink-0" />
    <div className="flex min-w-0 flex-col gap-2">
      <Skeleton variant="control" className="h-6 w-44 md:h-7" />
      <Skeleton variant="text" className="h-3.5 w-64 max-w-full" />
    </div>
  </div>
);

const MonthNavSkeleton = () => (
  <div className="flex items-center gap-1">
    <Skeleton variant="control" className="size-8" />
    <Skeleton variant="text" className="h-8 w-36" />
    <Skeleton variant="control" className="size-8" />
  </div>
);

export const PersonDetailPageSkeleton = () => (
  <main className="bg-background flex h-full min-h-0 flex-col overflow-hidden">
    <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-3 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <PersonHeaderSkeleton />
        <MonthNavSkeleton />
      </header>
      <PersonDetailBodySkeleton />
    </div>
  </main>
);

/**
 * Month paging only changes a search param; the query keeps the page populated while the
 * next month loads.
 */
export const PersonDetailPage = ({
  personId,
  month,
}: {
  personId: string;
  month: string | null;
}) => {
  const { data, isError, isFetching, isLoading, isPlaceholderData, refetch } =
    usePeopleDashboardPerson(personId, month);
  const handleRetry = () => {
    void refetch();
  };
  const person = data?.person ?? null;
  const monthLabel = data?.month.label ?? "Month";
  const calendarCells = data
    ? buildCalendarCells(data.month.startsOnWeekday, data.month.daysInMonth)
    : [];

  return (
    <main className="bg-background flex h-full min-h-0 flex-col overflow-hidden">
      <div className="pb-safe-4 mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pt-1 md:py-4">
        <header className="flex shrink-0 flex-col gap-3">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {person ? (
                <>
                  <PersonAvatar person={person} />
                  <div className="min-w-0">
                    <h1 className="truncate text-xl font-semibold tracking-tight md:text-2xl">
                      {person.name}
                    </h1>
                    <p className="text-muted-foreground truncate text-sm">
                      {person.teams.join(", ")} · {person.roles}
                    </p>
                  </div>
                </>
              ) : (
                <PersonHeaderSkeleton />
              )}
            </div>

            {data ? (
              <div className="flex items-center gap-1">
                <Button
                  nativeButton={false}
                  render={
                    <Link
                      to="/people/$personId"
                      params={{ personId }}
                      search={{ month: data.previousMonth }}
                      aria-label="Previous month"
                    />
                  }
                  variant="outline"
                  size="icon"
                  className="size-8"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <div className="border-border/40 flex h-8 min-w-36 items-center justify-center rounded-md border px-3 text-sm font-medium">
                  {monthLabel}
                </div>
                <Button
                  nativeButton={false}
                  render={
                    <Link
                      to="/people/$personId"
                      params={{ personId }}
                      search={{ month: data.nextMonth }}
                      aria-label="Next month"
                    />
                  }
                  variant="outline"
                  size="icon"
                  className="size-8"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            ) : (
              <MonthNavSkeleton />
            )}
          </div>
          <LoadingBar
            active={isPlaceholderData && !isError}
            className="-mt-1.5 -mb-1"
          />
        </header>

        {isError ? (
          <div
            className="border-border/40 text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-4 py-8 text-sm"
            aria-live="polite"
          >
            <span className="text-destructive">
              Person details failed to load.
            </span>
            <Button
              variant="outline"
              size="xs"
              disabled={isFetching}
              onClick={handleRetry}
            >
              Retry
            </Button>
          </div>
        ) : (
          <PersonDetailState
            data={data}
            monthLabel={monthLabel}
            calendarCells={calendarCells}
            isLoading={isLoading}
            isPlaceholderData={isPlaceholderData}
          />
        )}
      </div>
    </main>
  );
};

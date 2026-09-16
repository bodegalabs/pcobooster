"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { buildCalendarCells } from "@/components/people/calendar";
import { PersonDetailState } from "@/components/people/detail-body";
import { PersonAvatar } from "@/components/people/shared-components";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePeopleDashboardPerson } from "@/hooks/use-people-dashboard-person";

export const PersonDetailPage = ({ personId }: { personId: string }) => {
  const searchParams = useSearchParams();
  const month = searchParams.get("month");
  const { data, isError, isLoading, isPlaceholderData } =
    usePeopleDashboardPerson(personId, month);
  const person = data?.person ?? null;
  const monthLabel = data?.month.label ?? "Month";
  const calendarCells = data
    ? buildCalendarCells(data.month.startsOnWeekday, data.month.daysInMonth)
    : [];

  return (
    <main className="bg-background flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-3 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
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
                <div className="min-w-0">
                  <Skeleton className="h-7 w-44" />
                  <Skeleton className="mt-2 h-4 w-72" />
                </div>
              )}
            </div>

            {data ? (
              <div className="flex items-center gap-1">
                <Button
                  asChild
                  variant="outline"
                  size="icon"
                  className="size-8"
                >
                  <Link
                    href={`/people/${personId}?month=${data.previousMonth}`}
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="size-4" />
                  </Link>
                </Button>
                <div className="border-border/40 flex h-8 min-w-36 items-center justify-center rounded-md border px-3 text-sm font-medium">
                  {monthLabel}
                </div>
                <Button
                  asChild
                  variant="outline"
                  size="icon"
                  className="size-8"
                >
                  <Link
                    href={`/people/${personId}?month=${data.nextMonth}`}
                    aria-label="Next month"
                  >
                    <ChevronRight className="size-4" />
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
        </header>

        {isError ? (
          <div className="border-border/40 text-muted-foreground rounded-lg border px-4 py-8 text-sm">
            Person details failed to load. Go back and try again.
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

import type { PeopleDashboardPerson } from "@pcobooster/contracts/people-schemas";
import { Medal, ShieldAlert } from "lucide-react";

import type { CalendarCell } from "@/components/people/calendar";
import { HealthRhythm } from "@/components/people/health-rhythm";
import {
  PersonLineSkeleton,
  PersonLineSkeletonList,
} from "@/components/people/people-skeletons";
import {
  PersonAvatar,
  PersonRowButton,
} from "@/components/people/shared-components";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { GetIntentPrefetchProps } from "@/hooks/use-intent-prefetch";
import type { PeopleDashboardData } from "@/lib/people-dashboard";

interface HealthSidebarProps {
  dashboard: PeopleDashboardData | undefined;
  isLoading: boolean;
  mvp: PeopleDashboardPerson | null;
  needsRest: PeopleDashboardPerson[];
  underused: PeopleDashboardPerson[];
  rhythmCalendarCells: CalendarCell[];
  getPersonIntentProps: GetIntentPrefetchProps<PeopleDashboardPerson>;
  onOpenPerson: (person: PeopleDashboardPerson) => void;
}

export const HealthSidebar = ({
  dashboard,
  isLoading,
  mvp,
  needsRest,
  underused,
  rhythmCalendarCells,
  getPersonIntentProps,
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
          {isLoading && !mvp ? (
            <Skeleton variant="text" className="mt-0.5 h-3.5 w-48" />
          ) : (
            (mvp?.highlight ?? "No people loaded yet.")
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {mvp ? (
          <PersonRowButton
            person={mvp}
            getPersonIntentProps={getPersonIntentProps}
            onOpenPerson={onOpenPerson}
            variant="outline"
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
          </PersonRowButton>
        ) : null}
        {!mvp && isLoading ? (
          <div className="border-border/40 flex items-center gap-3 rounded-md border px-1 py-0.5">
            <PersonLineSkeleton index={0} />
          </div>
        ) : null}
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
        {isLoading ? (
          <PersonLineSkeletonList rows={3} showAvatar={false} />
        ) : null}
        {[...needsRest, ...underused].length === 0 && !isLoading ? (
          <p className="text-muted-foreground px-2 py-1.5 text-sm">
            No attention items in this sample.
          </p>
        ) : (
          [...needsRest, ...underused].slice(0, 4).map((person) => (
            <PersonRowButton
              key={person.id}
              person={person}
              getPersonIntentProps={getPersonIntentProps}
              onOpenPerson={onOpenPerson}
            >
              <span className="bg-muted-foreground size-1.5 shrink-0 rounded-full" />
              <span className="min-w-0 flex-1 truncate text-sm">
                {person.name}
              </span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {person.status}
              </span>
            </PersonRowButton>
          ))
        )}
      </CardContent>
    </Card>

    <HealthRhythm dashboard={dashboard} calendarCells={rhythmCalendarCells} />
  </aside>
);

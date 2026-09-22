"use client";

import type {
  PeopleDashboardData,
  PeopleDashboardPerson,
} from "@pcobooster/contracts/people-schemas";

import type { buildCalendarCells } from "@/components/people/calendar";
import { HealthQueues } from "@/components/people/health-queues";
import { HealthRoster } from "@/components/people/health-roster";
import { HealthSidebar } from "@/components/people/health-sidebar";

interface PeopleHealthViewProps {
  dashboard: PeopleDashboardData | undefined;
  visiblePeople: PeopleDashboardPerson[];
  isLoading: boolean;
  isPlaceholderData: boolean;
  mvp: PeopleDashboardPerson | null;
  needsRest: PeopleDashboardPerson[];
  underused: PeopleDashboardPerson[];
  rhythmCalendarCells: ReturnType<typeof buildCalendarCells>;
  onPreviewPerson: (person: PeopleDashboardPerson) => void;
  onOpenPerson: (person: PeopleDashboardPerson) => void;
}

export const PeopleHealthView = ({
  dashboard,
  visiblePeople,
  isLoading,
  isPlaceholderData,
  mvp,
  needsRest,
  underused,
  rhythmCalendarCells,
  onPreviewPerson,
  onOpenPerson,
}: PeopleHealthViewProps) => (
  <div
    className="grid shrink-0 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]"
    aria-busy={isPlaceholderData}
  >
    <section className="flex min-w-0 flex-col gap-3">
      <HealthRoster
        dashboard={dashboard}
        visiblePeople={visiblePeople}
        isLoading={isLoading}
        onPreviewPerson={onPreviewPerson}
        onOpenPerson={onOpenPerson}
      />
      <HealthQueues
        underused={underused}
        needsRest={needsRest}
        isLoading={isLoading}
        onPreviewPerson={onPreviewPerson}
        onOpenPerson={onOpenPerson}
      />
    </section>
    <HealthSidebar
      dashboard={dashboard}
      isLoading={isLoading}
      mvp={mvp}
      needsRest={needsRest}
      underused={underused}
      rhythmCalendarCells={rhythmCalendarCells}
      onPreviewPerson={onPreviewPerson}
      onOpenPerson={onOpenPerson}
    />
  </div>
);

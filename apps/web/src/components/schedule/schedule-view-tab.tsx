import type {
  FilledPositionPerson,
  PersonWithAvailability,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import { CalendarDays } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { CandidateListProgress } from "@/components/schedule/candidate-list-progress";
import { PlanPersonStatusMenu } from "@/components/schedule/plan-person-status-menu";
import type { PlanPersonStatusValue } from "@/components/schedule/plan-person-status-menu";
import { PositionPickerList } from "@/components/schedule/position-picker-list";
import { ScheduleCandidateTile } from "@/components/schedule/schedule-candidate-tile";
import { CandidateListSkeleton } from "@/components/schedule/schedule-skeletons";
import { SectionLabel } from "@/components/schedule/section-label";
import { SelectedPositionHeader } from "@/components/schedule/selected-position-header";
import { SomeoneElseRow } from "@/components/schedule/someone-else-row";
import type { SlotRef } from "@/components/schedule/types";
import { UnselectedPositionEmpty } from "@/components/schedule/unselected-position-empty";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { LoadingBar } from "@/components/ui/loading-bar";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { GetIntentPrefetchProps } from "@/hooks/use-intent-prefetch";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { PositionCandidateList } from "@/hooks/use-position-candidates";
import { useRevealOnLoad } from "@/hooks/use-reveal-on-load";
import { getInitials } from "@/lib/format/initials";
import { partitionPeopleForRecommendationStrip } from "@/lib/people/recommendation-strip-order";
import { cn } from "@/lib/utils";

interface ScheduleViewTabProps {
  teamPositionsLoading: boolean;
  teamPositionGroups: TeamPositionGroup[] | undefined;
  collapsedTeams: Record<string, boolean>;
  selectedTeam: string | null;
  selectedPosition: string | null;
  /** Null for positions without a roster (custom or plan-member positions). */
  candidateList: PositionCandidateList | null;
  selectedServiceTypeId: string | null;
  selectedPlanId: string | null;
  planReferenceDate?: Date | null;
  onToggleTeam: (teamId: string) => void;
  onSelectSlot: (slot: SlotRef, options?: { replace?: boolean }) => void;
  onClearSlot: () => void;
  getSlotIntentProps?: GetIntentPrefetchProps<SlotRef>;
  onAddPosition?: (
    team: { teamId: string; teamName: string },
    positionName: string
  ) => SlotRef | null;
  onScheduleSuccess?: () => void;
  onScheduleError: (message: string) => void;
}

const findSelectedSlotInfo = (
  teamPositionGroups: TeamPositionGroup[] | undefined,
  selectedTeam: string | null,
  selectedPosition: string | null
) => {
  if (
    selectedTeam === null ||
    selectedTeam === "" ||
    selectedPosition === null ||
    selectedPosition === "" ||
    teamPositionGroups === undefined
  ) {
    return null;
  }
  for (const group of teamPositionGroups) {
    if (group.teamId !== selectedTeam) {
      continue;
    }
    const position = group.positions.find((row) => row.id === selectedPosition);
    if (position !== undefined) {
      return {
        teamName: group.teamName,
        positionName: position.name,
        position,
      };
    }
  }
  return null;
};

const TemporaryFilledPersonRow = ({
  person,
  serviceTypeId,
  planId,
  teamId,
  positionId,
  onSuccess,
  onError,
}: {
  person: FilledPositionPerson;
  serviceTypeId?: string | null;
  planId?: string | null;
  teamId?: string | null;
  positionId?: string | null;
  onSuccess?: () => void;
  onError?: (message: string) => void;
}) => {
  const currentStatus: PlanPersonStatusValue =
    person.status === "confirmed" ? "confirmed" : "scheduled";

  return (
    <article className="group/row hover:bg-muted/30 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 sm:py-3">
      <Avatar size="default">
        <AvatarImage
          src={person.photoThumbnailUrl ?? undefined}
          alt={person.name}
        />
        <AvatarFallback>{getInitials(person.name)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0">
        <p className="text-foreground truncate text-sm leading-tight font-medium sm:text-base">
          {person.name}
        </p>
      </div>

      <PlanPersonStatusMenu
        planPersonId={person.planPersonId}
        serviceTypeId={serviceTypeId}
        personId={person.id}
        planId={planId}
        teamId={teamId}
        positionId={positionId}
        currentStatus={currentStatus}
        onSuccess={onSuccess}
        onError={onError}
      />
    </article>
  );
};

interface SchedulePeopleListProps {
  candidateList: PositionCandidateList | null;
  selectedSlotUsesCustomPosition: boolean;
  selectedFilledPeople: FilledPositionPerson[];
  filteredActionable: PersonWithAvailability[];
  filteredExceptions: PersonWithAvailability[];
  selectedServiceTypeId: string | null;
  selectedPlanId: string | null;
  planReferenceDate?: Date | null;
  selectedTeam: string | null;
  selectedPosition: string | null;
  teamName?: string;
  positionName?: string;
  onScheduleSuccess?: () => void;
  onScheduleError: (message: string) => void;
}

const SchedulePeopleList = ({
  candidateList,
  selectedSlotUsesCustomPosition,
  selectedFilledPeople,
  filteredActionable,
  filteredExceptions,
  selectedServiceTypeId,
  selectedPlanId,
  planReferenceDate = null,
  selectedTeam,
  selectedPosition,
  teamName,
  positionName,
  onScheduleSuccess,
  onScheduleError,
}: SchedulePeopleListProps) => {
  const people = candidateList?.people;
  const peopleLoading = candidateList?.isLoading ?? false;
  const scorePending =
    candidateList !== null &&
    !candidateList.complete &&
    candidateList.failedPartCount === 0;
  const revealClassName = useRevealOnLoad(peopleLoading);
  const handleRetryCandidateList = () => {
    candidateList?.retryFailed();
  };
  const personTileKey = (person: PersonWithAvailability) =>
    [
      person.id,
      selectedServiceTypeId ?? "no-st",
      selectedPlanId ?? "no-plan",
      selectedTeam ?? "no-team",
      selectedPosition ?? "no-position",
    ].join(":");

  if (peopleLoading) {
    return <CandidateListSkeleton />;
  }

  if (people === undefined || people.length === 0) {
    return (
      <div className="border-border/40 bg-card/30 divide-border/25 divide-y overflow-hidden rounded-xl border">
        {selectedSlotUsesCustomPosition && selectedFilledPeople.length > 0 ? (
          selectedFilledPeople.map((person) => (
            <TemporaryFilledPersonRow
              key={`${selectedPosition}:${person.planPersonId}`}
              person={person}
              serviceTypeId={selectedServiceTypeId}
              planId={selectedPlanId}
              teamId={selectedTeam}
              positionId={selectedPosition}
              onSuccess={onScheduleSuccess}
              onError={onScheduleError}
            />
          ))
        ) : (
          <Empty className="mx-2">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarDays />
              </EmptyMedia>
              <EmptyTitle>
                {selectedSlotUsesCustomPosition
                  ? "No one scheduled"
                  : "No roster candidates"}
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
        <SomeoneElseRow
          serviceTypeId={selectedServiceTypeId}
          planId={selectedPlanId}
          teamId={selectedTeam}
          positionId={selectedPosition}
          teamName={teamName}
          positionName={positionName}
          onScheduleSuccess={onScheduleSuccess}
          onScheduleError={onScheduleError}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-col gap-4 pb-4 sm:gap-5 sm:pr-2",
        revealClassName
      )}
    >
      <section className="flex flex-col gap-2">
        {candidateList === null ? null : (
          <>
            <LoadingBar
              active={candidateList.isFetching}
              className="-my-1 shrink-0"
            />
            <CandidateListProgress
              progress={candidateList.progress}
              isEnriching={candidateList.isEnriching}
              failedPartCount={candidateList.failedPartCount}
              onRetry={handleRetryCandidateList}
            />
          </>
        )}
        <div className="border-border/40 bg-card/30 divide-border/25 divide-y overflow-hidden rounded-xl border">
          {filteredActionable.map((person) => (
            <ScheduleCandidateTile
              key={personTileKey(person)}
              person={person}
              serviceTypeId={selectedServiceTypeId}
              planId={selectedPlanId}
              planReferenceDate={planReferenceDate}
              teamId={selectedTeam}
              positionId={selectedPosition}
              teamName={teamName}
              positionName={positionName}
              oneOff={selectedSlotUsesCustomPosition}
              scorePending={scorePending}
              onScheduleSuccess={onScheduleSuccess}
              onScheduleError={onScheduleError}
            />
          ))}
          <SomeoneElseRow
            serviceTypeId={selectedServiceTypeId}
            planId={selectedPlanId}
            teamId={selectedTeam}
            positionId={selectedPosition}
            teamName={teamName}
            positionName={positionName}
            onScheduleSuccess={onScheduleSuccess}
            onScheduleError={onScheduleError}
          />
        </div>
      </section>

      {filteredExceptions.length > 0 ? (
        <section className="flex flex-col gap-2">
          <SectionLabel title="Unavailable" count={filteredExceptions.length} />
          <div className="border-border/30 bg-card/20 divide-border/20 divide-y overflow-hidden rounded-xl border opacity-80">
            {filteredExceptions.map((person) => (
              <ScheduleCandidateTile
                key={personTileKey(person)}
                person={person}
                serviceTypeId={selectedServiceTypeId}
                planId={selectedPlanId}
                planReferenceDate={planReferenceDate}
                teamId={selectedTeam}
                positionId={selectedPosition}
                teamName={teamName}
                positionName={positionName}
                oneOff={selectedSlotUsesCustomPosition}
                scorePending={scorePending}
                onScheduleSuccess={onScheduleSuccess}
                onScheduleError={onScheduleError}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
};

const ScheduleViewContent = ({
  teamPositionsLoading,
  teamPositionGroups,
  collapsedTeams,
  selectedTeam,
  selectedPosition,
  candidateList,
  selectedServiceTypeId,
  selectedPlanId,
  planReferenceDate = null,
  onToggleTeam,
  onSelectSlot,
  onClearSlot,
  getSlotIntentProps,
  onAddPosition,
  onScheduleSuccess,
  onScheduleError,
}: ScheduleViewTabProps) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const deferredFilter = useDeferredValue(filter);
  /** Tailwind `lg`: sidebar visible; sheet only below this width. */
  const isWidePickerLayout = useMediaQuery("(min-width: 1024px)");

  const selectedSlotInfo = findSelectedSlotInfo(
    teamPositionGroups,
    selectedTeam,
    selectedPosition
  );

  const hasSlots = !!teamPositionGroups && teamPositionGroups.length > 0;
  const selectedSlotUsesCustomPosition =
    selectedSlotInfo?.position.source === "plan_member" ||
    selectedSlotInfo?.position.source === "custom";
  const selectedFilledPeople = selectedSlotInfo?.position.filledPeople ?? [];

  const hasSelectedPosition =
    selectedPosition !== null && selectedPosition !== "";

  const handleSelectSlot = (slot: SlotRef) => {
    // Switching from the phone sheet replaces the slot so Back still returns to the list.
    onSelectSlot(slot, {
      replace: !isWidePickerLayout && hasSelectedPosition,
    });
    if (!isWidePickerLayout) {
      setPickerOpen(false);
    }
  };

  const people = candidateList?.people;
  const settled = candidateList?.complete ?? true;
  const { actionable, exceptions } = useMemo(
    () => partitionPeopleForRecommendationStrip(people ?? [], { settled }),
    [people, settled]
  );

  const normalizedFilter = deferredFilter.trim().toLowerCase();
  const filteredActionable = useMemo(
    () =>
      normalizedFilter
        ? actionable.filter((person) =>
            person.fullName.toLowerCase().includes(normalizedFilter)
          )
        : actionable,
    [actionable, normalizedFilter]
  );
  const filteredExceptions = useMemo(
    () =>
      normalizedFilter
        ? exceptions.filter((person) =>
            person.fullName.toLowerCase().includes(normalizedFilter)
          )
        : exceptions,
    [exceptions, normalizedFilter]
  );

  const positionPickerList = (
    <PositionPickerList
      teamPositionsLoading={teamPositionsLoading}
      teamPositionGroups={teamPositionGroups}
      collapsedTeams={collapsedTeams}
      selectedTeam={selectedTeam}
      selectedPosition={selectedPosition}
      onToggleTeam={onToggleTeam}
      onSelect={handleSelectSlot}
      getSlotIntentProps={getSlotIntentProps}
      onAddPosition={onAddPosition}
    />
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-3 sm:gap-4 lg:h-full lg:flex-row">
      <aside
        className="border-sidebar-border/40 bg-sidebar/60 text-sidebar-foreground hidden min-h-0 w-[min(18rem,28vw)] shrink-0 flex-col overflow-hidden rounded-xl border lg:flex lg:h-full lg:max-h-full lg:self-stretch"
        aria-label="Positions"
      >
        {positionPickerList}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 sm:gap-4 lg:h-full">
        {hasSelectedPosition ? (
          <>
            <SelectedPositionHeader
              info={selectedSlotInfo}
              onOpenPicker={() => {
                setPickerOpen(true);
              }}
              onBack={onClearSlot}
              hasSlots={hasSlots}
              teamPositionsLoading={teamPositionsLoading}
              filter={filter}
              onFilterChange={setFilter}
            />

            <ScrollArea className="-mx-4 min-h-0 w-auto flex-1 lg:mx-0 lg:h-full lg:w-full">
              <div className="pb-tab-bar px-4 md:pb-0 lg:px-0">
                <SchedulePeopleList
                  candidateList={candidateList}
                  selectedSlotUsesCustomPosition={
                    selectedSlotUsesCustomPosition
                  }
                  selectedFilledPeople={selectedFilledPeople}
                  filteredActionable={filteredActionable}
                  filteredExceptions={filteredExceptions}
                  selectedServiceTypeId={selectedServiceTypeId}
                  selectedPlanId={selectedPlanId}
                  planReferenceDate={planReferenceDate}
                  selectedTeam={selectedTeam}
                  selectedPosition={selectedPosition}
                  teamName={selectedSlotInfo?.teamName}
                  positionName={selectedSlotInfo?.positionName}
                  onScheduleSuccess={onScheduleSuccess}
                  onScheduleError={onScheduleError}
                />
              </div>
            </ScrollArea>
          </>
        ) : (
          <>
            <section
              aria-label="Positions"
              className="border-sidebar-border/40 bg-sidebar/60 text-sidebar-foreground flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border max-md:-mx-4 max-md:rounded-b-none max-md:border-x-0 max-md:border-b-0 lg:hidden"
            >
              <PositionPickerList
                teamPositionsLoading={teamPositionsLoading}
                teamPositionGroups={teamPositionGroups}
                collapsedTeams={collapsedTeams}
                selectedTeam={selectedTeam}
                selectedPosition={selectedPosition}
                onToggleTeam={onToggleTeam}
                onSelect={handleSelectSlot}
                getSlotIntentProps={getSlotIntentProps}
                onAddPosition={onAddPosition}
                clearTabBar
              />
            </section>
            <UnselectedPositionEmpty />
          </>
        )}
      </div>

      <Drawer
        open={pickerOpen && !isWidePickerLayout && hasSelectedPosition}
        onOpenChange={setPickerOpen}
        showSwipeHandle
      >
        <DrawerContent className="h-[min(40rem,calc(100dvh-5rem))] lg:hidden">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-left">Positions</DrawerTitle>
            <DrawerDescription className="sr-only">
              Choose a team position for this plan.
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col">
            {positionPickerList}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export const ScheduleViewTab = (props: ScheduleViewTabProps) => (
  <ScheduleViewContent
    key={`${props.selectedTeam}:${props.selectedPosition}`}
    {...props}
  />
);

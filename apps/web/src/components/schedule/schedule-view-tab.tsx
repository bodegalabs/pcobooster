import type {
  FilledPositionPerson,
  PersonWithAvailability,
  TeamPosition,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import { useDeferredValue, useMemo, useState } from "react";

import { PageScrollArea } from "@/components/page-shell";
import { CandidateListProgress } from "@/components/schedule/candidate-list-progress";
import { NeededSlotsStepper } from "@/components/schedule/needed-slots-stepper";
import { PlanPersonStatusMenu } from "@/components/schedule/plan-person-status-menu";
import type { PlanPersonStatusValue } from "@/components/schedule/plan-person-status-menu";
import { PositionPickerList } from "@/components/schedule/position-picker-list";
import { ScheduleCandidateTile } from "@/components/schedule/schedule-candidate-tile";
import { CandidateListSkeleton } from "@/components/schedule/schedule-skeletons";
import { UnsentNotificationMark } from "@/components/schedule/scheduling-notification-mark";
import { SectionLabel } from "@/components/schedule/section-label";
import { SelectedPositionHeader } from "@/components/schedule/selected-position-header";
import { SomeoneElseRow } from "@/components/schedule/someone-else-row";
import type { SlotRef } from "@/components/schedule/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ItemList } from "@/components/ui/item";
import type { GetIntentPrefetchProps } from "@/hooks/use-intent-prefetch";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { PositionCandidateList } from "@/hooks/use-position-candidates";
import { useRevealOnLoad } from "@/hooks/use-reveal-on-load";
import { useShowScheduleHistory } from "@/hooks/use-show-schedule-history";
import { getInitials } from "@/lib/format/initials";
import { partitionPeopleForRecommendationStrip } from "@/lib/people/recommendation-strip-order";
import { openSlotCount } from "@/lib/schedule/open-positions";
import {
  getPositionNotificationStates,
  getSchedulingNotificationState,
} from "@/lib/schedule/scheduling-notifications";
import type { SchedulingNotificationState } from "@/lib/schedule/scheduling-notifications";
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
    <article className="group/row hover:bg-muted/30 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 sm:py-3">
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

      <div className="flex items-center gap-2">
        {getSchedulingNotificationState(person.notification) === "unsent" ? (
          <UnsentNotificationMark />
        ) : null}
        <PlanPersonStatusMenu
          planPersonId={person.planPersonId}
          serviceTypeId={serviceTypeId}
          personId={person.id}
          personName={person.name}
          planId={planId}
          teamId={teamId}
          positionId={positionId}
          currentStatus={currentStatus}
          onSuccess={onSuccess}
          onError={onError}
        />
      </div>
    </article>
  );
};

/** The slot's remaining openings, as one quiet row under the people already on it. */
const OpenSlotsRow = ({ open }: { open: number }) => (
  <div className="flex items-center gap-2.5 px-4 py-2.5 sm:gap-4 sm:py-3">
    <span
      aria-hidden
      className="border-muted-foreground/40 size-8 shrink-0 rounded-full border border-dashed"
    />
    <p className="text-muted-foreground text-sm sm:text-base">
      {open === 0
        ? "No open slots"
        : `${open} open slot${open === 1 ? "" : "s"}`}
    </p>
  </div>
);

interface SchedulePeopleListProps {
  showHistory: boolean;
  candidateList: PositionCandidateList | null;
  selectedSlotUsesCustomPosition: boolean;
  position: TeamPosition | null;
  notificationStates: ReadonlyMap<string, SchedulingNotificationState>;
  onSlot: PersonWithAvailability[];
  candidates: PersonWithAvailability[];
  exceptions: PersonWithAvailability[];
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
  position,
  notificationStates,
  onSlot,
  candidates,
  exceptions,
  selectedServiceTypeId,
  selectedPlanId,
  planReferenceDate = null,
  selectedTeam,
  selectedPosition,
  teamName,
  positionName,
  onScheduleSuccess,
  onScheduleError,
  showHistory,
}: SchedulePeopleListProps) => {
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

  const filledPeople = position?.filledPeople ?? [];
  const onSlotIds = new Set(onSlot.map((person) => person.id));
  // People on the slot who are not on the position's roster, such as one-off additions.
  const offRosterFilled = filledPeople.filter(
    (person) => !onSlotIds.has(person.personId ?? person.id)
  );
  const open = position === null ? 0 : openSlotCount(position);
  const filledCount = onSlot.length + offRosterFilled.length;
  const renderTile = (person: PersonWithAvailability) => (
    <ScheduleCandidateTile
      key={personTileKey(person)}
      person={person}
      notNotified={notificationStates.get(person.id) === "unsent"}
      serviceTypeId={selectedServiceTypeId}
      planId={selectedPlanId}
      planReferenceDate={planReferenceDate}
      teamId={selectedTeam}
      positionId={selectedPosition}
      teamName={teamName}
      positionName={positionName}
      oneOff={selectedSlotUsesCustomPosition}
      scorePending={scorePending}
      showHistory={showHistory}
      onScheduleSuccess={onScheduleSuccess}
      onScheduleError={onScheduleError}
    />
  );

  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-col gap-4 pb-4 sm:gap-5 sm:pr-2",
        revealClassName
      )}
    >
      {candidateList === null ? null : (
        <CandidateListProgress
          progress={candidateList.progress}
          isFetching={candidateList.isFetching}
          isEnriching={candidateList.isEnriching}
          failedPartCount={candidateList.failedPartCount}
          onRetry={handleRetryCandidateList}
        />
      )}

      <section className="flex flex-col gap-2">
        <SectionLabel
          title="Scheduled"
          count={`${filledCount}/${filledCount + open}`}
        />
        <ItemList bleed="phone">
          {onSlot.map(renderTile)}
          {offRosterFilled.map((person) => (
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
          ))}
          {open > 0 || filledCount === 0 ? <OpenSlotsRow open={open} /> : null}
        </ItemList>
      </section>

      <section className="flex flex-col gap-2">
        <SectionLabel title="Add someone" count={candidates.length} />
        <ItemList bleed="phone">
          {candidates.map(renderTile)}
          {candidates.length === 0 && selectedSlotUsesCustomPosition ? (
            <p className="text-muted-foreground px-4 py-2.5 text-sm">
              This position has no roster. Search for anyone below.
            </p>
          ) : null}
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
        </ItemList>
      </section>

      {exceptions.length > 0 ? (
        <section className="flex flex-col gap-2">
          <SectionLabel title="Unavailable" count={exceptions.length} />
          <ItemList variant="dimmed" bleed="phone">
            {exceptions.map(renderTile)}
          </ItemList>
        </section>
      ) : null}
    </div>
  );
};

const useNameFilter = (
  people: PersonWithAvailability[],
  filter: string
): PersonWithAvailability[] =>
  useMemo(() => {
    const normalized = filter.trim().toLowerCase();
    return normalized
      ? people.filter((person) =>
          person.fullName.toLowerCase().includes(normalized)
        )
      : people;
  }, [people, filter]);

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
  const [showHistory, setShowHistory] = useShowScheduleHistory();
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
  const notificationStates = useMemo(
    () =>
      getPositionNotificationStates(
        teamPositionGroups,
        selectedTeam,
        selectedPosition
      ),
    [teamPositionGroups, selectedTeam, selectedPosition]
  );

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
  const { onSlot, candidates, exceptions } = useMemo(
    () => partitionPeopleForRecommendationStrip(people ?? [], { settled }),
    [people, settled]
  );

  const filteredCandidates = useNameFilter(candidates, deferredFilter);
  const filteredExceptions = useNameFilter(exceptions, deferredFilter);

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
              slotControls={
                selectedSlotInfo &&
                selectedServiceTypeId !== null &&
                selectedPlanId !== null ? (
                  <NeededSlotsStepper
                    serviceTypeId={selectedServiceTypeId}
                    planId={selectedPlanId}
                    position={selectedSlotInfo.position}
                  />
                ) : null
              }
              info={selectedSlotInfo}
              showHistory={showHistory}
              onShowHistoryChange={setShowHistory}
              onOpenPicker={() => {
                setPickerOpen(true);
              }}
              onBack={onClearSlot}
              hasSlots={hasSlots}
              teamPositionsLoading={teamPositionsLoading}
              filter={filter}
              onFilterChange={setFilter}
            />

            <PageScrollArea besidePane>
              <div className="pb-safe-4 md:pb-0">
                <SchedulePeopleList
                  showHistory={showHistory}
                  candidateList={candidateList}
                  selectedSlotUsesCustomPosition={
                    selectedSlotUsesCustomPosition
                  }
                  position={selectedSlotInfo?.position ?? null}
                  notificationStates={notificationStates}
                  onSlot={onSlot}
                  candidates={filteredCandidates}
                  exceptions={filteredExceptions}
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
            </PageScrollArea>
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
                clearSafeArea
              />
            </section>
            {/* Wide layouts open the first position as soon as positions load. */}
            <div className="max-lg:hidden">
              <CandidateListSkeleton />
            </div>
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

"use client";

import { CalendarDays, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import {
  PlanPersonStatusMenu,
  type PlanPersonStatusValue,
} from "@/components/schedule/plan-person-status-menu";
import { PositionPickerList } from "@/components/schedule/position-picker-list";
import { ScheduleCandidateTile } from "@/components/schedule/schedule-candidate-tile";
import { SectionLabel } from "@/components/schedule/section-label";
import { SelectedPositionHeader } from "@/components/schedule/selected-position-header";
import { SomeoneElseRow } from "@/components/schedule/someone-else-row";
import type { SlotRef } from "@/components/schedule/types";
import { UnselectedPositionEmpty } from "@/components/schedule/unselected-position-empty";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { getInitials } from "@/lib/format/initials";
import type {
  FilledPositionPerson,
  PersonWithAvailability,
  TeamPositionGroup,
} from "@/lib/types";
import { partitionPeopleForRecommendationStrip } from "@/lib/use-cases/planning-center/people/recommendation-strip-order";
import { cn } from "@/lib/utils";

interface ScheduleViewTabProps {
  teamPositionsLoading: boolean;
  teamPositionsPlaceholder: boolean;
  teamPositionGroups: TeamPositionGroup[] | undefined;
  collapsedTeams: Record<string, boolean>;
  selectedTeam: string | null;
  selectedPosition: string | null;
  people: PersonWithAvailability[] | undefined;
  peopleLoading: boolean;
  peoplePlaceholder: boolean;
  selectedServiceTypeId: string | null;
  selectedPlanId: string | null;
  onToggleTeam: (teamId: string) => void;
  onSelectSlot: (slot: SlotRef) => void;
  onPreviewSlot?: (slot: SlotRef) => void;
  onAddPosition?: (
    team: { teamId: string; teamName: string },
    positionName: string
  ) => SlotRef | null;
  onScheduleSuccess: () => void;
  onScheduleError: (message: string) => void;
}

export function ScheduleViewTab({
  teamPositionsLoading,
  teamPositionsPlaceholder,
  teamPositionGroups,
  collapsedTeams,
  selectedTeam,
  selectedPosition,
  people,
  peopleLoading,
  peoplePlaceholder,
  selectedServiceTypeId,
  selectedPlanId,
  onToggleTeam,
  onSelectSlot,
  onPreviewSlot,
  onAddPosition,
  onScheduleSuccess,
  onScheduleError,
}: ScheduleViewTabProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const deferredFilter = useDeferredValue(filter);
  /** Tailwind `lg` — sidebar visible; sheet only below this width. */
  const [isWidePickerLayout, setIsWidePickerLayout] = useState(false);

  useEffect(() => {
    setFilter("");
  }, [selectedTeam, selectedPosition]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      const wide = mq.matches;
      setIsWidePickerLayout(wide);
      if (wide) setPickerOpen(false);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const selectedSlotInfo = useMemo(() => {
    if (!selectedTeam || !selectedPosition || !teamPositionGroups) {
      return null;
    }
    for (const group of teamPositionGroups) {
      if (group.teamId !== selectedTeam) continue;
      const position = group.positions.find((p) => p.id === selectedPosition);
      if (position) {
        return {
          teamName: group.teamName,
          positionName: position.name,
          position,
        };
      }
    }
    return null;
  }, [selectedTeam, selectedPosition, teamPositionGroups]);

  const hasSlots = !!teamPositionGroups && teamPositionGroups.length > 0;
  const selectedSlotUsesCustomPosition =
    selectedSlotInfo?.position.source === "plan_member" ||
    selectedSlotInfo?.position.source === "custom";
  const selectedFilledPeople = selectedSlotInfo?.position.filledPeople ?? [];

  const handleSelectSlot = (slot: SlotRef) => {
    onSelectSlot(slot);
    if (!isWidePickerLayout) setPickerOpen(false);
  };

  const { actionable, exceptions } = useMemo(
    () => partitionPeopleForRecommendationStrip(people ?? []),
    [people]
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

  const personTileKey = (person: PersonWithAvailability) =>
    [
      person.id,
      selectedServiceTypeId ?? "no-st",
      selectedPlanId ?? "no-plan",
      selectedTeam ?? "no-team",
      selectedPosition ?? "no-position",
    ].join(":");

  const positionPickerList = (
    <PositionPickerList
      teamPositionsLoading={teamPositionsLoading}
      teamPositionsPlaceholder={teamPositionsPlaceholder}
      teamPositionGroups={teamPositionGroups}
      collapsedTeams={collapsedTeams}
      selectedTeam={selectedTeam}
      selectedPosition={selectedPosition}
      onToggleTeam={onToggleTeam}
      onSelect={handleSelectSlot}
      onPreviewSlot={onPreviewSlot}
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
        {selectedPosition ? (
          <>
            <SelectedPositionHeader
              info={selectedSlotInfo}
              onOpenPicker={() => setPickerOpen(true)}
              hasSlots={hasSlots}
              teamPositionsLoading={teamPositionsLoading}
              filter={filter}
              onFilterChange={setFilter}
            />

            <ScrollArea className="min-h-0 w-full flex-1 lg:h-full">
              {peopleLoading ? (
                <div className="border-border/40 bg-card/30 divide-border/25 divide-y overflow-hidden rounded-2xl border shadow-sm">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-3">
                      <Skeleton className="size-10 shrink-0 rounded-full" />
                      <div className="flex flex-1 flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                      <Skeleton className="hidden h-6 w-24 sm:block" />
                      <Skeleton className="h-8 w-20" />
                    </div>
                  ))}
                </div>
              ) : !people || people.length === 0 ? (
                <div className="border-border/40 bg-card/30 divide-border/25 divide-y overflow-hidden rounded-xl border">
                  {selectedSlotUsesCustomPosition &&
                  selectedFilledPeople.length > 0 ? (
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
                    <Empty className="mx-2 py-8">
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
                    teamName={selectedSlotInfo?.teamName}
                    positionName={selectedSlotInfo?.positionName}
                    onScheduleSuccess={onScheduleSuccess}
                    onScheduleError={onScheduleError}
                  />
                </div>
              ) : (
                <div
                  className="relative flex min-h-0 flex-col gap-4 pb-4 sm:gap-5 sm:pr-2"
                  aria-busy={peoplePlaceholder}
                >
                  {peoplePlaceholder ? (
                    <div className="border-border/60 bg-background/95 text-muted-foreground sticky top-0 z-10 -mb-2 rounded-md border px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
                      Loading selected slot...
                    </div>
                  ) : null}
                  <section className="flex flex-col gap-2">
                    <div
                      className={[
                        "overflow-hidden rounded-xl border border-border/40 bg-card/30 divide-y divide-border/25",
                        peoplePlaceholder
                          ? "pointer-events-none opacity-60"
                          : "",
                      ].join(" ")}
                    >
                      {filteredActionable.map((person) => (
                        <ScheduleCandidateTile
                          key={personTileKey(person)}
                          person={person}
                          serviceTypeId={selectedServiceTypeId}
                          planId={selectedPlanId}
                          teamId={selectedTeam}
                          positionId={selectedPosition}
                          teamName={selectedSlotInfo?.teamName}
                          positionName={selectedSlotInfo?.positionName}
                          oneOff={selectedSlotUsesCustomPosition}
                          onScheduleSuccess={onScheduleSuccess}
                          onScheduleError={onScheduleError}
                        />
                      ))}
                      <SomeoneElseRow
                        serviceTypeId={selectedServiceTypeId}
                        planId={selectedPlanId}
                        teamId={selectedTeam}
                        positionId={selectedPosition}
                        teamName={selectedSlotInfo?.teamName}
                        positionName={selectedSlotInfo?.positionName}
                        onScheduleSuccess={onScheduleSuccess}
                        onScheduleError={onScheduleError}
                      />
                    </div>
                  </section>

                  {filteredExceptions.length > 0 ? (
                    <section className="flex flex-col gap-2">
                      <SectionLabel
                        title="Unavailable"
                        count={filteredExceptions.length}
                      />
                      <div
                        className={[
                          "overflow-hidden rounded-xl border border-border/30 bg-card/20 opacity-80 divide-y divide-border/20",
                          peoplePlaceholder ? "pointer-events-none" : "",
                        ].join(" ")}
                      >
                        {filteredExceptions.map((person) => (
                          <ScheduleCandidateTile
                            key={personTileKey(person)}
                            person={person}
                            serviceTypeId={selectedServiceTypeId}
                            planId={selectedPlanId}
                            teamId={selectedTeam}
                            positionId={selectedPosition}
                            teamName={selectedSlotInfo?.teamName}
                            positionName={selectedSlotInfo?.positionName}
                            oneOff={selectedSlotUsesCustomPosition}
                            onScheduleSuccess={onScheduleSuccess}
                            onScheduleError={onScheduleError}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              )}
            </ScrollArea>
          </>
        ) : (
          <UnselectedPositionEmpty
            hasSlots={hasSlots}
            teamPositionsLoading={teamPositionsLoading}
            onOpenPicker={() => setPickerOpen(true)}
          />
        )}
      </div>

      <div className="lg:hidden">
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent
            showCloseButton={false}
            className="bg-sidebar text-sidebar-foreground data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed inset-0 top-0 left-0 z-50 flex h-svh max-h-none w-screen max-w-none translate-x-0 translate-y-0 grid-cols-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 shadow-none duration-200 sm:max-w-none"
          >
            <DialogHeader className="border-sidebar-border/70 flex h-12 shrink-0 flex-row items-center justify-between gap-3 border-b px-3 py-0 text-left">
              <div className="min-w-0">
                <DialogTitle className="truncate text-sm">
                  Positions
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Choose a team position for this plan.
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                onClick={() => setPickerOpen(false)}
                aria-label="Close positions"
              >
                <X className="size-4" aria-hidden />
              </Button>
            </DialogHeader>
            {positionPickerList}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function TemporaryFilledPersonRow({
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
}) {
  const currentStatus: PlanPersonStatusValue =
    person.status === "confirmed" ? "confirmed" : "scheduled";

  return (
    <article className="group/row hover:bg-muted/30 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 transition-colors sm:py-3">
      <Avatar
        className={cn(
          "size-8 sm:size-9",
          person.status === "confirmed" &&
            "ring-offset-background ring-2 ring-emerald-500/80 ring-offset-2"
        )}
      >
        <AvatarImage
          src={person.photoThumbnailUrl || undefined}
          alt={person.name}
        />
        <AvatarFallback className="bg-muted text-xs font-medium">
          {getInitials(person.name)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0">
        <p className="text-foreground truncate text-sm leading-tight font-medium sm:text-base">
          {person.name}
        </p>
        <p className="text-muted-foreground text-xs">
          {person.status === "confirmed" ? "Confirmed" : "Pending"}
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
}

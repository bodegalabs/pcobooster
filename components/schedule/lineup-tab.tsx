"use client";

import { CalendarDays, ChevronDown } from "lucide-react";
import { useState } from "react";

import { PersonRehearsalTimesPopover } from "@/components/schedule/person-rehearsal-times-popover";
import { PlanPersonStatusMenu } from "@/components/schedule/plan-person-status-menu";
import type { PlanPersonStatusValue } from "@/components/schedule/plan-person-status-menu";
import { PositionPickerIcon } from "@/components/schedule/position-picker-icon";
import { SlotBadgeCluster } from "@/components/schedule/slot-badge-cluster";
import type { SlotRef } from "@/components/schedule/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarMenuSkeleton } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { getInitials } from "@/lib/format/initials";
import type {
  FilledPositionPerson,
  PlanTime,
  TeamPosition,
  TeamPositionGroup,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface LineupTabProps {
  groups: TeamPositionGroup[];
  isLoading: boolean;
  isPlaceholderData: boolean;
  serviceTypeId: string | null;
  planId: string | null;
  seriesId: string | null;
  planTimes: PlanTime[];
  onSelectPosition: (slot: SlotRef) => void;
  onPreviewPosition?: (slot: SlotRef) => void;
}

const lineupSkeletonWidths = ["78%", "66%", "84%", "58%"];
const lineupColumnWidthClass = "w-[min(22rem,78vw)]";

const getFilledPersonStatus = (
  status: FilledPositionPerson["status"]
): PlanPersonStatusValue =>
  status === "confirmed" ? "confirmed" : "scheduled";

const PersonRow = ({
  person,
  serviceTypeId,
  planId,
  seriesId,
  planTimes,
  teamId,
  positionId,
}: {
  person: FilledPositionPerson;
  serviceTypeId: string | null;
  planId: string | null;
  seriesId: string | null;
  planTimes: PlanTime[];
  teamId: string;
  positionId: string;
}) => (
  <li className="group/person hover:bg-sidebar-accent/40 flex items-center gap-2 px-3 py-1">
    <Avatar size="sm">
      <AvatarImage
        src={person.photoThumbnailUrl ?? undefined}
        alt={person.name}
      />
      <AvatarFallback>{getInitials(person.name)}</AvatarFallback>
    </Avatar>
    <span className="min-w-0 flex-1 truncate text-sm">{person.name}</span>
    <PersonRehearsalTimesPopover
      display="lineup"
      person={person}
      serviceTypeId={serviceTypeId}
      planId={planId}
      seriesId={seriesId}
      planTimes={planTimes}
    />
    <PlanPersonStatusMenu
      planPersonId={person.planPersonId}
      serviceTypeId={serviceTypeId}
      personId={person.id}
      planId={planId}
      teamId={teamId}
      positionId={positionId}
      currentStatus={getFilledPersonStatus(person.status)}
    />
  </li>
);

const LineupPositionSection = ({
  teamId,
  teamName,
  position,
  serviceTypeId,
  planId,
  seriesId,
  planTimes,
  onSelectPosition,
  onPreviewPosition,
}: {
  teamId: string;
  teamName: string;
  position: TeamPosition;
  serviceTypeId: string | null;
  planId: string | null;
  seriesId: string | null;
  planTimes: PlanTime[];
  onSelectPosition: (slot: SlotRef) => void;
  onPreviewPosition?: (slot: SlotRef) => void;
}) => {
  const people = position.filledPeople ?? [];
  const isTemporaryPosition =
    !!position.source && position.source !== "team_position";
  const slot = {
    teamId,
    teamName,
    positionId: position.id,
    positionName: position.name,
    source: position.source,
  };

  return (
    <section className="min-w-0">
      <button
        type="button"
        className="hover:bg-sidebar-accent/50 group/header flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left"
        aria-label={`Open ${position.name} in scheduler`}
        onPointerEnter={() => onPreviewPosition?.(slot)}
        onFocus={() => onPreviewPosition?.(slot)}
        onTouchStart={() => onPreviewPosition?.(slot)}
        onClick={() => {
          onSelectPosition(slot);
        }}
      >
        <PositionPickerIcon positionName={position.name} teamName={teamName} />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm font-medium",
            isTemporaryPosition && "italic"
          )}
        >
          {position.name}
        </span>
        <SlotBadgeCluster
          position={position}
          teamName={teamName}
          positionName={position.name}
        />
        <CalendarDays
          className="text-muted-foreground size-3.5 shrink-0 opacity-0 group-hover/header:opacity-100"
          aria-hidden
        />
      </button>
      {people.length > 0 ? (
        <ul className="flex flex-col pb-1">
          {people.map((person) => (
            <PersonRow
              key={`${position.id}-${person.id}-${person.rawStatus}`}
              person={person}
              serviceTypeId={serviceTypeId}
              planId={planId}
              seriesId={seriesId}
              planTimes={planTimes}
              teamId={teamId}
              positionId={position.id}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
};

const TeamColumn = ({
  group,
  serviceTypeId,
  planId,
  seriesId,
  planTimes,
  onSelectPosition,
  onPreviewPosition,
}: {
  group: TeamPositionGroup;
  serviceTypeId: string | null;
  planId: string | null;
  seriesId: string | null;
  planTimes: PlanTime[];
  onSelectPosition: (slot: SlotRef) => void;
  onPreviewPosition?: (slot: SlotRef) => void;
}) => {
  const openNeededCount = group.positions.reduce(
    (sum, position) => sum + (position.neededCount ?? 0),
    0
  );
  const [open, setOpen] = useState(() => openNeededCount > 0);

  return (
    <section
      className={cn(
        "border-sidebar-border/50 bg-sidebar/70 text-sidebar-foreground flex shrink-0 flex-col overflow-hidden rounded-xl border",
        lineupColumnWidthClass
      )}
    >
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="flex min-h-0 flex-1 flex-col"
      >
        <CollapsibleTrigger
          nativeButton={false}
          render={
            <button
              type="button"
              className="hover:bg-sidebar-accent/40 flex w-full items-center gap-2 px-3 py-2.5 text-left"
              aria-label={`${group.teamName} team lineup`}
            />
          }
        >
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
            {group.teamName}
          </h3>
          {openNeededCount > 0 ? (
            <span className="text-status-declined dark:text-status-declined shrink-0 text-xs font-medium tabular-nums">
              {openNeededCount}
            </span>
          ) : (
            <span
              className="bg-status-confirmed-bright/70 size-1.5 shrink-0 rounded-full"
              aria-label="All set"
            />
          )}
          <ChevronDown
            className={cn(
              "text-muted-foreground size-3.5 shrink-0 opacity-60",
              !open && "-rotate-90"
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="min-h-0 flex-1">
          <div className="divide-sidebar-border/40 flex flex-col divide-y">
            {group.positions.map((position) => (
              <LineupPositionSection
                key={position.id}
                teamId={group.teamId}
                teamName={group.teamName}
                position={position}
                serviceTypeId={serviceTypeId}
                planId={planId}
                seriesId={seriesId}
                planTimes={planTimes}
                onSelectPosition={onSelectPosition}
                onPreviewPosition={onPreviewPosition}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
};

const LineupLoadingState = () => (
  <ScrollArea className="min-h-0 flex-1">
    <div className="flex min-w-max items-stretch gap-4 pr-4 pb-3">
      {["a", "b", "c", "d"].map((columnKey) => (
        <div
          key={`lineup-skeleton-column-${columnKey}`}
          className={cn(
            "border-sidebar-border/50 bg-sidebar/70 flex shrink-0 flex-col gap-2 rounded-xl border p-3",
            lineupColumnWidthClass
          )}
        >
          <Skeleton className="h-5 w-28" />
          {lineupSkeletonWidths.map((width) => (
            <SidebarMenuSkeleton key={width} width={width} showIcon />
          ))}
        </div>
      ))}
    </div>
  </ScrollArea>
);

export const LineupTab = ({
  groups,
  isLoading,
  isPlaceholderData,
  serviceTypeId,
  planId,
  seriesId,
  planTimes,
  onSelectPosition,
  onPreviewPosition,
}: LineupTabProps) => {
  if (isLoading) {
    return <LineupLoadingState />;
  }

  if (groups.length === 0) {
    return (
      <Empty className="min-h-[16rem]">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarDays />
          </EmptyMedia>
          <EmptyTitle>No slots found</EmptyTitle>
          <EmptyDescription>
            This plan has no team positions yet.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="relative" aria-busy={isPlaceholderData}>
        {isPlaceholderData ? (
          <div className="bg-sidebar/95 text-sidebar-foreground/70 sticky top-0 z-10 mb-2 w-fit rounded-md px-3 py-1.5 text-xs font-medium backdrop-blur">
            Loading selected plan...
          </div>
        ) : null}
        <div
          className={cn(
            "flex min-w-max items-stretch gap-4 pr-4 pb-3",
            isPlaceholderData && "pointer-events-none opacity-60"
          )}
        >
          {groups.map((group) => (
            <TeamColumn
              key={group.teamId}
              group={group}
              serviceTypeId={serviceTypeId}
              planId={planId}
              seriesId={seriesId}
              planTimes={planTimes}
              onSelectPosition={onSelectPosition}
              onPreviewPosition={onPreviewPosition}
            />
          ))}
        </div>
      </div>
    </ScrollArea>
  );
};

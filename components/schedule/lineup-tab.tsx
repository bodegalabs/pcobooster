"use client";

import { CalendarDays, ChevronDown } from "lucide-react";
import { useState } from "react";

import { PersonRehearsalTimesPopover } from "@/components/schedule/person-rehearsal-times-popover";
import { PlanPersonStatusMenu } from "@/components/schedule/plan-person-status-menu";
import type { PlanPersonStatusValue } from "@/components/schedule/plan-person-status-menu";
import { PositionPickerIcon } from "@/components/schedule/position-picker-icon";
import { SlotBadgeCluster } from "@/components/schedule/slot-badge-cluster";
import { ScheduleStatusDot } from "@/components/schedule/status-dot";
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
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Item, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item";
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
const teamColumnClass =
  "border-border bg-background text-foreground shadow-xs flex shrink-0 flex-col overflow-hidden rounded-xl border";
const lineupPositionGridClass =
  "grid w-full grid-cols-[1.5rem_minmax(0,1fr)_2.75rem_2rem] items-center gap-x-2 gap-y-0";
const lineupPositionRowClass = "col-span-4 grid grid-cols-subgrid items-center";
const lineupPositionRowSizeClass = "min-h-10 py-1";
const lineupRowHoverClass = "hover:bg-muted dark:hover:bg-muted/80";
const lineupPositionHeaderClass = cn(
  "rounded-lg text-left",
  lineupRowHoverClass,
  lineupPositionRowSizeClass
);
const lineupPositionPersonRowClass = cn(
  "group/person rounded-lg",
  lineupRowHoverClass,
  lineupPositionRowSizeClass
);
const lineupPositionPeopleClass = cn(
  "col-span-4 pl-2",
  lineupPositionGridClass,
  "gap-y-0.5"
);

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
  <li className={cn(lineupPositionRowClass, lineupPositionPersonRowClass)}>
    <Avatar size="sm">
      <AvatarImage
        src={person.photoThumbnailUrl ?? undefined}
        alt={person.name}
      />
      <AvatarFallback>{getInitials(person.name)}</AvatarFallback>
    </Avatar>
    <span className="min-w-0 truncate text-sm">{person.name}</span>
    <div className="flex justify-end">
      <PersonRehearsalTimesPopover
        display="lineup"
        person={person}
        serviceTypeId={serviceTypeId}
        planId={planId}
        seriesId={seriesId}
        planTimes={planTimes}
      />
    </div>
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

const LineupPositionCard = ({
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
    <Item variant="muted" size="sm">
      <ItemContent>
        <div className={lineupPositionGridClass}>
          <HoverCard>
            <HoverCardTrigger
              render={
                <button
                  type="button"
                  className={cn(
                    lineupPositionRowClass,
                    lineupPositionHeaderClass,
                    people.length === 0 && "min-h-0 py-0.5"
                  )}
                  aria-label={`Open ${position.name} in scheduler`}
                  onPointerEnter={() => onPreviewPosition?.(slot)}
                  onFocus={() => onPreviewPosition?.(slot)}
                  onTouchStart={() => onPreviewPosition?.(slot)}
                  onClick={() => {
                    onSelectPosition(slot);
                  }}
                />
              }
            >
              <div className="flex size-6 items-center justify-center">
                <PositionPickerIcon
                  positionName={position.name}
                  teamName={teamName}
                />
              </div>
              <ItemTitle className="min-w-0">
                <span className={cn(isTemporaryPosition && "italic")}>
                  {position.name}
                </span>
              </ItemTitle>
              <span aria-hidden />
              <SlotBadgeCluster
                className="justify-self-center"
                position={position}
                teamName={teamName}
                positionName={position.name}
              />
            </HoverCardTrigger>
            <HoverCardContent side="left" variant="label">
              Open in schedule view
            </HoverCardContent>
          </HoverCard>
          {people.length > 0 ? (
            <div className={lineupPositionPeopleClass}>
              <ul className="contents">
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
            </div>
          ) : null}
        </div>
      </ItemContent>
    </Item>
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
    <section className={cn(teamColumnClass, lineupColumnWidthClass)}>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="flex min-h-0 flex-1 flex-col"
      >
        <CollapsibleTrigger
          nativeButton
          render={
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2.5 text-left",
                lineupRowHoverClass
              )}
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
            <ScheduleStatusDot status="confirmed" aria-label="All set" />
          )}
          <ChevronDown
            className={cn(
              "text-muted-foreground size-3.5 shrink-0 opacity-60",
              !open && "-rotate-90"
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="min-h-0 flex-1">
          <div className="p-2 pt-0">
            <ItemGroup>
              {group.positions.map((position) => (
                <LineupPositionCard
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
            </ItemGroup>
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
          className={cn(teamColumnClass, "gap-2 p-3", lineupColumnWidthClass)}
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
          <div className="bg-background/95 text-muted-foreground sticky top-0 z-10 mb-2 w-fit rounded-md border px-3 py-1.5 text-xs font-medium backdrop-blur">
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

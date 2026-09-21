"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, ChevronDown, Clock3, GripVertical } from "lucide-react";
import { startTransition, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { PlanPersonEditDialog } from "@/components/schedule/plan-person-edit-dialog";
import { getPlanPersonStatusValue } from "@/components/schedule/plan-person-status";
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
import { useLineupColumnOrder } from "@/hooks/use-lineup-column-order";
import { getInitials } from "@/lib/format/initials";
import {
  applyLineupColumnOrder,
  reorderLineupColumnIds,
} from "@/lib/lineup-column-order";
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
  "bg-background text-foreground shadow-xs ring-foreground/5 dark:ring-foreground/10 flex shrink-0 flex-col rounded-xl ring-1";
const lineupColumnsRowClassName =
  "flex min-w-max items-stretch gap-4 pt-1 pl-1 pr-4 pb-3";
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
const lineupColumnDragHandleClassName =
  "text-muted-foreground/55 group-hover/team-header:text-foreground inline-flex w-8 shrink-0 touch-manipulation cursor-grab items-center justify-center self-stretch rounded-lg border-0 bg-transparent outline-none focus-visible:ring-ring focus-visible:ring-3 active:cursor-grabbing";
const lineupTeamHeaderClassName = cn(
  "group/team-header flex items-stretch rounded-lg px-1.5 pt-1.5",
  lineupRowHoverClass
);

const getStatusDotStatus = (
  person: FilledPositionPerson
): "confirmed" | "scheduled" | "declined" => {
  const status = getPlanPersonStatusValue(person);
  return status === "declined" ? "declined" : status;
};

const PersonRow = ({
  person,
  teamName,
  positionName,
  serviceTypeId,
  planId,
  seriesId,
  planTimes,
  teamId,
  positionId,
}: {
  person: FilledPositionPerson;
  teamName: string;
  positionName: string;
  serviceTypeId: string | null;
  planId: string | null;
  seriesId: string | null;
  planTimes: PlanTime[];
  teamId: string;
  positionId: string;
}) => {
  const [editOpen, setEditOpen] = useState(false);
  const assignedTimeIdSet = person.assignedTimeIds
    ? new Set(person.assignedTimeIds)
    : new Set<string>();
  const assignedTimeCount = planTimes.filter((planTime) =>
    assignedTimeIdSet.has(planTime.id)
  ).length;
  const statusDotStatus = getStatusDotStatus(person);

  return (
    <>
      <li className="contents">
        <button
          type="button"
          className={cn(
            lineupPositionRowClass,
            lineupPositionPersonRowClass,
            "cursor-pointer text-left"
          )}
          aria-label={`Edit ${person.name} assignment`}
          onClick={() => {
            setEditOpen(true);
          }}
        >
          <Avatar size="sm">
            <AvatarImage
              src={person.photoThumbnailUrl ?? undefined}
              alt={person.name}
            />
            <AvatarFallback>{getInitials(person.name)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 truncate text-sm">{person.name}</span>
          <div className="text-muted-foreground flex justify-end">
            {planTimes.length > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs tabular-nums">
                <Clock3 className="size-3.5 shrink-0" aria-hidden />
                {assignedTimeCount}/{planTimes.length}
              </span>
            ) : null}
          </div>
          <ScheduleStatusDot
            status={statusDotStatus}
            className="justify-self-center"
            aria-hidden
          />
        </button>
      </li>
      <PlanPersonEditDialog
        person={person}
        teamName={teamName}
        positionName={positionName}
        planTimes={planTimes}
        open={editOpen}
        onOpenChange={setEditOpen}
        serviceTypeId={serviceTypeId}
        planId={planId}
        seriesId={seriesId}
        teamId={teamId}
        positionId={positionId}
      />
    </>
  );
};

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
                    teamName={teamName}
                    positionName={position.name}
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
  dragHandleAttributes,
  dragHandleListeners,
}: {
  group: TeamPositionGroup;
  serviceTypeId: string | null;
  planId: string | null;
  seriesId: string | null;
  planTimes: PlanTime[];
  onSelectPosition: (slot: SlotRef) => void;
  onPreviewPosition?: (slot: SlotRef) => void;
  dragHandleAttributes?: ReturnType<typeof useSortable>["attributes"];
  dragHandleListeners?: ReturnType<typeof useSortable>["listeners"];
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
        <div className={lineupTeamHeaderClassName}>
          {dragHandleListeners ? (
            <button
              type="button"
              {...dragHandleAttributes}
              {...dragHandleListeners}
              aria-label={`Reorder ${group.teamName} column`}
              className={lineupColumnDragHandleClassName}
            >
              <GripVertical className="size-4" aria-hidden />
            </button>
          ) : null}
          <CollapsibleTrigger
            nativeButton
            render={
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 bg-transparent px-1.5 py-2 text-left"
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
        </div>
        <CollapsibleContent className="min-h-0 flex-1">
          <div className="overflow-hidden rounded-b-xl p-2 pt-0">
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

interface SortableTeamColumnProps {
  group: TeamPositionGroup;
  serviceTypeId: string | null;
  planId: string | null;
  seriesId: string | null;
  planTimes: PlanTime[];
  onSelectPosition: (slot: SlotRef) => void;
  onPreviewPosition?: (slot: SlotRef) => void;
  isDragging: boolean;
  reorderDisabled: boolean;
}

const SortableTeamColumn = ({
  group,
  isDragging,
  reorderDisabled,
  ...columnProps
}: SortableTeamColumnProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: group.teamId,
    disabled: reorderDisabled,
  });
  const style: CSSProperties & {
    "--sortable-transform": string;
    "--sortable-transition": string;
  } = {
    "--sortable-transform": CSS.Transform.toString(transform) ?? "none",
    "--sortable-transition":
      transition ?? "transform 180ms cubic-bezier(0.2, 0, 0, 1)",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "sortable-plan-item shrink-0",
        (isDragging || isSortableDragging) && "opacity-0"
      )}
    >
      <TeamColumn
        group={group}
        dragHandleAttributes={attributes}
        dragHandleListeners={listeners}
        {...columnProps}
      />
    </div>
  );
};

const TeamColumnOverlay = ({ group }: { group: TeamPositionGroup }) => (
  <section
    className={cn(
      teamColumnClass,
      lineupColumnWidthClass,
      "bg-muted/80 shadow-2xl"
    )}
  >
    <div className="flex items-center gap-2 px-3 py-2.5">
      <GripVertical className="text-muted-foreground size-4 shrink-0" />
      <h3 className="truncate text-sm font-semibold tracking-tight">
        {group.teamName}
      </h3>
    </div>
  </section>
);

const LineupLoadingState = () => (
  <ScrollArea className="min-h-0 flex-1">
    <div className={lineupColumnsRowClassName}>
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
  const [columnOrderByServiceType, updateColumnOrder] = useLineupColumnOrder();
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const reorderDisabled = isPlaceholderData || serviceTypeId === null;
  const orderedGroups = useMemo(() => {
    if (serviceTypeId === null) {
      return groups;
    }
    return applyLineupColumnOrder(
      groups,
      columnOrderByServiceType[serviceTypeId]
    );
  }, [columnOrderByServiceType, groups, serviceTypeId]);
  const activeGroup =
    orderedGroups.find((group) => group.teamId === activeTeamId) ?? null;
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 160, tolerance: 10 },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTeamId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTeamId(null);

    if (serviceTypeId === null) {
      return;
    }

    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!(overId !== null && overId !== "") || activeId === overId) {
      return;
    }

    const currentOrder = orderedGroups.map((group) => group.teamId);
    const nextOrder = reorderLineupColumnIds(currentOrder, activeId, overId);
    if (
      nextOrder.length === currentOrder.length &&
      nextOrder.every((teamId, index) => teamId === currentOrder[index])
    ) {
      return;
    }

    updateColumnOrder((current) => ({
      ...current,
      [serviceTypeId]: nextOrder,
    }));
  };

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
        <DndContext
          collisionDetection={closestCenter}
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragCancel={() => {
            setActiveTeamId(null);
          }}
          onDragEnd={(event) => {
            startTransition(() => {
              handleDragEnd(event);
            });
          }}
        >
          <SortableContext
            items={orderedGroups.map((group) => group.teamId)}
            strategy={horizontalListSortingStrategy}
          >
            <div
              className={cn(
                lineupColumnsRowClassName,
                isPlaceholderData && "pointer-events-none opacity-60"
              )}
            >
              {orderedGroups.map((group) => (
                <SortableTeamColumn
                  key={group.teamId}
                  group={group}
                  serviceTypeId={serviceTypeId}
                  planId={planId}
                  seriesId={seriesId}
                  planTimes={planTimes}
                  onSelectPosition={onSelectPosition}
                  onPreviewPosition={onPreviewPosition}
                  isDragging={activeTeamId === group.teamId}
                  reorderDisabled={reorderDisabled}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay zIndex={60}>
            {activeGroup ? <TeamColumnOverlay group={activeGroup} /> : null}
          </DragOverlay>
        </DndContext>
      </div>
    </ScrollArea>
  );
};

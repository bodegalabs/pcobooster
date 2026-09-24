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
import type {
  FilledPositionPerson,
  PlanTime,
  TeamPosition,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
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
import { DragHandle } from "@/components/ui/drag-handle";
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
import { MiddleTruncate } from "@/components/ui/middle-truncate";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { GetIntentPrefetchProps } from "@/hooks/use-intent-prefetch";
import { useLineupColumnOrder } from "@/hooks/use-lineup-column-order";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRevealOnLoad } from "@/hooks/use-reveal-on-load";
import { getInitials } from "@/lib/format/initials";
import {
  applyLineupColumnOrder,
  reorderLineupColumnIds,
} from "@/lib/lineup-column-order";
import { cn } from "@/lib/utils";

interface LineupTabProps {
  groups: TeamPositionGroup[];
  isLoading: boolean;
  serviceTypeId: string | null;
  planId: string | null;
  seriesId: string | null;
  planTimes: PlanTime[];
  onSelectPosition: (slot: SlotRef) => void;
  getSlotIntentProps?: GetIntentPrefetchProps<SlotRef>;
}

const lineupSkeletonWidths = ["8rem", "6rem", "9rem", "7rem"];
const lineupColumnWidthClass = "w-[min(22rem,78vw)]";
const lineupStackClassName = "pb-safe-4 flex flex-col gap-3";
const teamColumnClass =
  "bg-background text-foreground shadow-xs ring-foreground/5 dark:ring-foreground/10 flex shrink-0 flex-col rounded-xl ring-1";
const lineupColumnsRowClassName =
  "flex min-w-max items-stretch gap-4 pt-1 pl-1 pr-4 pb-3";
const lineupPositionGridClass =
  "grid w-full grid-cols-[1.5rem_minmax(0,1fr)_2.75rem_2rem] items-center gap-x-2 gap-y-0";
const lineupPositionRowClass = "col-span-4 grid grid-cols-subgrid items-center";
const lineupPositionPeopleClass = cn(
  "col-span-4 pl-2",
  lineupPositionGridClass,
  "gap-y-0.5"
);
const lineupTeamHeaderClassName =
  "group/team-header flex items-stretch gap-0.5 px-1.5 pt-1.5";

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
        <Item
          size="row"
          className={cn(lineupPositionRowClass, "group/person")}
          render={
            <button
              type="button"
              aria-label={`Edit ${person.name} assignment`}
            />
          }
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
        </Item>
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
  getSlotIntentProps,
}: {
  teamId: string;
  teamName: string;
  position: TeamPosition;
  serviceTypeId: string | null;
  planId: string | null;
  seriesId: string | null;
  planTimes: PlanTime[];
  onSelectPosition: (slot: SlotRef) => void;
  getSlotIntentProps?: GetIntentPrefetchProps<SlotRef>;
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
                <Item
                  size="row"
                  className={cn(
                    lineupPositionRowClass,
                    people.length === 0 && "min-h-0 py-0.5"
                  )}
                  render={
                    <button
                      type="button"
                      aria-label={`Open ${position.name} in scheduler`}
                      {...getSlotIntentProps?.(slot)}
                      onClick={() => {
                        onSelectPosition(slot);
                      }}
                    />
                  }
                />
              }
            >
              <div className="flex size-6 items-center justify-center">
                <PositionPickerIcon
                  positionName={position.name}
                  teamName={teamName}
                />
              </div>
              {/* Titles also use the time-count column, which only person rows fill. */}
              <ItemTitle className="col-span-2 min-w-0">
                <span
                  className={cn(
                    "block min-w-0",
                    isTemporaryPosition && "italic"
                  )}
                >
                  <MiddleTruncate text={position.name} />
                </span>
              </ItemTitle>
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
  getSlotIntentProps,
  dragHandleAttributes,
  dragHandleListeners,
  stacked = false,
}: {
  stacked?: boolean;
  group: TeamPositionGroup;
  serviceTypeId: string | null;
  planId: string | null;
  seriesId: string | null;
  planTimes: PlanTime[];
  onSelectPosition: (slot: SlotRef) => void;
  getSlotIntentProps?: GetIntentPrefetchProps<SlotRef>;
  dragHandleAttributes?: ReturnType<typeof useSortable>["attributes"];
  dragHandleListeners?: ReturnType<typeof useSortable>["listeners"];
}) => {
  const openNeededCount = group.positions.reduce(
    (sum, position) => sum + (position.neededCount ?? 0),
    0
  );
  const [open, setOpen] = useState(() => openNeededCount > 0);

  return (
    <section
      className={cn(
        teamColumnClass,
        stacked ? "w-full rounded-2xl" : lineupColumnWidthClass
      )}
    >
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className={lineupTeamHeaderClassName}>
          {dragHandleListeners ? (
            <DragHandle
              size="sm"
              {...dragHandleAttributes}
              {...dragHandleListeners}
              aria-label={`Reorder ${group.teamName} column`}
            />
          ) : null}
          <CollapsibleTrigger
            nativeButton
            render={
              <Item
                size="row"
                className="min-w-0 flex-1"
                render={
                  <button
                    type="button"
                    aria-label={`${group.teamName} team lineup`}
                  />
                }
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
                  getSlotIntentProps={getSlotIntentProps}
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
  getSlotIntentProps?: GetIntentPrefetchProps<SlotRef>;
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

const lineupSkeletonColumns = [
  { key: "a", title: "7rem", positions: [2, 1, 1] },
  { key: "b", title: "5rem", positions: [1, 2] },
  { key: "c", title: "8rem", positions: [1, 1, 2] },
  { key: "d", title: "6rem", positions: [2, 1] },
];

const LineupLoadingState = ({ stacked }: { stacked: boolean }) => (
  <ScrollArea className="min-h-0 flex-1">
    <div className={stacked ? lineupStackClassName : lineupColumnsRowClassName}>
      {lineupSkeletonColumns.map((column) => (
        <div
          key={column.key}
          className={cn(
            teamColumnClass,
            "gap-1 p-1.5",
            stacked ? "w-full" : lineupColumnWidthClass
          )}
        >
          <div className="flex h-9 items-center gap-2 px-2">
            <Skeleton variant="text" className="size-3.5" />
            <Skeleton variant="text" className="h-3.5" width={column.title} />
          </div>
          {column.positions.map((people, positionIndex) => (
            <div
              key={`${column.key}-${positionIndex}`}
              className="flex flex-col"
            >
              <div className="flex min-h-10 items-center gap-2 px-2">
                <Skeleton variant="text" className="size-4" />
                <Skeleton
                  variant="text"
                  className="h-3"
                  width={
                    lineupSkeletonWidths[
                      (positionIndex + column.key.length) %
                        lineupSkeletonWidths.length
                    ]
                  }
                />
              </div>
              {Array.from({ length: people }, (_, personIndex) => (
                <div
                  key={personIndex}
                  className="flex min-h-10 items-center gap-2 pr-2 pl-4"
                >
                  <Skeleton variant="round" className="size-6" />
                  <Skeleton
                    variant="text"
                    className="h-3"
                    width={
                      lineupSkeletonWidths[
                        (positionIndex + personIndex + 1) %
                          lineupSkeletonWidths.length
                      ]
                    }
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  </ScrollArea>
);

export const LineupTab = ({
  groups,
  isLoading,
  serviceTypeId,
  planId,
  seriesId,
  planTimes,
  onSelectPosition,
  getSlotIntentProps,
}: LineupTabProps) => {
  const [columnOrderByServiceType, updateColumnOrder] = useLineupColumnOrder();
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const reorderDisabled = serviceTypeId === null;
  const revealClassName = useRevealOnLoad(isLoading);
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
    return <LineupLoadingState stacked={isMobile} />;
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

  if (isMobile) {
    return (
      <ScrollArea className="-mx-4 min-h-0 flex-1">
        <div className={cn(lineupStackClassName, "px-4", revealClassName)}>
          {orderedGroups.map((group) => (
            <TeamColumn
              key={group.teamId}
              group={group}
              serviceTypeId={serviceTypeId}
              planId={planId}
              seriesId={seriesId}
              planTimes={planTimes}
              onSelectPosition={onSelectPosition}
              getSlotIntentProps={getSlotIntentProps}
              stacked
            />
          ))}
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className={cn("relative", revealClassName)}>
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
            <div className={lineupColumnsRowClassName}>
              {orderedGroups.map((group) => (
                <SortableTeamColumn
                  key={group.teamId}
                  group={group}
                  serviceTypeId={serviceTypeId}
                  planId={planId}
                  seriesId={seriesId}
                  planTimes={planTimes}
                  onSelectPosition={onSelectPosition}
                  getSlotIntentProps={getSlotIntentProps}
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

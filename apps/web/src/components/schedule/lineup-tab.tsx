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
  rectSortingStrategy,
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
import {
  CalendarDays,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  Clock3,
  GripVertical,
  Mail,
  UserPlus,
  Users,
} from "lucide-react";
import { startTransition, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { PageScrollArea } from "@/components/page-shell";
import { AvatarStatus } from "@/components/schedule/avatar-status";
import { PlanPersonEditDialog } from "@/components/schedule/plan-person-edit-dialog";
import { getPlanPersonStatusValue } from "@/components/schedule/plan-person-status";
import {
  PositionPickerIcon,
  TeamPickerIcon,
} from "@/components/schedule/position-picker-icon";
import { UnsentNotificationMark } from "@/components/schedule/scheduling-notification-mark";
import type { SlotRef } from "@/components/schedule/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { HoverLabel } from "@/components/ui/hover-card";
import { Item } from "@/components/ui/item";
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
import { getSchedulingNotificationState } from "@/lib/schedule/scheduling-notifications";
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

/** Teams fill the width in as many columns as fit; phones get one. */
const lineupGridClassName =
  "pb-safe-4 grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] items-start gap-3";
const teamPanelClassName =
  "bg-background text-foreground shadow-xs ring-foreground/5 dark:ring-foreground/10 flex flex-col rounded-xl ring-1";
const teamHeaderClassName =
  "group/team-header bg-muted/40 flex items-stretch gap-0.5 rounded-t-xl px-1.5 py-1.5";
/** Positions on the left, their people on the right, so a team reads as one roster. */
const rosterGridClassName =
  "border-border/60 divide-border/60 grid grid-cols-[auto_minmax(0,1fr)] divide-y border-t";
const rosterPositionClassName =
  "col-span-2 grid grid-cols-subgrid items-start gap-x-1 px-1.5 py-1.5";
/** Person and open-seat rows share one height so a position's rows line up with its icon. */
const rosterRowClassName = "min-h-11";

const getStatusDotStatus = (
  person: FilledPositionPerson
): "confirmed" | "scheduled" | "declined" => {
  const status = getPlanPersonStatusValue(person);
  return status === "declined" ? "declined" : status;
};

const isUnsent = (person: FilledPositionPerson) =>
  getSchedulingNotificationState(person.notification) === "unsent";

const STATUS_LABELS = {
  scheduled: "Pending",
  declined: "Declined",
} as const;

const PersonRow = ({
  positionLabel,
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
  /** The position's name, on the first person's row. */
  positionLabel: ReactNode;
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
  const assignedTimeIdSet = new Set(person.assignedTimeIds);
  const assignedTimeCount = planTimes.filter((planTime) =>
    assignedTimeIdSet.has(planTime.id)
  ).length;
  // Most people serve every time, so only a partial schedule is worth a mark.
  const servesSomeTimes =
    planTimes.length > 1 && assignedTimeCount < planTimes.length;
  const status = getStatusDotStatus(person);
  const unsent = isUnsent(person);
  const statusLabel = status === "confirmed" ? null : STATUS_LABELS[status];

  return (
    <>
      <Item
        size="row"
        className={rosterRowClassName}
        render={
          <button
            type="button"
            aria-label={[
              `Edit ${person.name} assignment`,
              statusLabel?.toLowerCase(),
              unsent ? "not notified yet" : undefined,
            ]
              .filter(Boolean)
              .join(", ")}
          />
        }
        onClick={() => {
          setEditOpen(true);
        }}
      >
        <AvatarStatus status={status === "confirmed" ? null : status}>
          <Avatar>
            <AvatarImage
              src={person.photoThumbnailUrl ?? undefined}
              alt={person.name}
            />
            <AvatarFallback>{getInitials(person.name)}</AvatarFallback>
          </Avatar>
        </AvatarStatus>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            status === "declined" && "text-muted-foreground line-through"
          )}
        >
          {person.name}
        </span>
        {servesSomeTimes ? (
          <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs tabular-nums">
            <Clock3 className="size-3.5" aria-hidden />
            {assignedTimeCount}/{planTimes.length}
          </span>
        ) : null}
        {unsent ? <UnsentNotificationMark /> : null}
        {positionLabel}
      </Item>
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

/** The position's name at the end of its first row; the icon column carries the rest. */
const TrailingPositionName = ({
  name,
  isTemporary,
}: {
  name: string;
  isTemporary: boolean;
}) => (
  <span
    className={cn(
      "text-muted-foreground ml-auto max-w-[45%] shrink-0 truncate text-xs",
      isTemporary && "italic"
    )}
  >
    {name}
  </span>
);

const PositionRows = ({
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
  const openCount = position.neededCount ?? 0;
  const isTemporaryPosition =
    !!position.source && position.source !== "team_position";
  const slot = {
    teamId,
    teamName,
    positionId: position.id,
    positionName: position.name,
    source: position.source,
  };
  const openInAssign = {
    ...getSlotIntentProps?.(slot),
    onClick: () => {
      onSelectPosition(slot);
    },
  };

  return (
    <li className={rosterPositionClassName}>
      <HoverLabel
        label={`Open ${position.name} in Assign`}
        side="left"
        render={
          <Item
            size="row"
            className={cn(rosterRowClassName, "w-9 justify-center")}
            render={
              <button
                type="button"
                aria-label={`Open ${position.name} in Assign`}
                {...openInAssign}
              />
            }
          />
        }
      >
        <PositionPickerIcon positionName={position.name} teamName={teamName} />
      </HoverLabel>
      <ul className="flex min-w-0 flex-col">
        {people.map((person, index) => (
          <li key={`${person.id}-${person.rawStatus}`}>
            <PersonRow
              positionLabel={
                index === 0 ? (
                  <TrailingPositionName
                    name={position.name}
                    isTemporary={isTemporaryPosition}
                  />
                ) : null
              }
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
          </li>
        ))}
        {openCount > 0 ? (
          <li>
            <Item
              size="row"
              className={rosterRowClassName}
              render={
                <button
                  type="button"
                  aria-label={`Fill ${openCount} open ${position.name} ${openCount === 1 ? "slot" : "slots"}`}
                  {...openInAssign}
                />
              }
            >
              <span className="border-status-declined/50 text-status-declined flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed">
                <UserPlus className="size-3.5" aria-hidden />
              </span>
              <span className="text-status-declined text-sm font-medium tabular-nums">
                {openCount === 1 ? "Open" : `${openCount} open`}
              </span>
              {people.length === 0 ? (
                <TrailingPositionName
                  name={position.name}
                  isTemporary={isTemporaryPosition}
                />
              ) : null}
            </Item>
          </li>
        ) : null}
      </ul>
    </li>
  );
};

const TeamPanel = ({
  group,
  serviceTypeId,
  planId,
  seriesId,
  planTimes,
  onSelectPosition,
  getSlotIntentProps,
  dragHandleAttributes,
  dragHandleListeners,
}: {
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
  const openCount = group.positions.reduce(
    (sum, position) => sum + (position.neededCount ?? 0),
    0
  );
  const unsentCount = group.positions.reduce(
    (sum, position) =>
      sum + (position.filledPeople ?? []).filter(isUnsent).length,
    0
  );
  const [open, setOpen] = useState(true);

  return (
    <section className={teamPanelClassName}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className={teamHeaderClassName}>
          {dragHandleListeners ? (
            <DragHandle
              size="sm"
              {...dragHandleAttributes}
              {...dragHandleListeners}
              aria-label={`Reorder ${group.teamName}`}
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
            <span className="bg-background ring-foreground/5 dark:ring-foreground/10 flex size-7 shrink-0 items-center justify-center rounded-lg ring-1">
              <TeamPickerIcon teamName={group.teamName} />
            </span>
            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
              {group.teamName}
            </h3>
            {unsentCount > 0 ? (
              <Badge
                variant="outline"
                aria-label={`${unsentCount} not notified`}
              >
                <Mail aria-hidden />
                {unsentCount}
              </Badge>
            ) : null}
            {openCount > 0 ? (
              <Badge variant="destructive">
                <CircleDashed aria-hidden />
                {openCount} open
              </Badge>
            ) : (
              <Badge variant="secondary">
                <CircleCheck aria-hidden />
                Full
              </Badge>
            )}
            <ChevronDown
              className={cn(
                "text-muted-foreground size-3.5 shrink-0 opacity-60",
                !open && "-rotate-90"
              )}
            />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <ul className={rosterGridClassName}>
            {group.positions.map((position) => (
              <PositionRows
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
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
};

interface SortableTeamPanelProps {
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

const SortableTeamPanel = ({
  group,
  isDragging,
  reorderDisabled,
  ...panelProps
}: SortableTeamPanelProps) => {
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
    "--sortable-transform": CSS.Translate.toString(transform) ?? "none",
    "--sortable-transition":
      transition ?? "transform 180ms cubic-bezier(0.2, 0, 0, 1)",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "sortable-plan-item min-w-0",
        (isDragging || isSortableDragging) && "opacity-0"
      )}
    >
      <TeamPanel
        group={group}
        dragHandleAttributes={attributes}
        dragHandleListeners={listeners}
        {...panelProps}
      />
    </div>
  );
};

const TeamPanelOverlay = ({ group }: { group: TeamPositionGroup }) => (
  <section className={cn(teamPanelClassName, "bg-muted/80 shadow-2xl")}>
    <div className="flex items-center gap-2 px-3 py-2.5">
      <GripVertical className="text-muted-foreground size-4 shrink-0" />
      <h3 className="truncate text-sm font-semibold tracking-tight">
        {group.teamName}
      </h3>
    </div>
  </section>
);

interface LineupSummary {
  serving: number;
  open: number;
  pending: number;
  unsent: number;
}

const summarizeLineup = (groups: TeamPositionGroup[]): LineupSummary => {
  const summary: LineupSummary = { serving: 0, open: 0, pending: 0, unsent: 0 };
  for (const group of groups) {
    for (const position of group.positions) {
      summary.open += position.neededCount ?? 0;
      for (const person of position.filledPeople ?? []) {
        const status = getStatusDotStatus(person);
        if (status !== "declined") {
          summary.serving += 1;
        }
        if (status === "scheduled") {
          summary.pending += 1;
        }
        if (isUnsent(person)) {
          summary.unsent += 1;
        }
      }
    }
  }
  return summary;
};

const LineupSummaryLine = ({ summary }: { summary: LineupSummary }) => (
  <div className="flex flex-wrap items-center gap-1.5 pb-3">
    <Badge variant="secondary">
      <Users aria-hidden />
      {summary.serving} serving
    </Badge>
    {summary.open > 0 ? (
      <Badge variant="destructive">
        <CircleDashed aria-hidden />
        {summary.open} open
      </Badge>
    ) : null}
    {summary.pending > 0 ? (
      <Badge variant="outline">
        <Clock3 aria-hidden />
        {summary.pending} pending
      </Badge>
    ) : null}
    {summary.unsent > 0 ? (
      <Badge variant="outline">
        <Mail aria-hidden />
        {summary.unsent} not notified
      </Badge>
    ) : null}
  </div>
);

const lineupSkeletonTeams = [
  { key: "a", title: "7rem", positions: [2, 1, 1, 1] },
  { key: "b", title: "5rem", positions: [1, 2, 1] },
  { key: "c", title: "8rem", positions: [1, 1] },
];
const lineupSkeletonWidths = ["8rem", "6rem", "9rem", "7rem"];

const LineupLoadingState = () => (
  <PageScrollArea>
    <div className="flex h-8 items-center gap-4 pb-3">
      <Skeleton variant="text" className="h-3.5 w-20" />
      <Skeleton variant="text" className="h-3.5 w-14" />
    </div>
    <div className={lineupGridClassName}>
      {lineupSkeletonTeams.map((team) => (
        <div key={team.key} className={teamPanelClassName}>
          <div className="flex h-12 items-center px-3.5">
            <Skeleton variant="text" className="h-3.5" width={team.title} />
          </div>
          <div className="border-border/60 divide-border/60 divide-y border-t">
            {team.positions.map((people, positionIndex) => (
              <div
                key={`${team.key}-${positionIndex}`}
                className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-1 px-3 py-1"
              >
                <div className="flex h-9 items-center">
                  <Skeleton variant="text" className="h-3 w-16" />
                </div>
                <div className="flex flex-col">
                  {Array.from({ length: people }, (_, personIndex) => (
                    <div
                      key={personIndex}
                      className="flex h-9 items-center gap-2"
                    >
                      <Skeleton variant="round" className="size-6" />
                      <Skeleton
                        variant="text"
                        className="h-3"
                        width={
                          lineupSkeletonWidths[
                            (positionIndex + personIndex) %
                              lineupSkeletonWidths.length
                          ]
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </PageScrollArea>
);

/** The lineup's team panels before anything loads. */
export const LineupTabSkeleton = () => <LineupLoadingState />;

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
  const summary = useMemo(() => summarizeLineup(groups), [groups]);
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

  const panelProps = {
    serviceTypeId,
    planId,
    seriesId,
    planTimes,
    onSelectPosition,
    getSlotIntentProps,
  };

  if (isMobile) {
    return (
      <PageScrollArea>
        <div className={revealClassName}>
          <LineupSummaryLine summary={summary} />
          <div className={lineupGridClassName}>
            {orderedGroups.map((group) => (
              <TeamPanel key={group.teamId} group={group} {...panelProps} />
            ))}
          </div>
        </div>
      </PageScrollArea>
    );
  }

  return (
    <PageScrollArea>
      <div className={cn("relative", revealClassName)}>
        <LineupSummaryLine summary={summary} />
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
            strategy={rectSortingStrategy}
          >
            <div className={lineupGridClassName}>
              {orderedGroups.map((group) => (
                <SortableTeamPanel
                  key={group.teamId}
                  group={group}
                  isDragging={activeTeamId === group.teamId}
                  reorderDisabled={reorderDisabled}
                  {...panelProps}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay zIndex={60}>
            {activeGroup ? <TeamPanelOverlay group={activeGroup} /> : null}
          </DragOverlay>
        </DndContext>
      </div>
    </PageScrollArea>
  );
};

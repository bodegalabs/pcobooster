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
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PlanItem } from "@pcobooster/planning-center-models/types";
import { ChevronRight, FileMusic, Music4, Trash2 } from "lucide-react";
import { startTransition, useState } from "react";
import type { CSSProperties } from "react";

import {
  formatLength,
  getItemTone,
} from "@/components/schedule/plan-tab-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DragHandle } from "@/components/ui/drag-handle";
import { Item } from "@/components/ui/item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  GetIntentPrefetchProps,
  IntentPrefetchProps,
} from "@/hooks/use-intent-prefetch";
import { useRevealOnLoad } from "@/hooks/use-reveal-on-load";
import { reorderPlanItems } from "@/lib/plan-items-query-state";
import { cn } from "@/lib/utils";

interface PlanItemListProps {
  items: PlanItem[];
  isLoading: boolean;
  pendingItemId: string | null;
  onAddSong: () => void;
  onAddHeader: () => void;
  onAddItem: () => void;
  onEditItem: (itemId: string) => void;
  getItemIntentProps?: GetIntentPrefetchProps<string>;
  onRequestDelete: (itemId: string) => void;
  onReorderItems: (items: PlanItem[]) => Promise<void> | void;
}

interface SortablePlanItemProps {
  item: PlanItem;
  isBusy: boolean;
  isDragging: boolean;
  reorderDisabled: boolean;
  onEdit: () => void;
  intentProps?: IntentPrefetchProps;
  onDelete: () => void;
}

const planItemSkeletonRows = [
  { key: "a", header: true, title: "6rem" },
  { key: "b", header: false, title: "11rem", badge: true },
  { key: "c", header: false, title: "9rem", badge: true },
  { key: "d", header: false, title: "7rem" },
  { key: "e", header: true, title: "5rem" },
  { key: "f", header: false, title: "10rem", badge: true },
  { key: "g", header: false, title: "8rem" },
];

const PlanItemListSkeleton = () => (
  <div className="pb-4 sm:pr-3">
    <div className="border-border/50 bg-background overflow-hidden rounded-lg border">
      {planItemSkeletonRows.map((row) => (
        <div
          key={row.key}
          className={cn(
            "flex min-h-11 items-center gap-3 pr-3 pl-2.5",
            row.header && "bg-muted/40"
          )}
        >
          <Skeleton variant="text" className="size-4 shrink-0" />
          <Skeleton variant="text" className="h-3.5" width={row.title} />
          {row.badge === true ? (
            <Skeleton variant="text" className="h-5 w-8" />
          ) : null}
          <Skeleton variant="control" className="ml-auto size-7 shrink-0" />
        </div>
      ))}
    </div>
  </div>
);

interface PlanItemCardProps {
  item: PlanItem;
  isBusy: boolean;
  isDragged: boolean;
  dragAttributes?: ReturnType<typeof useSortable>["attributes"];
  dragListeners?: ReturnType<typeof useSortable>["listeners"];
  onEdit: () => void;
  intentProps?: IntentPrefetchProps;
  onDelete: () => void;
}

const PlanItemCard = ({
  item,
  isBusy,
  isDragged,
  dragAttributes,
  dragListeners,
  onEdit,
  intentProps,
  onDelete,
}: PlanItemCardProps) => {
  const tone = getItemTone(item);
  const itemActionLabel = item.title || "plan item";
  const displayTitle = item.title || "Untitled item";
  const lengthLabel = formatLength(item.length);
  const rowHoverClassName =
    item.itemType === "header"
      ? "hover:ring-border/80 hover:ring-1 hover:ring-inset"
      : null;

  return (
    <div
      aria-busy={isBusy}
      className={cn(
        "group/plan-item stale-while-busy",
        tone.row,
        !isDragged && rowHoverClassName,
        isDragged && "bg-muted/80 shadow-lg"
      )}
    >
      <div className="hidden min-h-11 items-stretch sm:flex">
        <DragHandle
          {...dragAttributes}
          {...dragListeners}
          disabled={isBusy}
          aria-label={`Reorder ${itemActionLabel}`}
        />
        <Item
          size="xs"
          className="min-w-0 flex-1"
          render={
            <button type="button" aria-label={`Edit ${itemActionLabel}`} />
          }
          {...intentProps}
          onClick={onEdit}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-semibold">{displayTitle}</p>
                {item.arrangement ? (
                  <span className="text-muted-foreground/80 flex items-center gap-1 text-sm">
                    <span aria-hidden="true" className="opacity-60">
                      |
                    </span>
                    <span>{item.arrangement.name}</span>
                  </span>
                ) : null}
                {item.key ? (
                  <Badge variant="secondary">{item.key.name}</Badge>
                ) : null}
                {lengthLabel !== null && lengthLabel !== "" ? (
                  <Badge variant="outline">{lengthLabel}</Badge>
                ) : null}
              </div>
              <div className="text-muted-foreground mt-1 flex flex-wrap gap-2 text-xs">
                {item.description ? (
                  <span className="truncate">{item.description}</span>
                ) : null}
              </div>
            </div>
          </div>
        </Item>
        <div className="flex items-center px-2 py-1.5">
          <Button
            type="button"
            variant="destructive"
            size="icon-sm"
            className="group/delete"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            disabled={isBusy}
            aria-label={`Delete ${itemActionLabel}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-12 items-stretch sm:hidden">
        <DragHandle
          {...dragAttributes}
          {...dragListeners}
          disabled={isBusy}
          aria-label={`Reorder ${itemActionLabel}`}
        />
        <Item
          size="xs"
          className="min-w-0 flex-1 items-start"
          render={
            <button type="button" aria-label={`Edit ${itemActionLabel}`} />
          }
          {...intentProps}
          onClick={onEdit}
        >
          <div className="min-w-0 flex-1 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 font-semibold break-words">
                {displayTitle}
              </p>
              {item.arrangement ? (
                <span className="text-muted-foreground/80 flex items-center gap-1 text-sm">
                  <span aria-hidden="true" className="opacity-60">
                    |
                  </span>
                  <span>{item.arrangement.name}</span>
                </span>
              ) : null}
              {item.key ? (
                <Badge variant="secondary">{item.key.name}</Badge>
              ) : null}
              {lengthLabel !== null && lengthLabel !== "" ? (
                <Badge variant="outline">{lengthLabel}</Badge>
              ) : null}
            </div>
            {item.description ? (
              <div className="text-muted-foreground mt-1 flex flex-wrap gap-2 text-xs">
                <span className="break-words">{item.description}</span>
              </div>
            ) : null}
          </div>
        </Item>
        <ChevronRight
          className="text-muted-foreground/50 mr-3 size-4 shrink-0 self-center"
          aria-hidden
        />
      </div>
    </div>
  );
};

const SortablePlanItem = ({
  item,
  isBusy,
  isDragging,
  reorderDisabled,
  onEdit,
  intentProps,
  onDelete,
}: SortablePlanItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: item.id,
    disabled: reorderDisabled,
  });

  const style: CSSProperties & {
    "--sortable-transform": string;
    "--sortable-transition": string;
  } = {
    "--sortable-transform":
      CSS.Transform.toString(
        transform
          ? {
              ...transform,
              scaleX: isSortableDragging ? 1.01 : 1,
              scaleY: isSortableDragging ? 1.01 : 1,
            }
          : null
      ) ?? "none",
    "--sortable-transition":
      transition ?? "transform 180ms cubic-bezier(0.2, 0, 0, 1)",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "sortable-plan-item relative border-b last:border-b-0",
        isSortableDragging && "z-20 opacity-0"
      )}
    >
      <PlanItemCard
        item={item}
        isBusy={isBusy}
        isDragged={isDragging || isSortableDragging}
        dragAttributes={attributes}
        dragListeners={listeners}
        onEdit={onEdit}
        intentProps={intentProps}
        onDelete={onDelete}
      />
    </div>
  );
};

export const PlanItemList = ({
  items,
  isLoading,
  pendingItemId,
  onAddSong,
  onAddHeader,
  onAddItem,
  onEditItem,
  getItemIntentProps,
  onRequestDelete,
  onReorderItems,
}: PlanItemListProps) => {
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const reorderDisabled = pendingItemId === "reorder";
  const revealClassName = useRevealOnLoad(isLoading);
  const activeItem = items.find((item) => item.id === activeItemId) ?? null;
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 160, tolerance: 10 },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveItemId(String(event.active.id));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveItemId(null);

    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;

    if (!(overId !== null && overId !== "") || activeId === overId) {
      return;
    }

    const nextItems = reorderPlanItems(items, activeId, overId);
    if (nextItems === items) {
      return;
    }

    await onReorderItems(nextItems);
  };

  const showEmpty = !isLoading && items.length === 0;
  const showList = !isLoading && items.length > 0;

  return (
    <ScrollArea className="min-h-0 flex-1">
      {isLoading ? <PlanItemListSkeleton /> : null}
      {showEmpty ? (
        <Card className="mx-0 text-center sm:mr-3">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
            <FileMusic className="text-muted-foreground/70 size-5" />
            <div>
              <p className="text-sm font-medium">
                This plan has no structure yet
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Add a song, header, or item from the toolbar above.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" size="sm" onClick={onAddSong}>
                <Music4 className="size-4" />
                Add Song
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onAddHeader}
              >
                Add Header
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onAddItem}
              >
                Add Item
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
      {showList ? (
        <div className={cn("relative", revealClassName)}>
          <DndContext
            collisionDetection={closestCenter}
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragCancel={() => {
              setActiveItemId(null);
            }}
            onDragEnd={(event) => {
              startTransition(async () => {
                await handleDragEnd(event);
              });
            }}
          >
            <SortableContext
              items={items.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="pb-safe-4 sm:pr-3 md:pb-4">
                <div className="border-border/50 bg-background overflow-hidden rounded-lg border">
                  {items.map((item) => (
                    <SortablePlanItem
                      key={item.id}
                      item={item}
                      isBusy={pendingItemId === item.id}
                      isDragging={activeItemId === item.id}
                      reorderDisabled={reorderDisabled}
                      onEdit={() => {
                        onEditItem(item.id);
                      }}
                      intentProps={getItemIntentProps?.(item.id)}
                      onDelete={() => {
                        onRequestDelete(item.id);
                      }}
                    />
                  ))}
                </div>
              </div>
            </SortableContext>
            <DragOverlay zIndex={60}>
              {activeItem ? (
                <div className="bg-background rotate-[0.2deg] overflow-hidden rounded-lg border shadow-2xl">
                  <PlanItemCard
                    item={activeItem}
                    isBusy={pendingItemId === activeItem.id}
                    isDragged
                    onEdit={() => {
                      onEditItem(activeItem.id);
                    }}
                    onDelete={() => {
                      onRequestDelete(activeItem.id);
                    }}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      ) : null}
    </ScrollArea>
  );
};

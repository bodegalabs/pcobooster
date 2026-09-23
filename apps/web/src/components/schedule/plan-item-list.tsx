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
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PlanItem } from "@pcobooster/planning-center-models/types";
import {
  ChevronRight,
  FileMusic,
  GripVertical,
  Music4,
  Trash2,
} from "lucide-react";
import { startTransition, useState } from "react";
import type { CSSProperties } from "react";

import {
  formatLength,
  getItemTone,
} from "@/components/schedule/plan-tab-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { reorderPlanItems } from "@/lib/plan-items-query-state";
import { cn } from "@/lib/utils";

interface PlanItemListProps {
  items: PlanItem[];
  isLoading: boolean;
  isPlaceholderData: boolean;
  pendingItemId: string | null;
  onAddSong: () => void;
  onAddHeader: () => void;
  onAddItem: () => void;
  onEditItem: (itemId: string) => void;
  onPreviewItem?: (itemId: string) => void;
  onRequestDelete: (itemId: string) => void;
  onReorderItems: (items: PlanItem[]) => Promise<void> | void;
}

interface SortablePlanItemProps {
  item: PlanItem;
  isBusy: boolean;
  isDragging: boolean;
  reorderDisabled: boolean;
  onEdit: () => void;
  onPreview: () => void;
  onDelete: () => void;
}

interface PlanItemCardProps {
  item: PlanItem;
  isBusy: boolean;
  isDragged: boolean;
  dragAttributes?: ReturnType<typeof useSortable>["attributes"];
  dragListeners?: ReturnType<typeof useSortable>["listeners"];
  onEdit: () => void;
  onPreview: () => void;
  onDelete: () => void;
}

const PlanItemCard = ({
  item,
  isBusy,
  isDragged,
  dragAttributes,
  dragListeners,
  onEdit,
  onPreview,
  onDelete,
}: PlanItemCardProps) => {
  const tone = getItemTone(item);
  const itemActionLabel = item.title || "plan item";
  const displayTitle = item.title || "Untitled item";
  const lengthLabel = formatLength(item.length);
  const rowHoverClassName =
    item.itemType === "header"
      ? "hover:ring-border/80 hover:ring-1 hover:ring-inset"
      : "hover:bg-accent/45";
  const dragHandleClassName =
    "flex w-9 shrink-0 touch-manipulation items-center justify-center self-stretch border-0 bg-transparent text-muted-foreground/55 outline-none hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-3 active:cursor-grabbing disabled:pointer-events-none disabled:opacity-50";
  const editButtonClassName =
    "min-w-0 flex-1 border-0 bg-transparent text-left font-inherit outline-none focus-visible:ring-ring/50 focus-visible:ring-3";

  return (
    <div
      className={cn(
        "group/plan-item",
        tone.row,
        !isDragged && rowHoverClassName,
        isDragged && "bg-muted/80 shadow-lg"
      )}
    >
      <div className="hidden min-h-11 items-stretch sm:flex">
        <button
          type="button"
          {...dragAttributes}
          {...dragListeners}
          disabled={isBusy}
          aria-label={`Reorder ${itemActionLabel}`}
          className={cn(dragHandleClassName, "cursor-grab")}
        >
          <GripVertical className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`Edit ${itemActionLabel}`}
          onFocus={onPreview}
          onPointerEnter={onPreview}
          onClick={onEdit}
          className={cn(
            "flex items-center gap-3 px-2 py-2",
            editButtonClassName
          )}
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
        </button>
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
        <button
          type="button"
          {...dragAttributes}
          {...dragListeners}
          disabled={isBusy}
          aria-label={`Reorder ${itemActionLabel}`}
          className={cn(dragHandleClassName, "cursor-grab")}
        >
          <GripVertical className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`Edit ${itemActionLabel}`}
          onFocus={onPreview}
          onPointerEnter={onPreview}
          onClick={onEdit}
          className={cn("px-2 py-2.5", editButtonClassName)}
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
        </button>
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
  onPreview,
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
        onPreview={onPreview}
        onDelete={onDelete}
      />
    </div>
  );
};

export const PlanItemList = ({
  items,
  isLoading,
  isPlaceholderData,
  pendingItemId,
  onAddSong,
  onAddHeader,
  onAddItem,
  onEditItem,
  onPreviewItem,
  onRequestDelete,
  onReorderItems,
}: PlanItemListProps) => {
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const reorderDisabled = pendingItemId === "reorder";
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
      {isLoading ? (
        <div className="space-y-2 pr-0 sm:pr-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : null}
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
              <Button
                type="button"
                size="sm"
                onClick={onAddSong}
                disabled={isPlaceholderData}
              >
                <Music4 className="size-4" />
                Add Song
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onAddHeader}
                disabled={isPlaceholderData}
              >
                Add Header
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onAddItem}
                disabled={isPlaceholderData}
              >
                Add Item
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
      {showList ? (
        <div className="relative" aria-busy={isPlaceholderData}>
          {isPlaceholderData ? (
            <div className="border-border/60 bg-background/95 text-muted-foreground sticky top-0 z-10 mb-2 rounded-md border px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
              Loading selected plan...
            </div>
          ) : null}
          <div
            className={cn(
              isPlaceholderData && "pointer-events-none opacity-60"
            )}
          >
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
                <div className="pb-4 sm:pr-3">
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
                        onPreview={() => onPreviewItem?.(item.id)}
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
                      onPreview={() => onPreviewItem?.(activeItem.id)}
                      onDelete={() => {
                        onRequestDelete(activeItem.id);
                      }}
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>
      ) : null}
    </ScrollArea>
  );
};

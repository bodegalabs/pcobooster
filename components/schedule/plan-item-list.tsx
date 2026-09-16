"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FileMusic, GripVertical, Music4, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  formatLength,
  getItemTone,
} from "@/components/schedule/plan-tab-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { reorderPlanItems } from "@/lib/plan-items-query-state";
import type { PlanItem } from "@/lib/types";
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
  onDeleteItem: (itemId: string) => Promise<void> | void;
  onReorderItems: (items: PlanItem[]) => Promise<void> | void;
}

export function PlanItemList({
  items,
  isLoading,
  isPlaceholderData,
  pendingItemId,
  onAddSong,
  onAddHeader,
  onAddItem,
  onEditItem,
  onPreviewItem,
  onDeleteItem,
  onReorderItems,
}: PlanItemListProps) {
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [itemIdPendingDelete, setItemIdPendingDelete] = useState<string | null>(
    null
  );
  const reorderDisabled = pendingItemId === "reorder";
  const activeItem = items.find((item) => item.id === activeItemId) ?? null;
  const itemPendingDelete =
    items.find((item) => item.id === itemIdPendingDelete) ?? null;
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

    if (!overId || activeId === overId) return;

    const nextItems = reorderPlanItems(items, activeId, overId);
    if (nextItems === items) return;

    await onReorderItems(nextItems);
  };

  const handleConfirmDelete = async () => {
    if (!itemIdPendingDelete) return;
    const itemId = itemIdPendingDelete;
    setItemIdPendingDelete(null);

    try {
      await onDeleteItem(itemId);
    } catch {
      // Errors are handled by the mutation toast; the optimistic cache restores the row.
    }
  };

  return (
    <>
      <DeleteConfirmationDialog
        open={Boolean(itemIdPendingDelete && itemPendingDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setItemIdPendingDelete(null);
          }
        }}
        onConfirm={handleConfirmDelete}
        isPending={pendingItemId === itemIdPendingDelete}
        itemLabel={itemPendingDelete?.title || "Untitled item"}
        description={
          itemPendingDelete
            ? `Remove "${itemPendingDelete.title || "Untitled item"}" from this plan? This action cannot be undone.`
            : "Remove this item from the plan? This action cannot be undone."
        }
      />

      <ScrollArea className="min-h-0 flex-1">
        {isLoading ? (
          <div className="space-y-2 pr-0 sm:pr-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Card className="border-border/50 mx-0 border-dashed bg-transparent px-6 py-8 text-center sm:mr-3">
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
        ) : (
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
                onDragCancel={() => setActiveItemId(null)}
                onDragEnd={(event) => void handleDragEnd(event)}
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
                          onEdit={() => onEditItem(item.id)}
                          onPreview={() => onPreviewItem?.(item.id)}
                          onDelete={() => setItemIdPendingDelete(item.id)}
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
                        onEdit={() => onEditItem(activeItem.id)}
                        onPreview={() => onPreviewItem?.(activeItem.id)}
                        onDelete={() => setItemIdPendingDelete(activeItem.id)}
                      />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          </div>
        )}
      </ScrollArea>
    </>
  );
}

interface SortablePlanItemProps {
  item: PlanItem;
  isBusy: boolean;
  isDragging: boolean;
  reorderDisabled: boolean;
  onEdit: () => void;
  onPreview: () => void;
  onDelete: () => Promise<void> | void;
}

function SortablePlanItem({
  item,
  isBusy,
  isDragging,
  reorderDisabled,
  onEdit,
  onPreview,
  onDelete,
}: SortablePlanItemProps) {
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

  const style = {
    transform: CSS.Transform.toString(
      transform
        ? {
            ...transform,
            scaleX: isSortableDragging ? 1.01 : 1,
            scaleY: isSortableDragging ? 1.01 : 1,
          }
        : null
    ),
    transition: transition ?? "transform 180ms cubic-bezier(0.2, 0, 0, 1)",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative border-b transition-[transform,box-shadow,opacity] duration-200 ease-out last:border-b-0",
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
}

interface PlanItemCardProps {
  item: PlanItem;
  isBusy: boolean;
  isDragged: boolean;
  dragAttributes?: ReturnType<typeof useSortable>["attributes"];
  dragListeners?: ReturnType<typeof useSortable>["listeners"];
  onEdit: () => void;
  onPreview: () => void;
  onDelete: () => Promise<void> | void;
}

function PlanItemCard({
  item,
  isBusy,
  isDragged,
  dragAttributes,
  dragListeners,
  onEdit,
  onPreview,
  onDelete,
}: PlanItemCardProps) {
  const tone = getItemTone(item);
  const lengthLabel = formatLength(item.length);
  const rowHoverClassName =
    item.itemType === "header"
      ? "hover:ring-border/80 hover:ring-1 hover:ring-inset"
      : "hover:bg-accent/45";
  const dragHandleClassName =
    "flex w-9 shrink-0 touch-manipulation items-center justify-center self-stretch border-0 bg-transparent text-muted-foreground/55 outline-none transition-colors hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px] active:cursor-grabbing disabled:pointer-events-none disabled:opacity-50";
  const editButtonClassName =
    "min-w-0 flex-1 border-0 bg-transparent text-left font-inherit outline-none transition-colors focus-visible:ring-ring/50 focus-visible:ring-[3px]";

  return (
    <div
      className={cn(
        "group/plan-item transition-[background-color,box-shadow] duration-200",
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
          aria-label={`Reorder ${item.title || "plan item"}`}
          className={cn(dragHandleClassName, "cursor-grab")}
        >
          <GripVertical className="size-4" />
        </button>
        <button
          type="button"
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
                <p className="truncate font-semibold">
                  {item.title || "Untitled item"}
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
                  <Badge
                    variant="outline"
                    className="h-6 min-w-6 rounded-full px-2 text-[11px] font-semibold shadow-xs"
                  >
                    {item.key.name}
                  </Badge>
                ) : null}
                {lengthLabel ? (
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
        <div className="border-border/0 group-hover/plan-item:border-border/50 group-focus-within/plan-item:border-border/50 flex items-center border-l px-2 py-1.5 transition-colors">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="group/delete text-muted-foreground hover:text-destructive size-8"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              void onDelete();
            }}
            disabled={isBusy}
            aria-label={`Delete ${item.title || "plan item"}`}
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
          aria-label={`Reorder ${item.title || "plan item"}`}
          className={cn(dragHandleClassName, "cursor-grab")}
        >
          <GripVertical className="size-4" />
        </button>
        <button
          type="button"
          onFocus={onPreview}
          onPointerEnter={onPreview}
          onClick={onEdit}
          className={cn("px-2 py-2.5", editButtonClassName)}
        >
          <div className="min-w-0 flex-1 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 font-semibold break-words">
                {item.title || "Untitled item"}
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
                <Badge
                  variant="outline"
                  className="h-6 min-w-6 rounded-full px-2 text-[11px] font-semibold shadow-xs"
                >
                  {item.key.name}
                </Badge>
              ) : null}
              {lengthLabel ? (
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
        <div className="border-border/0 group-hover/plan-item:border-border/50 group-focus-within/plan-item:border-border/50 flex items-start border-l px-2 py-2 transition-colors">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="group/delete text-muted-foreground hover:text-destructive size-8 shrink-0"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              void onDelete();
            }}
            disabled={isBusy}
            aria-label={`Delete ${item.title || "plan item"}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

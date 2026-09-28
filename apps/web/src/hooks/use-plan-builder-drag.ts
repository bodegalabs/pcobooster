import { MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import type {
  DragEndEvent,
  DragMoveEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import type {
  PlanItem,
  SongCatalogEntry,
} from "@pcobooster/planning-center-models/types";
import { useState } from "react";

import type { PlanDropIndicator } from "@/components/schedule/plan-item-list";
import { LIBRARY_SONG_DRAG_PREFIX } from "@/components/schedule/plan-song-library";
import { reorderPlanItems } from "@/lib/plan-items-query-state";
import type { PlanInsertion } from "@/lib/plan-items-query-state";

interface UsePlanBuilderDragOptions {
  items: PlanItem[];
  onReorder: (nextItems: PlanItem[]) => void;
  onDropSong: (song: SongCatalogEntry, insertion: PlanInsertion) => void;
}

/**
 * One drag context for the run sheet and the song library: rows reorder among
 * themselves, and library songs drop before or after the row under them.
 */
export const usePlanBuilderDrag = ({
  items,
  onReorder,
  onDropSong,
}: UsePlanBuilderDragOptions) => {
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [draggingSong, setDraggingSong] = useState<SongCatalogEntry | null>(
    null
  );
  const [dropIndicator, setDropIndicator] = useState<PlanDropIndicator | null>(
    null
  );
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 160, tolerance: 10 },
    })
  );

  const reset = () => {
    setActiveItemId(null);
    setDraggingSong(null);
    setDropIndicator(null);
  };

  const onDragStart = (event: DragStartEvent) => {
    // The library reports its own songs through `startSongDrag`.
    if (!String(event.active.id).startsWith(LIBRARY_SONG_DRAG_PREFIX)) {
      setActiveItemId(String(event.active.id));
    }
  };

  const onDragMove = (event: DragMoveEvent) => {
    if (draggingSong === null) {
      return;
    }
    const { over } = event;
    const dragged = event.active.rect.current.translated;
    if (over === null || dragged === null) {
      setDropIndicator(null);
      return;
    }
    const draggedCenter = dragged.top + dragged.height / 2;
    const overCenter = over.rect.top + over.rect.height / 2;
    const side = draggedCenter > overCenter ? "after" : "before";
    const itemId = String(over.id);
    if (dropIndicator?.itemId !== itemId || dropIndicator.side !== side) {
      setDropIndicator({ itemId, side });
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    const song = draggingSong;
    const indicator = dropIndicator;
    reset();

    if (song !== null) {
      if (indicator === null) {
        return;
      }
      const overIndex = items.findIndex((item) => item.id === indicator.itemId);
      onDropSong(song, {
        afterItemId:
          indicator.side === "after"
            ? indicator.itemId
            : (items[overIndex - 1]?.id ?? null),
      });
      return;
    }

    const overId = event.over ? String(event.over.id) : null;
    const nextItems =
      overId === null
        ? items
        : reorderPlanItems(items, String(event.active.id), overId);
    if (nextItems !== items) {
      onReorder(nextItems);
    }
  };

  return {
    sensors,
    activeItemId,
    draggingSong,
    dropIndicator,
    startSongDrag: setDraggingSong,
    dragHandlers: {
      onDragStart,
      onDragMove,
      onDragEnd,
      onDragCancel: reset,
    },
  };
};

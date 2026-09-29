import { MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import type { PlanItem } from "@pcobooster/planning-center-models/types";
import { useState } from "react";

import { reorderPlanItems } from "@/lib/plan-items-query-state";

interface UsePlanBuilderDragOptions {
  items: PlanItem[];
  onReorder: (nextItems: PlanItem[]) => void;
}

/** Drag to reorder the run sheet's rows. */
export const usePlanBuilderDrag = ({
  items,
  onReorder,
}: UsePlanBuilderDragOptions) => {
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 160, tolerance: 10 },
    })
  );

  const onDragStart = (event: DragStartEvent) => {
    setActiveItemId(String(event.active.id));
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveItemId(null);
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
    dragHandlers: {
      onDragStart,
      onDragEnd,
      onDragCancel: () => {
        setActiveItemId(null);
      },
    },
  };
};

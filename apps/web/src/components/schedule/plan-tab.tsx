import { closestCenter, DndContext, DragOverlay } from "@dnd-kit/core";
import type {
  PlanItem,
  SongCatalogEntry,
} from "@pcobooster/planning-center-models/types";
import { Music2 } from "lucide-react";
import { startTransition, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { toast } from "sonner";

import { PageScrollArea } from "@/components/page-shell";
import { PlanItemEditDialog } from "@/components/schedule/plan-item-edit-dialog";
import { PlanItemInspector } from "@/components/schedule/plan-item-inspector";
import type { PlanItemSaveInput } from "@/components/schedule/plan-item-inspector";
import {
  PlanItemList,
  PlanItemListEmpty,
  PlanItemListSkeleton,
  PlanItemRow,
} from "@/components/schedule/plan-item-list";
import type { PlanItemRowHandlers } from "@/components/schedule/plan-item-list";
import { PlanSongLibrary } from "@/components/schedule/plan-song-library";
import {
  buildDraft,
  buildRunSheet,
} from "@/components/schedule/plan-tab-helpers";
import type { RunSheetEntry } from "@/components/schedule/plan-tab-helpers";
import { PlanTabToolbar } from "@/components/schedule/plan-tab-toolbar";
import { SongPickerDialog } from "@/components/schedule/song-picker-dialog";
import { useMediaQuery } from "@/hooks/use-media-query";
import { usePlanBuilderDrag } from "@/hooks/use-plan-builder-drag";
import { usePlanBuilderHotkeys } from "@/hooks/use-plan-builder-hotkeys";
import { usePlanTabController } from "@/hooks/use-plan-tab-controller";
import { useRevealOnLoad } from "@/hooks/use-reveal-on-load";
import type { PlanInsertion } from "@/lib/plan-items-query-state";
import { summarizeOrder } from "@/lib/plan-overview";
import { buildPlanInsights } from "@/lib/plan-set-insights";
import type { PlanInsights } from "@/lib/plan-set-insights";
import { cn } from "@/lib/utils";

interface PlanTabProps {
  serviceTypeId: string | null;
  planId: string | null;
  /** The plan's date, for spotting songs sung in the weeks before it. */
  planDate: Date | null;
}

/** The library sits beside the run sheet only where there is room for both. */
const WIDE_LAYOUT_QUERY = "(min-width: 1024px)";

/** Runs a plan write; mutations report their own failures and restore the plan. */
const runQuietly = (task: () => Promise<void>) => {
  startTransition(async () => {
    try {
      await task();
    } catch {
      // Already reported by the mutation's error toast.
    }
  });
};

const focusRow = (itemId: string) => {
  requestAnimationFrame(() => {
    const row = document.querySelector<HTMLElement>(
      `[data-plan-item-id="${CSS.escape(itemId)}"]`
    );
    row?.scrollIntoView({ block: "nearest" });
    row
      ?.querySelector<HTMLElement>('[data-slot="item"]')
      ?.focus({ preventScroll: true });
  });
};

const PlanBuilderDragPreview = ({
  item,
  song,
  entry,
  insights,
  serviceTypeId,
  handlers,
}: {
  item: PlanItem | null;
  song: SongCatalogEntry | null;
  entry: RunSheetEntry | undefined;
  insights: PlanInsights;
  serviceTypeId: string | null;
  handlers: PlanItemRowHandlers;
}) => (
  <DragOverlay zIndex={60}>
    {item ? (
      <div className="bg-background rotate-[0.2deg] rounded-lg shadow-2xl">
        <PlanItemRow
          item={item}
          entry={entry}
          transition={insights.transitions.get(item.id) ?? null}
          recentPlayDays={insights.recentPlays.get(item.id) ?? null}
          selected={false}
          isBusy={false}
          isDragged
          serviceTypeId={serviceTypeId}
          handlers={handlers}
        />
      </div>
    ) : null}
    {song ? (
      <div className="bg-background flex w-64 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-2xl">
        <Music2 className="text-primary size-4 shrink-0" aria-hidden />
        <span className="truncate">{song.title}</span>
      </div>
    ) : null}
  </DragOverlay>
);

interface PlanBuilderPanelProps {
  items: PlanItem[];
  selectedIndex: number;
  inspecting: boolean;
  serviceTypeId: string | null;
  librarySearchRef: RefObject<HTMLInputElement | null>;
  pendingSongId: string | null;
  onSelect: (itemId: string | null) => void;
  onClose: () => void;
  onRemove: (itemId: string) => void;
  onSave: (input: PlanItemSaveInput) => void;
  onAddSong: (song: SongCatalogEntry) => void;
  onSongDragStart: (song: SongCatalogEntry) => void;
}

/** The right panel: the opened row's details, or the song library. */
const PlanBuilderPanel = ({
  items,
  selectedIndex,
  inspecting,
  serviceTypeId,
  librarySearchRef,
  pendingSongId,
  onSelect,
  onClose,
  onRemove,
  onSave,
  onAddSong,
  onSongDragStart,
}: PlanBuilderPanelProps) => {
  const selectedItem = items[selectedIndex] ?? null;
  const previousItem = items[selectedIndex - 1] ?? null;
  const nextItem =
    selectedIndex === -1 ? null : (items[selectedIndex + 1] ?? null);
  return (
    <aside className="flex min-h-0 w-[min(22rem,32vw)] shrink-0 flex-col pb-4">
      {inspecting && selectedItem !== null ? (
        <PlanItemInspector
          item={selectedItem}
          serviceTypeId={serviceTypeId}
          positionLabel={`${selectedIndex + 1} of ${items.length}`}
          onPrevious={
            previousItem === null
              ? null
              : () => {
                  onSelect(previousItem.id);
                }
          }
          onNext={
            nextItem === null
              ? null
              : () => {
                  onSelect(nextItem.id);
                }
          }
          onClose={onClose}
          onRemove={onRemove}
          onSave={onSave}
        />
      ) : (
        <PlanSongLibrary
          searchInputRef={librarySearchRef}
          planSongIds={
            new Set(items.flatMap((item) => (item.song ? [item.song.id] : [])))
          }
          insertionLabel={
            selectedItem === null
              ? "to the end"
              : `after “${selectedItem.title || "Untitled item"}”`
          }
          pendingSongId={pendingSongId}
          onAddSong={onAddSong}
          onSongDragStart={onSongDragStart}
          onLeave={() => {
            librarySearchRef.current?.blur();
            if (selectedItem !== null) {
              focusRow(selectedItem.id);
            }
          }}
        />
      )}
    </aside>
  );
};

/** Saves a key or length picked right on a row. */
const inlineEditHandlers = (
  saveItem: (input: PlanItemSaveInput) => Promise<void>
): Pick<
  PlanItemRowHandlers,
  "onChangeKey" | "onChangeLength" | "onInvalidLength"
> => ({
  onChangeKey: (item, arrangement, key) => {
    runQuietly(async () => {
      await saveItem({
        item,
        draft: {
          ...buildDraft(item),
          arrangementId: arrangement.id,
          keyId: key.id,
        },
        length: item.length,
        optimisticArrangement: {
          id: arrangement.id,
          name: arrangement.name,
          sequence: arrangement.sequence,
          length: arrangement.length,
          archivedAt: null,
        },
        optimisticKey: key,
      });
    });
  },
  onChangeLength: (item, length) => {
    runQuietly(async () => {
      await saveItem({
        item,
        draft: buildDraft(item),
        length,
        optimisticArrangement: item.arrangement,
        optimisticKey: item.key,
      });
    });
  },
  onInvalidLength: (message) => {
    toast.error(message);
  },
});

/**
 * The plan builder: an editable run sheet with the song library beside it. Everything
 * happens in place: select a row, then add after it, rearrange it, or edit its key and
 * length without leaving the sheet.
 */
export const PlanTab = ({ serviceTypeId, planId, planDate }: PlanTabProps) => {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  // The right panel shows the song library, or the opened row's details.
  const [panel, setPanel] = useState<"library" | "inspector">("library");
  const controller = usePlanTabController({
    serviceTypeId,
    planId,
    onSongAdded: setSelectedItemId,
  });
  const { items, isLoading, editingItemId, songPickerOpen, saveItem } =
    controller;
  const isWide = useMediaQuery(WIDE_LAYOUT_QUERY);
  const librarySearchRef = useRef<HTMLInputElement>(null);
  const revealClassName = useRevealOnLoad(isLoading);

  const selectedIndex = items.findIndex((item) => item.id === selectedItemId);
  const selectedItem = items[selectedIndex] ?? null;
  const inspecting = isWide && panel === "inspector" && selectedItem !== null;
  const insertion: PlanInsertion | undefined =
    selectedItem === null ? undefined : { afterItemId: selectedItem.id };
  const runSheet = buildRunSheet(items);
  const insights = buildPlanInsights(items, planDate);

  const addSong = (song: SongCatalogEntry, at?: PlanInsertion) => {
    runQuietly(async () => {
      await controller.addSongToPlan(song, at);
    });
  };
  const addBasicItem = (kind: "header" | "item", at?: PlanInsertion) => {
    runQuietly(async () => {
      await controller.createBasicItem(kind, at);
    });
  };
  const startSongSearch = () => {
    if (isWide) {
      setPanel("library");
      requestAnimationFrame(() => {
        librarySearchRef.current?.focus();
      });
      return;
    }
    controller.setSongPickerOpen(true);
  };
  const selectAndFocus = (itemId: string | null) => {
    setSelectedItemId(itemId);
    if (itemId !== null) {
      focusRow(itemId);
    }
  };
  /** Wide screens show details in the panel; phones get the details sheet. */
  const openItem = (itemId: string) => {
    setSelectedItemId(itemId);
    if (isWide) {
      setPanel("inspector");
      return;
    }
    controller.setEditingItemId(itemId);
  };
  const removeAndSelectNeighbor = (itemId: string) => {
    const index = items.findIndex((item) => item.id === itemId);
    const neighbor = items[index + 1] ?? items[index - 1] ?? null;
    controller.removeItem(itemId);
    if (selectedItemId === itemId) {
      setSelectedItemId(neighbor?.id ?? null);
    }
  };

  const drag = usePlanBuilderDrag({
    items,
    onReorder: (nextItems) => {
      runQuietly(async () => {
        await controller.reorderItems(nextItems);
      });
    },
    onDropSong: addSong,
  });

  usePlanBuilderHotkeys({
    enabled:
      !isLoading &&
      editingItemId === null &&
      !songPickerOpen &&
      drag.activeItemId === null,
    items,
    selectedItemId: selectedItem?.id ?? null,
    onSelect: selectAndFocus,
    onMove: (itemId, offset) => {
      runQuietly(async () => {
        await controller.moveItem(itemId, offset);
      });
      focusRow(itemId);
    },
    onOpenDetails: openItem,
    onRemove: controller.removeItem,
    onAddSong: startSongSearch,
    onAddBasic: (kind) => {
      addBasicItem(kind, insertion);
    },
    onEscape: () => {
      if (inspecting) {
        setPanel("library");
        return;
      }
      setSelectedItemId(null);
    },
  });

  const handlers: PlanItemRowHandlers = {
    onOpen: openItem,
    onRemove: removeAndSelectNeighbor,
    onInsert: (kind, afterItemId) => {
      setSelectedItemId(afterItemId);
      if (kind === "song") {
        startSongSearch();
        return;
      }
      addBasicItem(kind, { afterItemId });
    },
    ...inlineEditHandlers(saveItem),
  };

  let sheet: ReactNode = <PlanItemListSkeleton />;
  if (!isLoading && items.length === 0) {
    sheet = (
      <PlanItemListEmpty
        onAddSong={startSongSearch}
        onAddHeader={() => {
          addBasicItem("header");
        }}
        onAddItem={() => {
          addBasicItem("item");
        }}
      />
    );
  } else if (!isLoading) {
    sheet = (
      <div className={cn("relative", revealClassName)}>
        <PlanItemList
          items={items}
          runSheet={runSheet}
          transitions={insights.transitions}
          recentPlays={insights.recentPlays}
          selectedItemId={selectedItem?.id ?? null}
          activeItemId={drag.activeItemId}
          dropIndicator={drag.dropIndicator}
          pendingItemId={controller.pendingItemId}
          serviceTypeId={serviceTypeId}
          handlers={handlers}
          getItemIntentProps={controller.getItemIntentProps}
        />
      </div>
    );
  }
  const draggedItem =
    items.find((item) => item.id === drag.activeItemId) ?? null;

  return (
    <>
      <SongPickerDialog
        open={songPickerOpen}
        onOpenChange={(open) => {
          controller.setSongPickerOpen(open);
        }}
        serviceTypeId={serviceTypeId}
        onSelectSong={(song) => {
          addSong(song, insertion);
        }}
        pendingSongId={controller.pendingSongId}
      />

      <PlanItemEditDialog
        item={controller.editingItem}
        open={Boolean(editingItemId)}
        serviceTypeId={serviceTypeId}
        onOpenChange={(open) => {
          if (!open) {
            controller.setEditingItemId(null);
          }
        }}
        onSave={async (input) => {
          await saveItem(input);
        }}
        onDelete={(itemId) => {
          controller.removeItem(itemId);
        }}
      />

      <DndContext
        collisionDetection={closestCenter}
        sensors={drag.sensors}
        {...drag.dragHandlers}
      >
        <div className="flex h-full min-h-0 gap-6">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            <PlanTabToolbar
              order={
                isLoading || items.length === 0 ? null : summarizeOrder(items)
              }
              keyJumps={insights.keyJumps}
              repeats={insights.recentPlays.size}
              isReordering={controller.isReordering}
              isCreatingBasicItem={controller.isCreatingBasicItem}
              disabled={isLoading}
              onAddSong={startSongSearch}
              onAddHeader={() => {
                addBasicItem("header", insertion);
              }}
              onAddItem={() => {
                addBasicItem("item", insertion);
              }}
            />
            <PageScrollArea>{sheet}</PageScrollArea>
          </div>
          {isWide ? (
            <PlanBuilderPanel
              items={items}
              selectedIndex={selectedIndex}
              inspecting={inspecting}
              serviceTypeId={serviceTypeId}
              librarySearchRef={librarySearchRef}
              pendingSongId={controller.pendingSongId}
              onSelect={selectAndFocus}
              onClose={() => {
                setPanel("library");
              }}
              onRemove={removeAndSelectNeighbor}
              onSave={(input) => {
                runQuietly(async () => {
                  await saveItem(input);
                });
              }}
              onAddSong={(song) => {
                addSong(song, insertion);
              }}
              onSongDragStart={(song) => {
                drag.startSongDrag(song);
              }}
            />
          ) : null}
        </div>
        <PlanBuilderDragPreview
          item={draggedItem}
          song={drag.draggingSong}
          entry={draggedItem ? runSheet.get(draggedItem.id) : undefined}
          insights={insights}
          serviceTypeId={serviceTypeId}
          handlers={handlers}
        />
      </DndContext>
    </>
  );
};

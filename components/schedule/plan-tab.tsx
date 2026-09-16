"use client";

import { startTransition } from "react";

import { PlanItemEditDialog } from "@/components/schedule/plan-item-edit-dialog";
import { PlanItemList } from "@/components/schedule/plan-item-list";
import { PlanTabToolbar } from "@/components/schedule/plan-tab-toolbar";
import { SongPickerDialog } from "@/components/schedule/song-picker-dialog";
import { usePlanTabController } from "@/hooks/use-plan-tab-controller";

interface PlanTabProps {
  serviceTypeId: string | null;
  planId: string | null;
}

export const PlanTab = ({ serviceTypeId, planId }: PlanTabProps) => {
  const {
    items,
    isLoading,
    isPlaceholderData,
    editingItemId,
    editingItem,
    songPickerOpen,
    pendingItemId,
    pendingSongId,
    isCreatingBasicItem,
    setEditingItemId,
    setSongPickerOpen,
    createBasicItem,
    addSongToPlan,
    deleteItem,
    reorderItems,
    prefetchItemSongOptions,
    saveItem,
  } = usePlanTabController({
    serviceTypeId,
    planId,
  });

  return (
    <>
      <SongPickerDialog
        open={songPickerOpen}
        onOpenChange={setSongPickerOpen}
        serviceTypeId={serviceTypeId}
        onSelectSong={async (song) => {
          await addSongToPlan(song);
        }}
        pendingSongId={pendingSongId}
      />

      <PlanItemEditDialog
        item={editingItem}
        open={Boolean(editingItemId)}
        serviceTypeId={serviceTypeId}
        onOpenChange={(open) => {
          if (!open) {
            setEditingItemId(null);
          }
        }}
        onSave={async (input) => {
          await saveItem(input);
        }}
      />

      <div className="flex h-full min-h-0 flex-col gap-3">
        <PlanTabToolbar
          pendingItemId={pendingItemId}
          isCreatingBasicItem={isCreatingBasicItem}
          disabled={isPlaceholderData}
          onAddSong={() => {
            setSongPickerOpen(true);
          }}
          onAddHeader={() => {
            startTransition(async () => {
              await createBasicItem("header");
            });
          }}
          onAddItem={() => {
            startTransition(async () => {
              await createBasicItem("item");
            });
          }}
        />

        <PlanItemList
          items={items}
          isLoading={isLoading}
          isPlaceholderData={isPlaceholderData}
          pendingItemId={pendingItemId}
          onAddSong={() => {
            setSongPickerOpen(true);
          }}
          onAddHeader={() => {
            startTransition(async () => {
              await createBasicItem("header");
            });
          }}
          onAddItem={() => {
            startTransition(async () => {
              await createBasicItem("item");
            });
          }}
          onEditItem={setEditingItemId}
          onPreviewItem={prefetchItemSongOptions}
          onDeleteItem={deleteItem}
          onReorderItems={reorderItems}
        />
      </div>
    </>
  );
};

"use client";

import { startTransition, useState } from "react";

import { PlanItemEditDialog } from "@/components/schedule/plan-item-edit-dialog";
import { PlanItemList } from "@/components/schedule/plan-item-list";
import { PlanTabToolbar } from "@/components/schedule/plan-tab-toolbar";
import { SongPickerDialog } from "@/components/schedule/song-picker-dialog";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
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
  const [itemIdPendingDelete, setItemIdPendingDelete] = useState<string | null>(
    null
  );
  const itemPendingDelete =
    items.find((item) => item.id === itemIdPendingDelete) ?? null;
  const itemPendingDeleteTitle = itemPendingDelete?.title ?? "Untitled item";

  const handleConfirmDelete = async () => {
    if (itemIdPendingDelete === null) {
      return;
    }
    const itemId = itemIdPendingDelete;
    setItemIdPendingDelete(null);
    try {
      await deleteItem(itemId);
    } catch {
      // Errors are handled by the mutation toast; the optimistic cache restores the row.
    }
  };

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

      <DeleteConfirmationDialog
        open={itemPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setItemIdPendingDelete(null);
          }
        }}
        onConfirm={handleConfirmDelete}
        isPending={pendingItemId === itemIdPendingDelete}
        itemLabel={itemPendingDeleteTitle}
        description={`Remove "${itemPendingDeleteTitle}" from this plan? This action cannot be undone.`}
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
        onDelete={(itemId) => {
          setEditingItemId(null);
          setItemIdPendingDelete(itemId);
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
          onRequestDelete={setItemIdPendingDelete}
          onReorderItems={reorderItems}
        />
      </div>
    </>
  );
};

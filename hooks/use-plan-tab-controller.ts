"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
  getItemTypeLabel,
  type DraftState,
} from "@/components/schedule/plan-tab-helpers";
import { toast } from "@/components/ui/sonner";
import { usePlanItems } from "@/hooks/use-plan-items";
import { createSongOptionsQueryOptions } from "@/hooks/use-song-options";
import { deleteJson, patchJson, postJson } from "@/lib/http/client";
import {
  hydratePlanItem,
  type SerializedPlanItem,
} from "@/lib/plan-item-client";
import {
  appendPlanItem,
  applyPlanItemDraft,
  applyPlanItemsOptimisticUpdate,
  collectPlanSongOptionPrefetchIds,
  createOptimisticBasicPlanItem,
  createOptimisticSongPlanItem,
  nextPlanItemSequence,
  planItemDraftChangesItem,
  planItemsHaveSameOrder,
  removePlanItem,
  replacePlanItem,
  replacePlanItemById,
  restorePlanItemsSnapshot,
  settlePlanItemsQuery,
  type PlanItemsOptimisticSnapshot,
} from "@/lib/plan-items-query-state";
import { queryKeys } from "@/lib/query-keys";
import type {
  PlanItem,
  PlanItemArrangement,
  PlanItemKey,
  SongCatalogEntry,
  SongOptionSet,
} from "@/lib/types";

interface UsePlanTabControllerArgs {
  serviceTypeId: string | null;
  planId: string | null;
}

const EMPTY_PLAN_ITEMS: PlanItem[] = [];

function buildDeletePlanItemUrl(
  itemId: string,
  serviceTypeId: string,
  planId: string
): string {
  const params = new URLSearchParams({
    service_type_id: serviceTypeId,
    plan_id: planId,
  });

  return `/api/plan-items/${itemId}?${params.toString()}`;
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function usePlanTabController({
  serviceTypeId,
  planId,
}: UsePlanTabControllerArgs) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.planItems(serviceTypeId, planId);
  const {
    data: itemsData,
    isLoading,
    isPlaceholderData,
  } = usePlanItems(serviceTypeId, planId);
  const items = itemsData ?? EMPTY_PLAN_ITEMS;

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [songPickerOpen, setSongPickerOpen] = useState(false);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [pendingSongId, setPendingSongId] = useState<string | null>(null);

  useEffect(() => {
    setEditingItemId(null);
    setSongPickerOpen(false);
  }, [planId, serviceTypeId]);

  useEffect(() => {
    if (!serviceTypeId || isPlaceholderData) return;

    const songIds = collectPlanSongOptionPrefetchIds(items);
    if (songIds.length === 0) return;

    const timers = songIds.map((songId, index) =>
      window.setTimeout(
        () => {
          void queryClient.prefetchQuery(
            createSongOptionsQueryOptions(songId, serviceTypeId)
          );
        },
        450 + index * 150
      )
    );

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [isPlaceholderData, items, queryClient, serviceTypeId]);

  const settlePlanItems = () => settlePlanItemsQuery(queryClient, queryKey);

  const prefetchItemSongOptions = useCallback(
    (itemId: string) => {
      if (!serviceTypeId) return;
      const item = items.find((candidate) => candidate.id === itemId);
      if (!item?.song) return;

      void queryClient.prefetchQuery(
        createSongOptionsQueryOptions(item.song.id, serviceTypeId)
      );
    },
    [items, queryClient, serviceTypeId]
  );

  const createItemMutation = useMutation<
    PlanItem,
    unknown,
    "header" | "item",
    {
      snapshot: PlanItemsOptimisticSnapshot | undefined;
      optimisticItemId: string;
    }
  >({
    mutationFn: async (kind: "header" | "item") => {
      if (!serviceTypeId || !planId) {
        throw new Error("A service type and plan must be selected.");
      }

      const item = await postJson<SerializedPlanItem>("/api/plan-items", {
        service_type_id: serviceTypeId,
        plan_id: planId,
        item_type: kind,
        title: kind === "header" ? "New Header" : "New Item",
      });

      return hydratePlanItem(item);
    },
    onMutate: async (kind) => {
      await queryClient.cancelQueries({ queryKey });

      const optimisticItemId = `optimistic-${kind}-${crypto.randomUUID()}`;
      setPendingItemId(optimisticItemId);

      return {
        optimisticItemId,
        snapshot: applyPlanItemsOptimisticUpdate(
          queryClient,
          queryKey,
          (current) =>
            appendPlanItem(
              current,
              createOptimisticBasicPlanItem(
                optimisticItemId,
                kind,
                nextPlanItemSequence(current)
              )
            )
        ),
      };
    },
    onSuccess: (item, _kind, context) => {
      queryClient.setQueryData<PlanItem[]>(
        queryKey,
        (current = EMPTY_PLAN_ITEMS) =>
          replacePlanItemById(current, context.optimisticItemId, item)
      );
      setEditingItemId(item.id);
      toast.success(`${getItemTypeLabel(item)} added.`);
    },
    onError: (error, _kind, context) => {
      restorePlanItemsSnapshot(queryClient, queryKey, context?.snapshot);
      toast.error(toErrorMessage(error, "Something went wrong."));
    },
    onSettled: () => {
      setPendingItemId(null);
      settlePlanItems();
    },
  });

  const addSongMutation = useMutation<
    PlanItem,
    unknown,
    SongCatalogEntry,
    {
      snapshot: PlanItemsOptimisticSnapshot | undefined;
      optimisticItemId: string;
    }
  >({
    mutationFn: async (song: SongCatalogEntry) => {
      if (!serviceTypeId || !planId) {
        throw new Error("A service type and plan must be selected.");
      }

      const songOptionsQuery = createSongOptionsQueryOptions(
        song.id,
        serviceTypeId
      );
      const songOptions =
        queryClient.getQueryData<SongOptionSet | null>(
          songOptionsQuery.queryKey
        ) ?? null;

      const item = await postJson<SerializedPlanItem>("/api/plan-items", {
        service_type_id: serviceTypeId,
        plan_id: planId,
        title: songOptions?.song.title ?? song.title,
        song_id: song.id,
        arrangement_id: songOptions?.suggestedArrangementId ?? undefined,
        key_id: songOptions?.suggestedKeyId ?? undefined,
        selected_layout_id: songOptions?.suggestedLayoutId ?? undefined,
      });

      return hydratePlanItem(item);
    },
    onMutate: async (song) => {
      await queryClient.cancelQueries({ queryKey });

      const optimisticItemId = `optimistic-song-${song.id}-${crypto.randomUUID()}`;
      setPendingSongId(song.id);
      setPendingItemId(optimisticItemId);
      setSongPickerOpen(false);

      return {
        optimisticItemId,
        snapshot: applyPlanItemsOptimisticUpdate(
          queryClient,
          queryKey,
          (current) =>
            appendPlanItem(
              current,
              createOptimisticSongPlanItem(
                optimisticItemId,
                song,
                nextPlanItemSequence(current)
              )
            )
        ),
      };
    },
    onSuccess: (item, _song, context) => {
      queryClient.setQueryData<PlanItem[]>(
        queryKey,
        (current = EMPTY_PLAN_ITEMS) =>
          replacePlanItemById(current, context.optimisticItemId, item)
      );
      setEditingItemId(item.id);
      toast.success("Song added to plan.");
    },
    onError: (error, _song, context) => {
      restorePlanItemsSnapshot(queryClient, queryKey, context?.snapshot);
      toast.error(toErrorMessage(error, "Something went wrong."));
    },
    onSettled: () => {
      setPendingSongId(null);
      setPendingItemId(null);
      settlePlanItems();
    },
  });

  const deleteItemMutation = useMutation<
    void,
    unknown,
    string,
    { snapshot: PlanItemsOptimisticSnapshot | undefined; deletedItemId: string }
  >({
    mutationFn: async (itemId) => {
      if (!serviceTypeId || !planId) {
        throw new Error("A service type and plan must be selected.");
      }

      await deleteJson<{ success: boolean }>(
        buildDeletePlanItemUrl(itemId, serviceTypeId, planId)
      );
    },
    onMutate: async (itemId) => {
      setPendingItemId(itemId);
      await queryClient.cancelQueries({ queryKey });

      return {
        deletedItemId: itemId,
        snapshot: applyPlanItemsOptimisticUpdate(
          queryClient,
          queryKey,
          (current) => removePlanItem(current, itemId)
        ),
      };
    },
    onError: (error, _itemId, context) => {
      restorePlanItemsSnapshot(queryClient, queryKey, context?.snapshot);
      toast.error(toErrorMessage(error, "Something went wrong."));
    },
    onSuccess: (_result, itemId) => {
      if (editingItemId === itemId) {
        setEditingItemId(null);
      }
      toast.success("Item removed.");
    },
    onSettled: () => {
      setPendingItemId(null);
      settlePlanItems();
    },
  });

  const reorderItemsMutation = useMutation<
    void,
    unknown,
    PlanItem[],
    { snapshot: PlanItemsOptimisticSnapshot | undefined }
  >({
    mutationFn: async (nextItems) => {
      if (!serviceTypeId || !planId) {
        throw new Error("A service type and plan must be selected.");
      }

      await postJson<{ success: boolean }>("/api/plan-items/reorder", {
        service_type_id: serviceTypeId,
        plan_id: planId,
        sequence: nextItems.map((item) => item.id),
      });
    },
    onMutate: async (nextItems) => {
      setPendingItemId("reorder");
      await queryClient.cancelQueries({ queryKey });

      return {
        snapshot: applyPlanItemsOptimisticUpdate(
          queryClient,
          queryKey,
          () => nextItems
        ),
      };
    },
    onError: (error, _nextItems, context) => {
      restorePlanItemsSnapshot(queryClient, queryKey, context?.snapshot);
      toast.error(toErrorMessage(error, "Something went wrong."));
    },
    onSuccess: () => {
      toast.success("Plan order saved.");
    },
    onSettled: () => {
      setPendingItemId(null);
      settlePlanItems();
    },
  });

  const updateItemMutation = useMutation<
    PlanItem,
    unknown,
    {
      item: PlanItem;
      draft: DraftState;
      length: number | null;
      optimisticArrangement: PlanItemArrangement | null;
      optimisticKey: PlanItemKey | null;
    },
    { snapshot: PlanItemsOptimisticSnapshot | undefined }
  >({
    mutationFn: async ({
      item,
      draft,
      length,
      optimisticArrangement: _optimisticArrangement,
      optimisticKey: _optimisticKey,
    }: {
      item: PlanItem;
      draft: DraftState;
      length: number | null;
      optimisticArrangement: PlanItemArrangement | null;
      optimisticKey: PlanItemKey | null;
    }) => {
      if (!serviceTypeId || !planId) {
        throw new Error("A service type and plan must be selected.");
      }

      const itemResponse = await patchJson<SerializedPlanItem>(
        `/api/plan-items/${item.id}`,
        {
          service_type_id: serviceTypeId,
          plan_id: planId,
          title: item.song ? item.title : draft.title,
          service_position: draft.servicePosition,
          length: length && length > 0 ? length : null,
          description: draft.description,
          song_id: undefined,
          arrangement_id: draft.arrangementId || undefined,
          key_id: draft.keyId || undefined,
        }
      );

      return hydratePlanItem(itemResponse);
    },
    onMutate: async ({
      item,
      draft,
      length,
      optimisticArrangement,
      optimisticKey,
    }) => {
      setPendingItemId(item.id);
      await queryClient.cancelQueries({ queryKey });

      return {
        snapshot: applyPlanItemsOptimisticUpdate(
          queryClient,
          queryKey,
          (current) =>
            replacePlanItem(
              current,
              applyPlanItemDraft(
                item,
                draft,
                length,
                optimisticArrangement,
                optimisticKey
              )
            )
        ),
      };
    },
    onError: (error, _input, context) => {
      restorePlanItemsSnapshot(queryClient, queryKey, context?.snapshot);
      toast.error(toErrorMessage(error, "Something went wrong."));
    },
    onSuccess: (updatedItem) => {
      queryClient.setQueryData<PlanItem[]>(
        queryKey,
        (current = EMPTY_PLAN_ITEMS) => replacePlanItem(current, updatedItem)
      );
    },
    onSettled: () => {
      setPendingItemId(null);
      settlePlanItems();
    },
  });

  return {
    items,
    isLoading,
    isPlaceholderData,
    editingItemId,
    editingItem: editingItemId
      ? (items.find((item) => item.id === editingItemId) ?? null)
      : null,
    songPickerOpen,
    pendingItemId,
    pendingSongId,
    isCreatingBasicItem: createItemMutation.isPending,
    isSavingItem: updateItemMutation.isPending,
    setEditingItemId,
    setSongPickerOpen,
    createBasicItem: (kind: "header" | "item") =>
      createItemMutation.mutateAsync(kind),
    addSongToPlan: (song: SongCatalogEntry) =>
      addSongMutation.mutateAsync(song),
    deleteItem: (itemId: string) => deleteItemMutation.mutateAsync(itemId),
    reorderItems: (nextItems: PlanItem[]) => {
      if (planItemsHaveSameOrder(items, nextItems)) {
        return Promise.resolve();
      }

      return reorderItemsMutation.mutateAsync(nextItems);
    },
    prefetchItemSongOptions,
    saveItem: (input: {
      item: PlanItem;
      draft: DraftState;
      length: number | null;
      optimisticArrangement: PlanItemArrangement | null;
      optimisticKey: PlanItemKey | null;
    }) => {
      if (!planItemDraftChangesItem(input.item, input.draft, input.length)) {
        return Promise.resolve();
      }

      return updateItemMutation.mutateAsync(input);
    },
  };
}

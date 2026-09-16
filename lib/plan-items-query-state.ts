import type { QueryClient } from "@tanstack/react-query";

import { clearCachedPlanItems } from "@/lib/plan-items-cache";
import type { queryKeys } from "@/lib/query-keys";
import { clearCachedSongOptions } from "@/lib/song-options-cache";
import { clearCachedSongSearch } from "@/lib/song-search-cache";
import type {
  PlanItem,
  PlanItemArrangement,
  PlanItemKey,
  PlanItemServicePosition,
  SongCatalogEntry,
} from "@/lib/types";

export type PlanItemsQueryKey = ReturnType<typeof queryKeys.planItems>;

export const PLAN_ITEMS_MUTATION_RECONCILE_DELAY_MS = 2500;
export const PLAN_SONG_OPTIONS_PREFETCH_LIMIT = 6;

const activeRefetchTimers = new WeakMap<
  QueryClient,
  Map<string, ReturnType<typeof setTimeout>>
>();

export interface PlanItemsOptimisticSnapshot {
  previousItems: PlanItem[];
  nextItems: PlanItem[];
}

const isPlanItemServicePosition = (
  value: string
): value is PlanItemServicePosition =>
  value === "pre" || value === "during" || value === "post";

export const appendPlanItem = (items: PlanItem[], item: PlanItem): PlanItem[] =>
  [...items, item].toSorted((a, b) => a.sequence - b.sequence);

export const nextPlanItemSequence = (items: PlanItem[]): number => {
  let maxSequence = 0;
  for (const item of items) {
    maxSequence = Math.max(maxSequence, item.sequence);
  }
  return maxSequence + 1;
};

export const createOptimisticBasicPlanItem = (
  id: string,
  kind: "header" | "item",
  sequence: number
): PlanItem => ({
  id,
  title: kind === "header" ? "New Header" : "New Item",
  itemType: kind,
  sequence,
  servicePosition: "during",
  length: null,
  description: "",
  htmlDetails: "",
  customArrangementSequence: [],
  song: null,
  arrangement: null,
  key: null,
  layout: null,
});

export const createOptimisticSongPlanItem = (
  id: string,
  song: SongCatalogEntry,
  sequence: number
): PlanItem => ({
  id,
  title: song.title,
  itemType: "song",
  sequence,
  servicePosition: "during",
  length: null,
  description: "",
  htmlDetails: "",
  customArrangementSequence: [],
  song: {
    id: song.id,
    title: song.title,
    author: song.author,
    themes: song.themes,
    lastScheduledAt: song.lastScheduledAt,
  },
  arrangement: null,
  key: null,
  layout: null,
});

export const replacePlanItem = (
  items: PlanItem[],
  updatedItem: PlanItem
): PlanItem[] =>
  items.map((item) => (item.id === updatedItem.id ? updatedItem : item));

export const replacePlanItemById = (
  items: PlanItem[],
  itemId: string,
  updatedItem: PlanItem
): PlanItem[] => items.map((item) => (item.id === itemId ? updatedItem : item));

export const applyPlanItemDraft = (
  item: PlanItem,
  draft: {
    title: string;
    servicePosition: string;
    description: string;
    arrangementId?: string;
    keyId?: string;
  },
  length: number | null,
  arrangement: PlanItemArrangement | null,
  key: PlanItemKey | null
): PlanItem => ({
  ...item,
  title: item.song ? item.title : draft.title,
  servicePosition: isPlanItemServicePosition(draft.servicePosition)
    ? draft.servicePosition
    : item.servicePosition,
  length: length !== null && length > 0 ? length : null,
  description: draft.description,
  arrangement,
  key,
});

export const planItemDraftChangesItem = (
  item: PlanItem,
  draft: {
    title: string;
    servicePosition: string;
    description: string;
    arrangementId?: string;
    keyId?: string;
  },
  length: number | null
): boolean => {
  const normalizedLength = length !== null && length > 0 ? length : null;
  const normalizedArrangementId = draft.arrangementId ?? null;
  const normalizedKeyId = draft.keyId ?? null;

  if (!item.song && draft.title !== item.title) {
    return true;
  }
  if (draft.servicePosition !== item.servicePosition) {
    return true;
  }
  if (normalizedLength !== item.length) {
    return true;
  }
  if (draft.description !== item.description) {
    return true;
  }
  if (item.song && normalizedArrangementId !== (item.arrangement?.id ?? null)) {
    return true;
  }
  if (item.song && normalizedKeyId !== (item.key?.id ?? null)) {
    return true;
  }

  return false;
};

export const removePlanItem = (
  items: PlanItem[],
  itemId: string
): PlanItem[] => {
  const remainingItems: PlanItem[] = [];
  for (const item of items) {
    if (item.id !== itemId) {
      remainingItems.push({ ...item, sequence: remainingItems.length + 1 });
    }
  }
  return remainingItems;
};

export const movePlanItem = (
  items: PlanItem[],
  fromIndex: number,
  toIndex: number
): PlanItem[] => {
  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  if (movedItem === undefined) {
    return items;
  }

  nextItems.splice(toIndex, 0, movedItem);
  return nextItems.map((item, index) => ({
    ...item,
    sequence: index + 1,
  }));
};

export const reorderPlanItems = (
  items: PlanItem[],
  draggedItemId: string,
  targetItemId: string
): PlanItem[] => {
  if (draggedItemId === targetItemId) {
    return items;
  }

  const fromIndex = items.findIndex((item) => item.id === draggedItemId);
  const toIndex = items.findIndex((item) => item.id === targetItemId);
  if (fromIndex === -1 || toIndex === -1) {
    return items;
  }

  return movePlanItem(items, fromIndex, toIndex);
};

export const planItemsHaveSameOrder = (
  currentItems: PlanItem[],
  nextItems: PlanItem[]
): boolean => {
  if (currentItems.length !== nextItems.length) {
    return false;
  }

  return currentItems.every((item, index) => item.id === nextItems[index]?.id);
};

export const collectPlanSongOptionPrefetchIds = (
  items: PlanItem[],
  limit = PLAN_SONG_OPTIONS_PREFETCH_LIMIT
): string[] => {
  if (limit <= 0) {
    return [];
  }

  const songIds = new Set<string>();
  for (const item of items) {
    if (item.song?.id === undefined || item.song.id.length === 0) {
      continue;
    }
    songIds.add(item.song.id);
    if (songIds.size >= limit) {
      break;
    }
  }

  return [...songIds];
};

export const applyPlanItemsOptimisticUpdate = (
  queryClient: QueryClient,
  queryKey: PlanItemsQueryKey,
  update: (items: PlanItem[]) => PlanItem[]
): PlanItemsOptimisticSnapshot => {
  const previousItems = queryClient.getQueryData<PlanItem[]>(queryKey) ?? [];
  const nextItems = update(previousItems);

  queryClient.setQueryData(queryKey, nextItems);
  return {
    previousItems,
    nextItems,
  };
};

export const restorePlanItemsSnapshot = (
  queryClient: QueryClient,
  queryKey: PlanItemsQueryKey,
  snapshot: PlanItemsOptimisticSnapshot | undefined
) => {
  if (!snapshot) {
    return;
  }
  queryClient.setQueryData(queryKey, snapshot.previousItems);
};

export const settlePlanItemsQuery = (
  queryClient: QueryClient,
  queryKey: PlanItemsQueryKey
) => {
  clearCachedPlanItems();
  clearCachedSongOptions();
  clearCachedSongSearch();
  void queryClient.invalidateQueries({ queryKey, refetchType: "inactive" });

  let clientTimers = activeRefetchTimers.get(queryClient);
  if (!clientTimers) {
    clientTimers = new Map();
    activeRefetchTimers.set(queryClient, clientTimers);
  }

  const timerKey = JSON.stringify(queryKey);
  const currentTimer = clientTimers.get(timerKey);
  if (currentTimer) {
    clearTimeout(currentTimer);
  }

  const nextTimer = setTimeout(() => {
    clientTimers.delete(timerKey);
    void queryClient.refetchQueries({ queryKey, type: "active" });
  }, PLAN_ITEMS_MUTATION_RECONCILE_DELAY_MS);
  clientTimers.set(timerKey, nextTimer);
};

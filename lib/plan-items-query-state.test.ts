import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readCachedPlanItems,
  writeCachedPlanItems,
} from "@/lib/plan-items-cache";
import {
  applyPlanItemDraft,
  applyPlanItemsOptimisticUpdate,
  collectPlanSongOptionPrefetchIds,
  createOptimisticBasicPlanItem,
  createOptimisticSongPlanItem,
  nextPlanItemSequence,
  PLAN_ITEMS_MUTATION_RECONCILE_DELAY_MS,
  planItemDraftChangesItem,
  planItemsHaveSameOrder,
  removePlanItem,
  replacePlanItemById,
  reorderPlanItems,
  restorePlanItemsSnapshot,
  settlePlanItemsQuery,
} from "@/lib/plan-items-query-state";
import {
  readCachedSongOptions,
  writeCachedSongOptions,
} from "@/lib/song-options-cache";
import {
  readCachedSongSearch,
  writeCachedSongSearch,
} from "@/lib/song-search-cache";
import type { PlanItem, SongOptionSet } from "@/lib/types";

const createItem = (id: string, sequence: number): PlanItem => ({
  id,
  title: `Item ${sequence}`,
  itemType: "item",
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

const createSongItem = (
  id: string,
  sequence: number,
  songId: string
): PlanItem => ({
  ...createItem(id, sequence),
  itemType: "song",
  song: {
    id: songId,
    title: `Song ${songId}`,
    author: "",
    themes: "",
    lastScheduledAt: null,
  },
});

const songOptions = (): SongOptionSet => ({
  song: {
    id: "song-1",
    title: "Build My Life",
    author: "Pat Barrett",
    themes: "Worship",
    hidden: false,
    lastScheduledAt: new Date("2026-05-17T16:00:00.000Z"),
  },
  arrangements: [],
  layouts: [],
  currentLayout: null,
  suggestedArrangementId: null,
  suggestedKeyId: null,
  suggestedLayoutId: null,
  layoutMode: "unavailable",
});

const installLocalStorageMock = () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      get length() {
        return storage.size;
      },
      getItem: (key: string) => storage.get(key) ?? null,
      key: (index: number) => [...storage.keys()][index] ?? null,
      removeItem: (key: string) => {
        storage.delete(key);
      },
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
  });
};

describe("plan item query state", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("restores the previous cache snapshot after an optimistic reorder rollback", () => {
    const queryClient = new QueryClient();
    const queryKey = ["plan-items", "service-1", "plan-1"] as const;
    const items = [createItem("item-1", 1), createItem("item-2", 2)];

    queryClient.setQueryData(queryKey, items);

    const snapshot = applyPlanItemsOptimisticUpdate(
      queryClient,
      queryKey,
      (current) => reorderPlanItems(current, "item-2", "item-1")
    );

    expect(
      queryClient.getQueryData<PlanItem[]>(queryKey)?.map((item) => item.id)
    ).toStrictEqual(["item-2", "item-1"]);

    restorePlanItemsSnapshot(queryClient, queryKey, snapshot);

    expect(
      queryClient.getQueryData<PlanItem[]>(queryKey)?.map((item) => item.id)
    ).toStrictEqual(["item-1", "item-2"]);
  });

  it("renumbers remaining items after an optimistic delete", () => {
    expect(
      removePlanItem(
        [
          createItem("item-1", 1),
          createItem("item-2", 2),
          createItem("item-3", 3),
        ],
        "item-2"
      )
    ).toMatchObject([
      { id: "item-1", sequence: 1 },
      { id: "item-3", sequence: 2 },
    ]);
  });

  it("detects when a proposed reorder keeps the same item order", () => {
    const current = [createItem("item-1", 1), createItem("item-2", 2)];

    expect(
      planItemsHaveSameOrder(current, [
        { ...createItem("item-1", 1), sequence: 10 },
        { ...createItem("item-2", 2), sequence: 11 },
      ])
    ).toBeTruthy();

    expect(
      planItemsHaveSameOrder(current, [
        createItem("item-2", 1),
        createItem("item-1", 2),
      ])
    ).toBeFalsy();
    expect(
      planItemsHaveSameOrder(current, [createItem("item-1", 1)])
    ).toBeFalsy();
  });

  it("collects a bounded unique list of song option prefetch ids", () => {
    expect(
      collectPlanSongOptionPrefetchIds(
        [
          createItem("item-1", 1),
          createSongItem("song-item-1", 2, "song-1"),
          createSongItem("song-item-2", 3, "song-1"),
          createSongItem("song-item-3", 4, "song-2"),
          createSongItem("song-item-4", 5, "song-3"),
        ],
        2
      )
    ).toStrictEqual(["song-1", "song-2"]);

    expect(
      collectPlanSongOptionPrefetchIds(
        [createSongItem("song-item-1", 1, "song-1")],
        0
      )
    ).toStrictEqual([]);
  });

  it("builds optimistic basic and song items at the next sequence", () => {
    const current = [createItem("item-1", 1), createItem("item-2", 2)];
    const nextSequence = nextPlanItemSequence(current);

    expect(
      createOptimisticBasicPlanItem("temp-header", "header", nextSequence)
    ).toMatchObject({
      id: "temp-header",
      title: "New Header",
      itemType: "header",
      sequence: 3,
    });

    expect(
      createOptimisticSongPlanItem(
        "temp-song",
        {
          id: "song-1",
          title: "Grace Alone",
          author: "The Modern Post",
          themes: "Grace",
          hidden: false,
          lastScheduledAt: null,
        },
        nextSequence
      )
    ).toMatchObject({
      id: "temp-song",
      title: "Grace Alone",
      itemType: "song",
      sequence: 3,
      song: {
        id: "song-1",
        title: "Grace Alone",
      },
    });
  });

  it("replaces temporary items with the server item", () => {
    const current = [
      createItem("item-1", 1),
      createOptimisticBasicPlanItem("temp-item", "item", 2),
    ];
    const serverItem = createItem("server-item", 2);

    expect(
      replacePlanItemById(current, "temp-item", serverItem).map(
        (item) => item.id
      )
    ).toStrictEqual(["item-1", "server-item"]);
  });

  it("applies draft fields for immediate edit feedback", () => {
    expect(
      applyPlanItemDraft(
        createItem("item-1", 1),
        {
          title: "Welcome",
          servicePosition: "pre",
          description: "Before service",
        },
        0,
        null,
        null
      )
    ).toMatchObject({
      title: "Welcome",
      servicePosition: "pre",
      length: null,
      description: "Before service",
    });
  });

  it("detects unchanged plan item drafts so saves can skip no-op PATCH requests", () => {
    const item = {
      ...createItem("song-item-1", 1),
      itemType: "song" as const,
      title: "Build My Life",
      song: {
        id: "song-1",
        title: "Build My Life",
        author: "Pat Barrett",
        themes: "",
        lastScheduledAt: null,
      },
      arrangement: {
        id: "arr-1",
        name: "Default",
        sequence: [],
        length: null,
        archivedAt: null,
      },
      key: {
        id: "key-1",
        name: "A",
        startingKey: null,
        endingKey: null,
      },
      servicePosition: "during" as const,
      length: 300,
      description: "Intro",
    };

    expect(
      planItemDraftChangesItem(
        item,
        {
          title: "Ignored for songs",
          servicePosition: "during",
          description: "Intro",
          arrangementId: "arr-1",
          keyId: "key-1",
        },
        300
      )
    ).toBeFalsy();

    expect(
      planItemDraftChangesItem(
        item,
        {
          title: "Ignored for songs",
          servicePosition: "during",
          description: "Intro",
          arrangementId: "arr-1",
          keyId: "key-2",
        },
        300
      )
    ).toBeTruthy();
  });

  it("settles optimistic plan item mutations without immediately refetching the active list", () => {
    vi.useFakeTimers();
    const queryClient = new QueryClient();
    const queryKey = ["plan-items", "service-1", "plan-1"] as const;
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();
    const refetchQueries = vi
      .spyOn(queryClient, "refetchQueries")
      .mockResolvedValue();

    settlePlanItemsQuery(queryClient, queryKey);
    settlePlanItemsQuery(queryClient, queryKey);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey,
      refetchType: "inactive",
    });
    expect(refetchQueries).not.toHaveBeenCalled();

    vi.advanceTimersByTime(PLAN_ITEMS_MUTATION_RECONCILE_DELAY_MS);

    expect(refetchQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey,
      type: "active",
    });
  });

  it("clears persisted plan-item and song metadata snapshots when optimistic mutations settle", () => {
    installLocalStorageMock();
    const queryClient = new QueryClient();
    const queryKey = ["plan-items", "service-1", "plan-1"] as const;
    writeCachedPlanItems("service-1", "plan-1", [createItem("item-1", 1)]);
    writeCachedSongSearch("service-1", "build", [
      {
        id: "song-1",
        title: "Build My Life",
        author: "Pat Barrett",
        themes: "Worship",
        hidden: false,
        lastScheduledAt: new Date("2026-05-17T16:00:00.000Z"),
      },
    ]);
    writeCachedSongOptions("song-1", "service-1", songOptions());

    settlePlanItemsQuery(queryClient, queryKey);

    expect(readCachedPlanItems("service-1", "plan-1")).toBeUndefined();
    expect(readCachedSongSearch("service-1", "build")).toBeUndefined();
    expect(readCachedSongOptions("song-1", "service-1")).toBeUndefined();
  });
});

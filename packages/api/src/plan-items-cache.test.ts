import {
  clearCachedPlanItems,
  readCachedPlanItems,
  writeCachedPlanItems,
} from "@worship-admin/api/plan-items-cache";
import type { PlanItem } from "@worship-admin/api/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const planItems = (): PlanItem[] => [
  {
    id: "item-1",
    title: "Opening Song",
    itemType: "song",
    sequence: 1,
    servicePosition: "during",
    length: 300,
    description: "Full band",
    htmlDetails: "<p>Full band</p>",
    customArrangementSequence: ["Verse 1", "Chorus"],
    song: {
      id: "song-1",
      title: "Opening Song",
      author: "Author",
      themes: "Praise",
      lastScheduledAt: new Date("2026-05-17T16:00:00.000Z"),
    },
    arrangement: {
      id: "arrangement-1",
      name: "Default",
      sequence: ["Verse 1", "Chorus"],
      length: 300,
      archivedAt: null,
    },
    key: {
      id: "key-1",
      name: "G",
      startingKey: "G",
      endingKey: null,
    },
    layout: {
      id: "layout-1",
      name: "Lyrics & Chords",
    },
  },
  {
    id: "item-2",
    title: "Welcome",
    itemType: "header",
    sequence: 2,
    servicePosition: "during",
    length: null,
    description: "",
    htmlDetails: "",
    customArrangementSequence: [],
    song: null,
    arrangement: null,
    key: null,
    layout: null,
  },
];

describe("plan items cache", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    installLocalStorageMock();
  });

  it("round-trips plan items and restores date fields", () => {
    const savedAt = new Date("2026-05-23T13:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(savedAt);

    writeCachedPlanItems("st-1", "plan-1", planItems());

    const cached = readCachedPlanItems("st-1", "plan-1");

    expect(cached?.savedAt).toBe(savedAt);
    expect(cached?.data).toHaveLength(2);
    expect(cached?.data[0].song?.lastScheduledAt).toBeInstanceOf(Date);
    expect(cached?.data[0].song?.lastScheduledAt?.toISOString()).toBe(
      "2026-05-17T16:00:00.000Z"
    );
  });

  it("does not read a different plan snapshot", () => {
    writeCachedPlanItems("st-1", "plan-1", planItems());

    expect(readCachedPlanItems("st-1", "plan-2")).toBeUndefined();
    expect(readCachedPlanItems("st-2", "plan-1")).toBeUndefined();
  });

  it("ignores invalid cache payloads", () => {
    window.localStorage.setItem(
      "worshipadmin:plan-items:v1:st-1:plan-1",
      JSON.stringify({ savedAt: Date.now(), data: [{ id: "broken" }] })
    );

    expect(readCachedPlanItems("st-1", "plan-1")).toBeUndefined();
  });

  it("clears plan item snapshots without touching unrelated storage", () => {
    writeCachedPlanItems("st-1", "plan-1", planItems());
    writeCachedPlanItems("st-1", "plan-2", planItems());
    window.localStorage.setItem("unrelated", "keep");

    clearCachedPlanItems();

    expect(readCachedPlanItems("st-1", "plan-1")).toBeUndefined();
    expect(readCachedPlanItems("st-1", "plan-2")).toBeUndefined();
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
  });
});

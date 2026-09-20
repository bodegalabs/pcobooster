import {
  clearCachedSongOptions,
  readCachedSongOptions,
  writeCachedSongOptions,
} from "@worship-admin/api/song-options-cache";
import type { SongOptionSet } from "@worship-admin/api/types";
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

const optionSet = (): SongOptionSet => ({
  song: {
    id: "song-1",
    title: "Build My Life",
    author: "Pat Barrett",
    themes: "Worship",
    hidden: false,
    lastScheduledAt: new Date("2026-02-15T00:00:00.000Z"),
  },
  arrangements: [
    {
      id: "arrangement-1",
      name: "Default",
      sequence: ["Verse", "Chorus"],
      length: 300,
      archived: false,
      keys: [
        {
          id: "key-1",
          name: "A",
          startingKey: "A",
          endingKey: "A",
        },
      ],
    },
  ],
  layouts: [],
  currentLayout: null,
  suggestedArrangementId: "arrangement-1",
  suggestedKeyId: "key-1",
  suggestedLayoutId: null,
  layoutMode: "unavailable",
});

describe("song options cache", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    installLocalStorageMock();
  });

  it("round-trips song options and restores date fields", () => {
    const savedAt = new Date("2026-05-23T19:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(savedAt);

    writeCachedSongOptions("song-1", "st-1", optionSet());

    const cached = readCachedSongOptions("song-1", "st-1");

    expect(cached?.savedAt).toBe(savedAt);
    expect(cached?.data.song.title).toBe("Build My Life");
    expect(cached?.data.song.lastScheduledAt).toBeInstanceOf(Date);
    expect(cached?.data.song.lastScheduledAt?.toISOString()).toBe(
      "2026-02-15T00:00:00.000Z"
    );
    expect(cached?.data.arrangements[0].keys[0].name).toBe("A");
  });

  it("does not read a different service type or song snapshot", () => {
    writeCachedSongOptions("song-1", "st-1", optionSet());

    expect(readCachedSongOptions("song-2", "st-1")).toBeUndefined();
    expect(readCachedSongOptions("song-1", "st-2")).toBeUndefined();
  });

  it("ignores invalid cache payloads", () => {
    window.localStorage.setItem(
      "worshipadmin:song-options:v1:st-1:song-1",
      JSON.stringify({ savedAt: Date.now(), data: { song: { id: "song-1" } } })
    );

    expect(readCachedSongOptions("song-1", "st-1")).toBeUndefined();
  });

  it("clears song option snapshots without touching unrelated storage", () => {
    writeCachedSongOptions("song-1", "st-1", optionSet());
    writeCachedSongOptions("song-2", "st-1", optionSet());
    window.localStorage.setItem("unrelated", "keep");

    clearCachedSongOptions();

    expect(readCachedSongOptions("song-1", "st-1")).toBeUndefined();
    expect(readCachedSongOptions("song-2", "st-1")).toBeUndefined();
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearCachedSongSearch,
  normalizeSongSearchQuery,
  readCachedSongSearch,
  writeCachedSongSearch,
} from "@/lib/song-search-cache";
import type { SongCatalogEntry } from "@/lib/types";

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

const songs = (): SongCatalogEntry[] => [
  {
    id: "song-1",
    title: "Build My Life",
    author: "Pat Barrett",
    themes: "Adoration, Worship",
    hidden: false,
    lastScheduledAt: new Date("2026-02-15T00:00:00.000Z"),
    matchScore: 120,
  },
];

describe("song search cache", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    installLocalStorageMock();
  });

  it("normalizes query casing and whitespace", () => {
    expect(normalizeSongSearchQuery("  Build My Life  ")).toBe("build my life");
  });

  it("round-trips song results and restores date fields", () => {
    const savedAt = new Date("2026-05-23T16:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(savedAt);

    writeCachedSongSearch("st-1", "Build My Life", songs());

    const cached = readCachedSongSearch("st-1", " build my life ");

    expect(cached?.savedAt).toBe(savedAt);
    expect(cached?.data[0].title).toBe("Build My Life");
    expect(cached?.data[0].lastScheduledAt).toBeInstanceOf(Date);
    expect(cached?.data[0].lastScheduledAt?.toISOString()).toBe(
      "2026-02-15T00:00:00.000Z"
    );
  });

  it("does not read a different service type or query snapshot", () => {
    writeCachedSongSearch("st-1", "build", songs());

    expect(readCachedSongSearch("st-2", "build")).toBeUndefined();
    expect(readCachedSongSearch("st-1", "life")).toBeUndefined();
  });

  it("ignores invalid cache payloads", () => {
    window.localStorage.setItem(
      "worshipadmin:song-search:v1:st-1:build",
      JSON.stringify({ savedAt: Date.now(), data: [{ id: "song-1" }] })
    );

    expect(readCachedSongSearch("st-1", "build")).toBeUndefined();
  });

  it("clears song search snapshots without touching unrelated storage", () => {
    writeCachedSongSearch("st-1", "build", songs());
    writeCachedSongSearch("st-1", "life", songs());
    window.localStorage.setItem("unrelated", "keep");

    clearCachedSongSearch();

    expect(readCachedSongSearch("st-1", "build")).toBeUndefined();
    expect(readCachedSongSearch("st-1", "life")).toBeUndefined();
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
  });
});

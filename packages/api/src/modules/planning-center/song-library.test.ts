import {
  getSongLibrary,
  toSongLibraryEntries,
} from "@pcobooster/api/modules/planning-center/song-library";
import { DEFAULT_CATALOG_MAX_PAGES } from "@pcobooster/api/planning-center/services/songs-service";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const song = (
  id: string,
  attributes: Record<string, string | boolean | null> = {}
): PCResource => ({
  id,
  type: "Song",
  attributes: {
    title: `Song ${id}`,
    author: "",
    themes: "",
    hidden: false,
    ...attributes,
  },
});

describe(toSongLibraryEntries, () => {
  it("keeps visible songs in catalog order with their dates", () => {
    const entries = toSongLibraryEntries([
      song("a", {
        last_scheduled_at: "2026-08-01T00:00:00Z",
        created_at: "2020-01-01T00:00:00Z",
      }),
      song("hidden", { hidden: true }),
      song("b", { last_scheduled_at: null, created_at: "not a date" }),
    ]);

    expect(entries).toStrictEqual([
      {
        id: "a",
        title: "Song a",
        author: "",
        themes: "",
        lastScheduledAt: new Date("2026-08-01T00:00:00Z"),
        createdAt: new Date("2020-01-01T00:00:00Z"),
      },
      {
        id: "b",
        title: "Song b",
        author: "",
        themes: "",
        lastScheduledAt: null,
        createdAt: null,
      },
    ]);
  });
});

describe(getSongLibrary, () => {
  it("reads the cached catalog for the caller's scope", async () => {
    const getSongsCatalogCached = vi.fn<
      (cacheKey: string) => Effect.Effect<PCResource[]>
    >(() => Effect.succeed([song("a")]));

    const library = await Effect.runPromise(
      getSongLibrary({
        cacheScope: "scope-1",
        songsService: { getSongsCatalogCached },
      })
    );

    expect(getSongsCatalogCached).toHaveBeenCalledWith("scope-1");
    expect(library.songs.map((entry) => entry.id)).toStrictEqual(["a"]);
    expect(library.truncated).toBeFalsy();
  });

  it("reports a catalog cut off at its page limit, counting hidden songs", async () => {
    const catalog = Array.from(
      { length: DEFAULT_CATALOG_MAX_PAGES * 100 },
      (_, index) => song(String(index), { hidden: index % 2 === 0 })
    );

    const library = await Effect.runPromise(
      getSongLibrary({
        cacheScope: "scope-1",
        songsService: { getSongsCatalogCached: () => Effect.succeed(catalog) },
      })
    );

    expect(library.truncated).toBeTruthy();
    expect(library.songs).toHaveLength(catalog.length / 2);
  });
});

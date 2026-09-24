import { searchSongs } from "@pcobooster/api/modules/planning-center/search-songs";
import type {
  SongCatalogReader,
  SongSearchResultCache,
} from "@pcobooster/api/modules/planning-center/search-songs";
import type { SuccessOf } from "@pcobooster/api/testing/effect";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const createFixture = () => {
  const getSongsCatalogCachedMock =
    vi.fn<SongCatalogReader["getSongsCatalogCached"]>();
  const songCatalogReader = {
    getSongsCatalogCached: getSongsCatalogCachedMock,
  } satisfies SongCatalogReader;
  const resultCache: SongSearchResultCache = new Map();
  return { getSongsCatalogCachedMock, songCatalogReader, resultCache };
};

describe(searchSongs, () => {
  it("keeps fuzzy relevance first and orders ties by title", async () => {
    const { getSongsCatalogCachedMock, songCatalogReader, resultCache } =
      createFixture();
    getSongsCatalogCachedMock.mockReturnValue(
      Effect.succeed<SuccessOf<typeof getSongsCatalogCachedMock>>([
        {
          id: "song-1",
          type: "Song",
          attributes: {
            title: "House of the Lord",
            author: "Phil Wickham",
            hidden: false,
            last_scheduled_at: "2026-02-01T00:00:00Z",
          },
        },
        {
          id: "song-2",
          type: "Song",
          attributes: {
            title: "Lord I Need You",
            author: "Matt Maher",
            hidden: false,
            last_scheduled_at: "2026-03-01T00:00:00Z",
          },
        },
        {
          id: "song-4",
          type: "Song",
          attributes: {
            title: "Lord I Lift Your Name on High",
            author: "Another Writer",
            hidden: false,
            last_scheduled_at: "2026-03-01T00:00:00Z",
          },
        },
        {
          id: "song-3",
          type: "Song",
          attributes: {
            title: "Archived Song",
            hidden: true,
          },
        },
      ])
    );

    const songs = await Effect.runPromise(
      searchSongs("account-1", "lord", songCatalogReader, resultCache)
    );

    expect(songs.map((song) => song.id)).toStrictEqual([
      "song-4",
      "song-2",
      "song-1",
    ]);
    expect(songs.some((song) => song.id === "song-3")).toBeFalsy();
    expect(getSongsCatalogCachedMock).toHaveBeenCalledWith("account-1");
  });

  it("caches normalized result sets and returns mutation-safe copies", async () => {
    const { getSongsCatalogCachedMock, songCatalogReader, resultCache } =
      createFixture();
    getSongsCatalogCachedMock.mockReturnValue(
      Effect.succeed<SuccessOf<typeof getSongsCatalogCachedMock>>([
        {
          id: "song-1",
          type: "Song",
          attributes: {
            title: "Build My Life",
            hidden: false,
          },
        },
      ])
    );

    const first = await Effect.runPromise(
      searchSongs("account-2", "  BUILD  ", songCatalogReader, resultCache)
    );
    first[0].title = "Changed locally";
    const second = await Effect.runPromise(
      searchSongs("account-2", "build", songCatalogReader, resultCache)
    );

    expect(getSongsCatalogCachedMock).toHaveBeenCalledOnce();
    expect(second).toStrictEqual([
      expect.objectContaining({
        id: "song-1",
        title: "Build My Life",
      }),
    ]);
  });
});

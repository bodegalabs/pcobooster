import { searchSongs } from "@pcobooster/api/modules/planning-center/search-songs";
import type { SongCatalogReader } from "@pcobooster/api/modules/planning-center/search-songs";
import { describe, expect, it, vi } from "vitest";

const createFixture = () => {
  const getSongsCatalogCachedMock =
    vi.fn<SongCatalogReader["getSongsCatalogCached"]>();
  const songCatalogReader = {
    getSongsCatalogCached: getSongsCatalogCachedMock,
  } satisfies SongCatalogReader;
  return { getSongsCatalogCachedMock, songCatalogReader };
};

describe(searchSongs, () => {
  it("keeps fuzzy relevance first and orders ties by title", async () => {
    const { getSongsCatalogCachedMock, songCatalogReader } = createFixture();
    getSongsCatalogCachedMock.mockResolvedValue([
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
    ]);

    const songs = await searchSongs(
      "account-1",
      "service-1",
      "lord",
      songCatalogReader
    );

    expect(songs.map((song) => song.id)).toStrictEqual([
      "song-4",
      "song-2",
      "song-1",
    ]);
    expect(songs.some((song) => song.id === "song-3")).toBeFalsy();
    expect(getSongsCatalogCachedMock).toHaveBeenCalledWith(
      "account-1:service-1",
      undefined,
      undefined
    );
  });

  it("caches normalized result sets and returns mutation-safe copies", async () => {
    const { getSongsCatalogCachedMock, songCatalogReader } = createFixture();
    getSongsCatalogCachedMock.mockResolvedValue([
      {
        id: "song-1",
        type: "Song",
        attributes: {
          title: "Build My Life",
          hidden: false,
        },
      },
    ]);

    const first = await searchSongs(
      "account-2",
      "service-1",
      "  BUILD  ",
      songCatalogReader
    );
    first[0].title = "Changed locally";
    const second = await searchSongs(
      "account-2",
      "service-1",
      "build",
      songCatalogReader
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

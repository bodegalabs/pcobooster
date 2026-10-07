import { describe, expect, it } from "vitest";

import {
  indexLetter,
  matchRecentSongs,
  monthsBefore,
  parseSongLibraryFilter,
  parseSongLibrarySort,
  selectSongLibrary,
  songLibraryCutoff,
  songLibraryListing,
  songLibrarySummary,
} from "./library";
import type { SongLibraryEntry, SongLibraryView } from "./library";

const now = new Date("2026-10-07T18:00:00.000Z");
const zone = "America/Los_Angeles";

const song = (
  id: string,
  title: string,
  lastScheduledAt: string | null,
  createdAt: string | null = "2020-01-01T00:00:00.000Z",
  extra: Partial<SongLibraryEntry> = {}
): SongLibraryEntry => ({
  id,
  title,
  author: "",
  themes: "",
  lastScheduledAt: lastScheduledAt === null ? null : new Date(lastScheduledAt),
  createdAt: createdAt === null ? null : new Date(createdAt),
  ...extra,
});

const songs = [
  song("1", "Bright City", "2026-10-01T02:00:00.000Z", "2023-03-26T17:30:00Z", {
    author: "Ruth Okafor",
    themes: "Heaven, Joy",
  }),
  song("2", "Évergreen", "2025-09-13T16:00:00.000Z"),
  song("3", "A New Morning", null, "2026-09-20T17:30:00.000Z"),
  song("4", "Old Hymn", null, "2019-01-01T00:00:00.000Z"),
  song("5", "ancient words", "2024-01-07T16:00:00.000Z"),
  song("6", "10,000 Reasons", "2026-11-01T17:00:00.000Z"),
];

const view = (overrides: Partial<SongLibraryView> = {}): SongLibraryView => ({
  filter: "all",
  sort: "recent",
  query: "",
  ...overrides,
});

const ids = (entries: readonly { id: string }[]) =>
  entries.map((entry) => entry.id);

describe("song library selection", () => {
  it("sorts by latest plan with upcoming plans first and never-scheduled songs last", () => {
    expect(ids(selectSongLibrary(songs, view(), now))).toStrictEqual([
      "6",
      "1",
      "2",
      "5",
      "3",
      "4",
    ]);
  });

  it("sorts longest unused with never-scheduled songs first, oldest added first", () => {
    expect(
      ids(selectSongLibrary(songs, view({ sort: "longest" }), now))
    ).toStrictEqual(["4", "3", "5", "2", "1", "6"]);
  });

  it("keeps a recently added never-scheduled song out of the unused filters", () => {
    expect(
      ids(selectSongLibrary(songs, view({ filter: "unused-12" }), now))
    ).toStrictEqual(["2", "5", "4"]);
    expect(
      ids(selectSongLibrary(songs, view({ filter: "never" }), now))
    ).toStrictEqual(["3", "4"]);
  });

  it("ranks search matches by relevance instead of the sort, across writers and themes", () => {
    expect(
      ids(selectSongLibrary(songs, view({ query: " joy " }), now))
    ).toStrictEqual(["1"]);
    expect(
      ids(selectSongLibrary(songs, view({ query: "okafor" }), now))
    ).toStrictEqual(["1"]);
    expect(selectSongLibrary(songs, view({ query: "zzz" }), now)).toStrictEqual(
      []
    );
  });

  it("clamps month arithmetic to the target month's last day in UTC", () => {
    expect(
      monthsBefore(new Date("2026-03-31T12:00:00.000Z"), 1).toISOString()
    ).toBe("2026-02-28T12:00:00.000Z");
    expect(songLibraryCutoff("all", now)).toBeNull();
    expect(songLibraryCutoff("unused-6", now)?.toISOString()).toBe(
      "2026-04-07T18:00:00.000Z"
    );
  });

  it("falls back to the defaults for unknown stored filter and sort values", () => {
    expect(parseSongLibraryFilter("unused-24")).toBe("unused-24");
    expect(parseSongLibraryFilter("bogus")).toBe("all");
    expect(parseSongLibrarySort(null)).toBe("recent");
  });
});

describe("song library listing", () => {
  const recents = [
    { id: "9", title: "Just Added", author: "Lena Ortiz" },
    { id: "1", title: "Bright City", author: "Ruth Okafor" },
  ];

  it("shows recently opened songs with the library's dates, and undated rows it lacks", () => {
    const listing = songLibraryListing({ songs, recents, view: view(), now });
    expect(listing.recent.map((row) => [row.id, row.dated])).toStrictEqual([
      ["9", false],
      ["1", true],
    ]);
    expect(listing.sections).toHaveLength(1);
    expect(listing.sections[0]?.letter).toBeNull();
  });

  it("adds just-added recents ahead of a search's library matches only for All songs", () => {
    const searching = songLibraryListing({
      songs,
      recents,
      view: view({ query: "just" }),
      now,
    });
    expect(searching.recent).toStrictEqual([]);
    expect(ids(searching.sections[0]?.rows ?? [])).toStrictEqual(["9"]);
    expect(searching.listedCount).toBe(0);
    const tidying = songLibraryListing({
      songs,
      recents,
      view: view({ query: "just", filter: "never" }),
      now,
    });
    expect(tidying.sections).toStrictEqual([]);
  });

  it("groups by folded first letter when sorted by title, with # for digits", () => {
    const listing = songLibraryListing({
      songs,
      recents: [],
      view: view({ sort: "title" }),
      now,
    });
    expect(
      listing.sections.map((section) => [section.letter, ids(section.rows)])
    ).toStrictEqual([
      ["#", ["6"]],
      ["A", ["3", "5"]],
      ["B", ["1"]],
      ["E", ["2"]],
      ["O", ["4"]],
    ]);
    expect(indexLetter("")).toBe("#");
    expect(indexLetter("ñandú")).toBe("N");
  });

  it("matches recents on every word of the query", () => {
    expect(ids(matchRecentSongs(recents, "lena added"))).toStrictEqual(["9"]);
    expect(ids(matchRecentSongs(recents, ""))).toStrictEqual(["9", "1"]);
  });
});

describe("song library summary", () => {
  it("counts the library, or what a tidy-up filter found, labeled in the org zone", () => {
    expect(
      songLibrarySummary({ songs, view: view(), now, timeZone: zone })
    ).toBe("6 songs");
    expect(
      songLibrarySummary({
        songs,
        view: view({ filter: "never" }),
        now,
        timeZone: zone,
      })
    ).toBe("2 songs have never been scheduled.");
    expect(
      songLibrarySummary({
        songs,
        view: view({ filter: "unused-12" }),
        now,
        timeZone: zone,
      })
    ).toBe(
      "3 of 6 songs not used since Oct 7, 2025, including 1 never scheduled."
    );
    expect(
      songLibrarySummary({
        songs,
        view: view({ query: "a" }),
        now,
        timeZone: zone,
      })
    ).toBeNull();
  });

  it("labels the cutoff on the org's calendar day, not UTC's", () => {
    const lateEvening = new Date("2026-10-08T03:30:00.000Z");
    expect(
      songLibrarySummary({
        songs: [],
        view: view({ filter: "unused-6" }),
        now: lateEvening,
        timeZone: zone,
      })
    ).toBe("0 of 0 songs not used since Apr 7, 2026.");
  });
});

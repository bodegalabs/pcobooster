import type { SongLibraryEntry } from "@pcobooster/contracts/http/songs";
import { describe, expect, it } from "vitest";

import {
  monthsBefore,
  parseSongLibraryFilter,
  parseSongLibrarySort,
  selectSongLibrary,
} from "@/lib/songs-index";

const NOW = new Date("2026-10-01T18:00:00.000Z");

const song = (
  id: string,
  lastScheduledAt: string | null,
  createdAt: string | null = "2020-01-01T00:00:00Z",
  extra: Partial<SongLibraryEntry> = {}
): SongLibraryEntry => ({
  id,
  title: `Song ${id}`,
  author: "",
  themes: "",
  lastScheduledAt: lastScheduledAt === null ? null : new Date(lastScheduledAt),
  createdAt: createdAt === null ? null : new Date(createdAt),
  ...extra,
});

const library = [
  song("recent", "2026-09-27T00:00:00Z"),
  song("old", "2024-01-07T00:00:00Z"),
  song("older", "2021-03-14T00:00:00Z"),
  song("never-old", null, "2019-05-01T00:00:00Z"),
  song("never-new", null, "2026-09-01T00:00:00Z"),
  song("undated", null, null),
];

const ids = (songs: readonly SongLibraryEntry[]) =>
  songs.map((entry) => entry.id);

describe(monthsBefore, () => {
  it("moves back whole calendar months", () => {
    expect(monthsBefore(NOW, 12).toISOString()).toBe(
      "2025-10-01T18:00:00.000Z"
    );
  });

  it("clamps to the last day of a shorter month", () => {
    expect(
      monthsBefore(new Date("2026-05-31T12:00:00.000Z"), 3).toISOString()
    ).toBe("2026-02-28T12:00:00.000Z");
  });
});

describe(selectSongLibrary, () => {
  it("lists every song, most recently used first and never-scheduled last", () => {
    expect(
      ids(
        selectSongLibrary(
          library,
          { filter: "all", sort: "recent", query: "" },
          NOW
        )
      )
    ).toStrictEqual([
      "recent",
      "old",
      "older",
      "never-new",
      "never-old",
      "undated",
    ]);
  });

  it("lists songs unused for a year, skipping never-scheduled songs added since", () => {
    expect(
      ids(
        selectSongLibrary(
          library,
          { filter: "unused-12", sort: "longest", query: "" },
          NOW
        )
      )
    ).toStrictEqual(["undated", "never-old", "older", "old"]);
  });

  it("lists every never-scheduled song for the never filter", () => {
    expect(
      ids(
        selectSongLibrary(
          library,
          { filter: "never", sort: "title", query: "" },
          NOW
        )
      )
    ).toStrictEqual(["never-new", "never-old", "undated"]);
  });

  it("ranks a search by relevance within the filter", () => {
    const songs = [
      song("a", "2026-09-27T00:00:00Z", null, {
        title: "Goodness of God",
        author: "Jenn Johnson",
      }),
      song("b", "2020-01-01T00:00:00Z", null, { title: "Johnson Hymn" }),
      song("c", "2020-01-01T00:00:00Z", null, { title: "Way Maker" }),
    ];

    expect(
      ids(
        selectSongLibrary(
          songs,
          { filter: "all", sort: "recent", query: "johnson" },
          NOW
        )
      )
    ).toStrictEqual(["b", "a"]);
    expect(
      ids(
        selectSongLibrary(
          songs,
          { filter: "unused-12", sort: "recent", query: "johnson" },
          NOW
        )
      )
    ).toStrictEqual(["b"]);
  });
});

describe(parseSongLibraryFilter, () => {
  it("falls back to every song for unknown values", () => {
    expect(parseSongLibraryFilter("unused-6")).toBe("unused-6");
    expect(parseSongLibraryFilter("stale")).toBe("all");
  });
});

describe(parseSongLibrarySort, () => {
  it("falls back to recently used for unknown values", () => {
    expect(parseSongLibrarySort("title")).toBe("title");
    expect(parseSongLibrarySort("popular")).toBe("recent");
  });
});

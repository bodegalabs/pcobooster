import { describe, expect, it } from "vitest";

import {
  formatSongLastScheduled,
  hydrateSongCatalogEntry,
  hydrateSongOptionSet,
  parseOptionalDate,
} from "@/lib/song-catalog-client";

describe("song catalog client hydration", () => {
  it("parses ISO date strings for song catalog entries", () => {
    const hydrated = hydrateSongCatalogEntry({
      id: "song-1",
      title: "Build My Life",
      author: "Pat Barrett",
      themes: "Worship",
      hidden: false,
      lastScheduledAt: "2026-02-15T00:00:00.000Z",
      matchScore: 120,
    });

    expect(hydrated.lastScheduledAt).toBeInstanceOf(Date);
    expect(hydrated.lastScheduledAt?.toISOString()).toBe(
      "2026-02-15T00:00:00.000Z"
    );
  });

  it("drops invalid serialized dates instead of keeping broken values", () => {
    expect(parseOptionalDate("not-a-date")).toBeNull();
  });

  it("hydrates nested song data in song option payloads", () => {
    const hydrated = hydrateSongOptionSet({
      song: {
        id: "song-1",
        title: "Build My Life",
        author: "Pat Barrett",
        themes: "Worship",
        hidden: false,
        lastScheduledAt: "2026-02-15T00:00:00.000Z",
      },
      arrangements: [],
      layouts: [],
      currentLayout: null,
      suggestedArrangementId: null,
      suggestedKeyId: null,
      suggestedLayoutId: null,
      layoutMode: "unavailable",
    });

    expect(hydrated.song.lastScheduledAt).toBeInstanceOf(Date);
    expect(hydrated.song.lastScheduledAt?.toISOString()).toBe(
      "2026-02-15T00:00:00.000Z"
    );
  });
});

describe(formatSongLastScheduled, () => {
  it("labels the org calendar day a song was last scheduled", () => {
    expect(
      formatSongLastScheduled(
        // Saturday December 31, 2026, 7:00 PM Pacific; January 1, 2027 in UTC.
        "2027-01-01T03:00:00.000Z",
        "America/Los_Angeles"
      )
    ).toBe("Dec 31, 2026");
  });

  it("returns null when the song has no usable date", () => {
    expect(
      [null, "", "not a date"].map((value) =>
        formatSongLastScheduled(value, "America/Los_Angeles")
      )
    ).toStrictEqual([null, null, null]);
  });
});

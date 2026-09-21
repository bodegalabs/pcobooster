import {
  hydrateSongCatalogEntry,
  hydrateSongOptionSet,
  parseOptionalDate,
} from "@worship-admin/api/song-catalog-client";
import { describe, expect, it } from "vitest";

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

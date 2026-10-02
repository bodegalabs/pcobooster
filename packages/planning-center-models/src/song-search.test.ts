import { scoreSongSearch } from "@pcobooster/planning-center-models/song-search";
import { describe, expect, it } from "vitest";

const NOW = new Date("2026-10-01T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const song = (title: string, lastScheduledAt: Date | null = null) => ({
  title,
  author: "",
  themes: "",
  lastScheduledAt,
});

describe(scoreSongSearch, () => {
  it("needs every word of the search to match", () => {
    expect(scoreSongSearch(song("Always"), "way maker", NOW)).toBe(0);
    expect(
      scoreSongSearch(song("Way Maker"), "way maker", NOW)
    ).toBeGreaterThan(0);
  });

  it("doesn't count a recently sung song that doesn't match", () => {
    const recently = new Date(NOW.getTime() - 7 * DAY_MS);

    expect(scoreSongSearch(song("Above All", recently), "egypt", NOW)).toBe(0);
    expect(
      scoreSongSearch(song("Egypt", recently), "egypt", NOW)
    ).toBeGreaterThan(scoreSongSearch(song("Egypt"), "egypt", NOW));
  });

  it("matches authors and themes, ranking title matches first", () => {
    const byAuthor = { ...song("Goodness of God"), author: "Jenn Johnson" };
    const byTitle = song("Johnson's Hymn");

    expect(scoreSongSearch(byAuthor, "johnson", NOW)).toBeGreaterThan(0);
    expect(scoreSongSearch(byTitle, "johnson", NOW)).toBeGreaterThan(
      scoreSongSearch(byAuthor, "johnson", NOW)
    );
    expect(
      scoreSongSearch({ ...song("Abide"), themes: "Easter" }, "easter", NOW)
    ).toBeGreaterThan(0);
  });
});

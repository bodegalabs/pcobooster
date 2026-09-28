import { suggestFromCatalog } from "@pcobooster/api/modules/planning-center/song-suggestions";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

const song = (
  id: string,
  lastScheduledAt: string | null,
  hidden = false
): PCResource => ({
  id,
  type: "Song",
  attributes: {
    title: id,
    author: "",
    hidden,
    last_scheduled_at: lastScheduledAt,
  },
});

const now = new Date("2026-09-28T12:00:00Z");

describe(suggestFromCatalog, () => {
  it("lists recent songs newest first and resting songs after the window", () => {
    const suggestions = suggestFromCatalog(
      [
        song("last-month", "2026-08-30T17:00:00Z"),
        song("last-week", "2026-09-20T17:00:00Z"),
        song("last-spring", "2026-04-12T17:00:00Z"),
        song("two-years-ago", "2024-09-01T17:00:00Z"),
      ],
      now
    );

    expect(suggestions.recentlyPlayed.map((entry) => entry.id)).toStrictEqual([
      "last-week",
      "last-month",
    ]);
    expect(suggestions.resting.map((entry) => entry.id)).toStrictEqual([
      "last-spring",
      "two-years-ago",
    ]);
  });

  it("leaves out hidden, never-played, and future-scheduled songs", () => {
    const suggestions = suggestFromCatalog(
      [
        song("hidden", "2026-09-20T17:00:00Z", true),
        song("never", null),
        song("next-week", "2026-10-04T17:00:00Z"),
      ],
      now
    );

    expect(suggestions).toStrictEqual({ recentlyPlayed: [], resting: [] });
  });
});

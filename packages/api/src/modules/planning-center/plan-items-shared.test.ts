import {
  normalizeArrangementOption,
  scoreSongSearch,
} from "@pcobooster/api/modules/planning-center/plan-items-shared";
import { describe, expect, it } from "vitest";

describe(normalizeArrangementOption, () => {
  it("reads tempo and meter", () => {
    const arrangement = normalizeArrangementOption(
      {
        id: "arr-1",
        type: "Arrangement",
        attributes: {
          name: "Passion",
          bpm: 135,
          meter: "6/8",
          length: 333,
        },
      },
      []
    );

    expect(arrangement).toMatchObject({
      bpm: 135,
      meter: "6/8",
      length: 333,
    });
  });

  it("leaves a missing tempo and meter empty", () => {
    const arrangement = normalizeArrangementOption(
      { id: "arr-2", type: "Arrangement", attributes: { name: "Default" } },
      []
    );

    expect(arrangement.bpm).toBeNull();
    expect(arrangement.meter).toBeNull();
  });
});

const catalogSong = (title: string, lastScheduledAt: Date | null) => ({
  id: title,
  title,
  author: "",
  themes: "",
  hidden: false,
  lastScheduledAt,
});

describe(scoreSongSearch, () => {
  it("needs every word of the search to match", () => {
    expect(scoreSongSearch(catalogSong("Always", null), "way maker")).toBe(0);
    expect(
      scoreSongSearch(catalogSong("Way Maker", null), "way maker")
    ).toBeGreaterThan(0);
  });

  it("doesn't count a recently sung song that doesn't match", () => {
    const recently = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    expect(scoreSongSearch(catalogSong("Above All", recently), "egypt")).toBe(
      0
    );
    expect(
      scoreSongSearch(catalogSong("Egypt", recently), "egypt")
    ).toBeGreaterThan(scoreSongSearch(catalogSong("Egypt", null), "egypt"));
  });
});

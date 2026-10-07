import { describe, expect, it } from "vitest";

import { historyDateLabel, previewFactRows } from "./song-facts";

const zone = "America/Los_Angeles";

describe("song facts", () => {
  it("dates history in the org zone, with the year only outside the plan's year", () => {
    const planDate = new Date("2027-01-03T17:00:00Z");
    expect([
      historyDateLabel(new Date("2027-01-01T05:00:00Z"), planDate, zone),
      historyDateLabel(new Date("2026-12-27T17:00:00Z"), planDate, zone),
    ]).toStrictEqual(["Dec 31, 2026", "Dec 27, 2026"]);
    expect(
      historyDateLabel(new Date("2027-02-07T17:00:00Z"), planDate, zone)
    ).toBe("Feb 7");
  });

  it("lists keys, tempos and how the key meets the song before, as facts", () => {
    expect(
      previewFactRows(
        {
          summary: null,
          keys: ["G", "Bb"],
          tempos: ["72 bpm · 4/4"],
          keyChange: { key: "G", change: "up a whole step" },
        },
        { title: "Opener", endKey: "F" }
      )
    ).toStrictEqual({
      keys: ["G", "B♭"],
      rows: [
        { label: "Tempo", value: "72 bpm · 4/4" },
        { label: "After F", value: "G, up a whole step" },
      ],
      empty: false,
    });
    expect(
      previewFactRows(
        { summary: null, keys: [], tempos: [], keyChange: null },
        null
      )
    ).toStrictEqual({ keys: [], rows: [], empty: true });
  });
});

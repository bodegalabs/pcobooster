import {
  buildPlanInsights,
  daysSinceRecentPlay,
  formatPlayedAgo,
  keyTransitions,
} from "@pcobooster/planning-center-models/plan-set-insights";
import type { PlanItem } from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

const item = (
  id: string,
  itemType: PlanItem["itemType"],
  keys: { start?: string; end?: string } = {},
  lastScheduledAt: Date | null = null
): PlanItem => ({
  id,
  title: id,
  itemType,
  sequence: 0,
  servicePosition: "during",
  length: null,
  description: "",
  htmlDetails: "",
  customArrangementSequence: [],
  song:
    itemType === "song"
      ? { id: `song-${id}`, title: id, author: "", themes: "", lastScheduledAt }
      : null,
  arrangement: null,
  key:
    keys.start === undefined
      ? null
      : {
          id: `key-${id}`,
          name: keys.start,
          startingKey: keys.start,
          endingKey: keys.end ?? null,
        },
  layout: null,
});

describe(keyTransitions, () => {
  it("rates each change from one song's ending key to the next song's key", () => {
    const transitions = keyTransitions([
      item("egypt", "song", { start: "Eb" }),
      item("prayer", "item"),
      item("blood", "song", { start: "Bb", end: "C" }),
      item("cross", "song", { start: "F#" }),
    ]);

    expect(
      transitions.map(({ from, to, level, description }) => ({
        from,
        to,
        level,
        description,
      }))
    ).toStrictEqual([
      {
        from: "Eb",
        to: "Bb",
        level: "smooth",
        description: "Closely related key",
      },
      {
        from: "C",
        to: "F#",
        level: "rough",
        description: "Tritone apart: no shared notes",
      },
    ]);
  });

  it("lets a timed prayer of a minute or more cover a rough change", () => {
    const prayer = { ...item("prayer", "item"), length: 90 };
    const [transition] = keyTransitions([
      item("a", "song", { start: "Bb" }),
      prayer,
      item("b", "song", { start: "E" }),
    ]);

    expect(transition?.level).toBe("smooth");
    expect(transition?.bridgedBy).toBe("prayer");
  });

  it("starts over at each header and skips songs without a key", () => {
    expect(
      keyTransitions([
        item("a", "song", { start: "G" }),
        item("set", "header"),
        item("b", "song", { start: "C#" }),
        item("c", "song"),
        item("d", "song", { start: "D" }),
      ])
    ).toStrictEqual([]);
  });
});

describe(daysSinceRecentPlay, () => {
  const planDate = new Date("2026-10-04T17:00:00Z");

  it("counts plays in the weeks before the plan", () => {
    expect(
      daysSinceRecentPlay(
        item("a", "song", {}, new Date("2026-09-20T17:00:00Z")),
        planDate
      )
    ).toBe(14);
  });

  it("ignores older plays, plays on the plan's date or later, and non-songs", () => {
    expect(
      daysSinceRecentPlay(
        item("a", "song", {}, new Date("2026-08-01T17:00:00Z")),
        planDate
      )
    ).toBeNull();
    expect(
      daysSinceRecentPlay(item("b", "song", {}, planDate), planDate)
    ).toBeNull();
    expect(daysSinceRecentPlay(item("c", "item"), planDate)).toBeNull();
    expect(
      daysSinceRecentPlay(
        item("d", "song", {}, new Date("2026-09-20T17:00:00Z")),
        null
      )
    ).toBeNull();
  });
});

describe(formatPlayedAgo, () => {
  const now = new Date("2026-09-28T12:00:00Z");

  it("rounds down to weeks, then months, then years", () => {
    expect(formatPlayedAgo(new Date("2026-09-25T12:00:00Z"), now)).toBe(
      "This week"
    );
    expect(formatPlayedAgo(new Date("2026-09-07T12:00:00Z"), now)).toBe(
      "3 wk ago"
    );
    expect(formatPlayedAgo(new Date("2026-04-01T12:00:00Z"), now)).toBe(
      "6 mo ago"
    );
    expect(formatPlayedAgo(new Date("2024-06-01T12:00:00Z"), now)).toBe(
      "2 yr ago"
    );
  });
});

describe(buildPlanInsights, () => {
  it("maps key changes and recent repeats", () => {
    const insights = buildPlanInsights(
      [
        item("a", "song", { start: "C" }, new Date("2026-09-27T17:00:00Z")),
        item("b", "song", { start: "F#" }),
        item("c", "song", { start: "G" }),
      ],
      new Date("2026-10-04T17:00:00Z")
    );

    expect([...insights.transitions.keys()]).toStrictEqual(["b", "c"]);
    expect([...insights.recentPlays]).toStrictEqual([["a", 7]]);
  });
});

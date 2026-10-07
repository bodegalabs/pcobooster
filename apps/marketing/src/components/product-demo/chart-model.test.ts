import { describe, expect, it } from "vitest";

import {
  chartLines,
  chartSections,
  highlightRuns,
  keysInMode,
  transposeChart,
} from "./chart-model";

const chart = [
  "INTRO",
  "G / / / | C / / / |",
  "",
  "VERSE 1",
  "[G]Morning [D/F#]light",
].join("\n");

describe(transposeChart, () => {
  it("rewrites inline chords and chord rows, spelling flats in a flat key", () => {
    expect(transposeChart(chart, "G", "Bb")).toBe(
      [
        "INTRO",
        "Bb / / / | Eb / / / |",
        "",
        "VERSE 1",
        "[Bb]Morning [F/A]light",
      ].join("\n")
    );
  });

  it("leaves the chart alone when a key cannot be read", () => {
    expect(transposeChart(chart, "", "A")).toBe(chart);
  });
});

describe(keysInMode, () => {
  it("lists twelve keys starting from the written key", () => {
    const keys = keysInMode("G");
    expect(keys).toHaveLength(12);
    expect(keys[0]).toBe("G");
  });
});

describe(chartLines, () => {
  it("reads headings, chord rows, and lyrics with their chords", () => {
    const lines = chartLines(chart).map((entry) => entry.line);
    expect(lines[0]).toStrictEqual({ kind: "heading", text: "INTRO" });
    expect(lines[1]).toStrictEqual({
      kind: "chords",
      text: "G / / / | C / / / |",
    });
    expect(lines[2]).toStrictEqual({ kind: "blank" });
    expect(lines[4]).toStrictEqual({
      kind: "lyric",
      segments: [
        { at: 0, chord: "G", text: "Morning " },
        { at: 11, chord: "D/F#", text: "light" },
      ],
    });
  });
});

describe(chartSections, () => {
  it("splits sections at blank lines", () => {
    expect(chartSections(chart).map((section) => section.length)).toStrictEqual(
      [2, 2]
    );
  });
});

describe(highlightRuns, () => {
  it("covers every character of the chart exactly once", () => {
    expect(
      highlightRuns(chart)
        .map((run) => run.text)
        .join("")
    ).toBe(chart);
  });
});

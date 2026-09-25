import {
  isChordLine,
  isSectionHeading,
  parseChordChart,
  renderChordChart,
  transposeChordChartText,
} from "@pcobooster/planning-center-models/chord-chart";
import { parseKey } from "@pcobooster/planning-center-models/chord-chart-chords";
import { describe, expect, it } from "vitest";

const keyE = parseKey("E");
const keyG = parseKey("G");

describe(isSectionHeading, () => {
  it.each([
    "VERSE 1",
    "Chorus",
    "PRE-CHORUS",
    "Bridge 2:",
    "TAG (x2)",
    "CHORUS 2x",
    "INSTRUMENTAL",
  ])("recognizes %s", (line) => {
    expect(isSectionHeading(line)).toBeTruthy();
  });

  it.each(["Verse of my life", "Amazing grace", "[G]Chorus"])(
    "leaves %s as lyrics",
    (line) => {
      expect(isSectionHeading(line)).toBeFalsy();
    }
  );
});

describe(isChordLine, () => {
  it("accepts chords with bar lines and repeats", () => {
    expect(isChordLine("D          Bm       G          D")).toBeTruthy();
    expect(isChordLine("| G | D/F# | Em | C | x2")).toBeTruthy();
  });

  it("rejects lyric lines", () => {
    expect(isChordLine("Be thou my vision")).toBeFalsy();
    expect(isChordLine("A mighty fortress")).toBeFalsy();
  });
});

describe(parseChordChart, () => {
  it("reads headings, inline chords, and Planning Center codes", () => {
    const chart = [
      "VERSE 1",
      "[E]Beyond all gener[C#m]ations",
      "",
      "COLUMN_BREAK",
      "{{ PAGE_BREAK }}",
      "{ Softly }",
      "{{ Band out }}",
      "TRANSPOSE KEY +1",
      "",
    ].join("\n");

    expect(parseChordChart(chart)).toStrictEqual([
      { kind: "section", label: "VERSE 1" },
      {
        kind: "lyrics",
        segments: [
          { chord: "E", lyric: "Beyond all gener" },
          { chord: "C#m", lyric: "ations" },
        ],
      },
      { kind: "blank" },
      { kind: "column-break", chartOnly: false },
      { kind: "page-break", chartOnly: true },
      { kind: "note", text: "Softly", chartOnly: false },
      { kind: "note", text: "Band out", chartOnly: true },
      { kind: "key-change", mode: "transpose", semitones: 1 },
    ]);
  });

  it("pairs a chord line with the lyric line below it by column", () => {
    expect(
      parseChordChart("D          Bm\nBe thou my vision O Lord")
    ).toStrictEqual([
      {
        kind: "lyrics",
        segments: [
          { chord: "D", lyric: "Be thou my " },
          { chord: "Bm", lyric: "vision O Lord" },
        ],
      },
    ]);
  });

  it("keeps a chord line with no lyrics below it as chords", () => {
    expect(parseChordChart("| G | D |\n\nVERSE")).toStrictEqual([
      { kind: "chords", text: "| G | D |" },
      { kind: "blank" },
      { kind: "section", label: "VERSE" },
    ]);
  });

  it("strips style tags from lyrics", () => {
    expect(parseChordChart("<b>Holy</b> [G]one")).toStrictEqual([
      {
        kind: "lyrics",
        segments: [
          { chord: null, lyric: "Holy " },
          { chord: "G", lyric: "one" },
        ],
      },
    ]);
  });
});

describe(renderChordChart, () => {
  const blocks = parseChordChart(
    "[E]Beyond [B/D#]all\nTRANSPOSE KEY +1\n[E]Again\n{{ Build }}"
  );

  it("transposes into the preview key and applies key changes", () => {
    const rendered = renderChordChart(blocks, {
      writtenKey: keyE,
      display: { kind: "chords", key: keyG },
    });
    expect(rendered).toStrictEqual([
      {
        kind: "lyrics",
        segments: [
          { chord: "G", lyric: "Beyond " },
          { chord: "D/F#", lyric: "all" },
        ],
      },
      { kind: "lyrics", segments: [{ chord: "Ab", lyric: "Again" }] },
      { kind: "note", text: "Build", chartOnly: true },
    ]);
  });

  it("prints numbers relative to the key, moving with key changes", () => {
    const rendered = renderChordChart(blocks, {
      writtenKey: keyE,
      display: { kind: "numbers" },
    });
    expect(rendered[0]).toStrictEqual({
      kind: "lyrics",
      segments: [
        { chord: "1", lyric: "Beyond " },
        { chord: "5/7", lyric: "all" },
      ],
    });
    expect(rendered[1]).toStrictEqual({
      kind: "lyrics",
      segments: [{ chord: "1", lyric: "Again" }],
    });
  });

  it("drops chords and chart-only codes from lyric sheets", () => {
    expect(
      renderChordChart(blocks, {
        writtenKey: keyE,
        display: { kind: "lyrics" },
      })
    ).toStrictEqual([
      { kind: "lyrics", segments: [{ chord: null, lyric: "Beyond all" }] },
      { kind: "lyrics", segments: [{ chord: null, lyric: "Again" }] },
    ]);
  });
});

describe(transposeChordChartText, () => {
  it("rewrites inline chords and keeps chord lines aligned", () => {
    if (keyE === null || keyG === null) {
      throw new Error("Test keys did not parse");
    }
    expect(
      transposeChordChartText(
        "VERSE\n[E]Beyond [C#m]all\nE    B\nLyrics here",
        keyE,
        keyG
      )
    ).toBe("VERSE\n[G]Beyond [Em]all\nG    D\nLyrics here");
  });
});

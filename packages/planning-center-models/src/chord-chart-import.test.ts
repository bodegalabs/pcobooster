import {
  detectChordChartFormat,
  importChordChart,
  mergeChordsIntoLyrics,
} from "@pcobooster/planning-center-models/chord-chart-import";
import { describe, expect, it } from "vitest";

describe(mergeChordsIntoLyrics, () => {
  it("places each chord at its column", () => {
    expect(
      mergeChordsIntoLyrics(
        "D          Bm       G",
        "Be thou my vision O Lord of my heart"
      )
    ).toBe("[D]Be thou my [Bm]vision O [G]Lord of my heart");
  });

  it("pads short lyric lines so trailing chords are kept", () => {
    expect(mergeChordsIntoLyrics("G       D", "Amen")).toBe("[G]Amen    [D]");
  });
});

describe(importChordChart, () => {
  it("converts a SongSelect ChordPro file into Services headings", () => {
    const file = [
      "{title: Example Song}",
      "{key: G}",
      "{tempo: 72}",
      "{comment: Verse 1}",
      "[G]Line one [C]here",
      "{soc}",
      "[D]Sing it",
      "{eoc}",
      "{comment: Softly}",
      "{new_page}",
      "# a comment",
      "CCLI Song # 1234567",
    ].join("\n");

    expect(importChordChart(file)).toStrictEqual({
      format: "chordpro-file",
      chart: [
        "VERSE 1",
        "[G]Line one [C]here",
        "",
        "CHORUS",
        "[D]Sing it",
        "{ Softly }",
        "PAGE_BREAK",
        "",
      ].join("\n"),
      metadata: { title: "Example Song", key: "G", tempo: "72" },
    });
  });

  it("converts chords written above lyrics into inline chords", () => {
    const text = "Verse 1\nG       C\nAmazing grace\n\n| G | D |\n";
    expect(importChordChart(text)).toStrictEqual({
      format: "chords-over-lyrics",
      chart: "VERSE 1\n[G]Amazing [C]grace\n\n| G | D |\n",
      metadata: {},
    });
  });

  it("formats plain lyrics with headings and drops copyright footers", () => {
    const text =
      "[Verse 1]\nAmazing grace\nHow sweet the sound\n\n\n\nChorus:\nMy chains are gone\n\n© 2006 Worship Together\nCCLI License # 11111";
    expect(importChordChart(text)).toStrictEqual({
      format: "lyrics",
      chart:
        "VERSE 1\nAmazing grace\nHow sweet the sound\n\nCHORUS\nMy chains are gone\n",
      metadata: {},
    });
  });

  it("keeps a chart that already uses inline chords", () => {
    expect(detectChordChartFormat("VERSE\n[G]Amazing grace")).toBe(
      "inline-chords"
    );
  });
});

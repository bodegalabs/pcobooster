import { isSectionHeading } from "@pcobooster/planning-center-models/chord-chart";

import { liveArrangement } from "./songs";
import type { SongSeed } from "./songs";

/**
 * A one-page chord chart PDF, standing in for the one Planning Center renders. It is built by
 * hand (PDF 1.4, standard Type 1 fonts, no compression) so the fixture stays small and valid:
 * chords sit above their lyrics in Courier, like Services' own charts.
 */

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const LINE_HEIGHT = 13;
const LOWEST_LINE = 60;
const CHORD_PATTERN = /\[(?<chord>[^\]]*)\]/gu;
/** Anything outside printable ASCII (space through tilde), which the Type 1 fonts can't show. */
const NON_ASCII = /[^ -~]/gu;

interface TextLine {
  readonly font: "F1" | "F2" | "F3";
  readonly size: number;
  readonly text: string;
  /** Extra space above the line. */
  readonly gap?: number;
}

const escapeText = (text: string): string =>
  text
    .replaceAll(NON_ASCII, "?")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");

/** A chart line as Services prints it: chords on their own line above the lyrics. */
interface ChordedLine {
  readonly chords: string;
  readonly lyrics: string;
}

/** `[G]Morning [C]light` becomes a chord line over a lyric line, chords at their columns. */
const splitChords = (line: string): ChordedLine => {
  let chords = "";
  let lyrics = "";
  let cursor = 0;
  for (const match of line.matchAll(CHORD_PATTERN)) {
    lyrics += line.slice(cursor, match.index);
    const column = lyrics.length;
    chords = chords.length < column ? chords.padEnd(column) : `${chords} `;
    chords += match.groups?.chord ?? "";
    cursor = match.index + match[0].length;
  }
  lyrics += line.slice(cursor);
  return { chords: chords.trimEnd(), lyrics };
};

const chartLines = (chart: string): TextLine[] =>
  chart.split("\n").flatMap((line): TextLine[] => {
    if (line.trim() === "") {
      return [];
    }
    if (isSectionHeading(line)) {
      return [{ font: "F1", size: 10, text: line.trim(), gap: 8 }];
    }
    const { chords, lyrics } = splitChords(line);
    return [
      ...(chords === ""
        ? []
        : [{ font: "F3" as const, size: 10, text: chords }]),
      { font: "F3", size: 10, text: lyrics },
    ];
  });

const contentStream = (song: SongSeed): string => {
  const arrangement = liveArrangement(song);
  const details = [
    song.author,
    arrangement.chartKey === null ? null : `Key of ${arrangement.chartKey}`,
    arrangement.bpm === null ? null : `${arrangement.bpm} bpm`,
    arrangement.meter,
  ].filter((part) => part !== null);
  const lines: TextLine[] = [
    { font: "F1", size: 20, text: song.title },
    { font: "F2", size: 10, text: details.join("   "), gap: 4 },
    ...chartLines(arrangement.chart),
  ];
  const commands = ["BT"];
  let y = PAGE_HEIGHT - MARGIN;
  for (const line of lines) {
    y -= LINE_HEIGHT + (line.gap ?? 0);
    if (y < LOWEST_LINE) {
      break;
    }
    commands.push(
      `/${line.font} ${line.size} Tf`,
      `1 0 0 1 ${MARGIN} ${y} Tm`,
      `(${escapeText(line.text)}) Tj`
    );
  }
  commands.push("ET");
  return `${commands.join("\n")}\n`;
};

/** The PDF bytes as a Latin-1 string (the content is ASCII, so lengths are byte counts). */
export const chordChartPdfDocument = (song: SongSeed): string => {
  const stream = contentStream(song);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    `<< /Title (${escapeText(song.title)}) /Producer (pcobooster.com fixtures) >>`,
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = body.length;
  const entries = offsets.map(
    (offset) => `${String(offset).padStart(10, "0")} 00000 n \n`
  );
  return [
    body,
    `xref\n0 ${objects.length + 1}\n`,
    "0000000000 65535 f \n",
    ...entries,
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 8 0 R >>\n`,
    `startxref\n${xrefOffset}\n%%EOF\n`,
  ].join("");
};

/** What `chordCharts.pdf` returns: the PDF, base64 encoded. */
export const chordChartPdf = (song: SongSeed): string =>
  Buffer.from(chordChartPdfDocument(song), "latin1").toString("base64");

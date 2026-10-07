import {
  COLUMN_BREAK,
  PAGE_BREAK,
  isChordLine,
  isSectionHeading,
  transposeChordChartText,
} from "@pcobooster/planning-center-models/chord-chart";
import { parseKey } from "@pcobooster/planning-center-models/chord-chart-chords";

import { displayKey } from "../../lib/song-keys";
import { keyOptionLabel } from "./detail";
import type { ChordChartArrangement, KeyOption } from "./detail";

/**
 * A read-only reading of an arrangement's Lyrics & Chords text (Services' ChordPro-based
 * format): section headings, chord lines over lyrics, and inline `[G]` chords, in one of the
 * arrangement's keys or as a lyrics sheet. Planning Center's own PDF of the same chart opens in
 * `chart-pdf-screen.tsx`.
 */

/** What the chart shows: one of the arrangement's keys, or its lyrics. */
export type ChartTarget =
  | { readonly kind: "key"; readonly key: KeyOption }
  | { readonly kind: "lyrics" };

export const chartTargetId = (target: ChartTarget): string =>
  target.kind === "lyrics" ? "lyrics" : `key-${target.key.id}`;

/** "Chords in G", "Jordan's key (A)", or "Lyrics" (the web's `keyLabel`). */
export const chartTargetLabel = (target: ChartTarget): string => {
  if (target.kind === "lyrics") {
    return "Lyrics";
  }
  const name = target.key.name.trim();
  const start = target.key.startingKey ?? "";
  if (name === "" || name === start) {
    return start === "" ? "Chord chart" : `Chords in ${displayKey(start)}`;
  }
  return keyOptionLabel(target.key);
};

/** Every target an arrangement offers: its keys, then the lyrics sheet. */
export const chartTargets = (
  arrangement: ChordChartArrangement
): ChartTarget[] => [
  ...arrangement.keys.map((key): ChartTarget => ({ kind: "key", key })),
  { kind: "lyrics" },
];

/** The target with `id`, else the arrangement's first. */
export const resolveChartTarget = (
  arrangement: ChordChartArrangement,
  id: string | null | undefined
): ChartTarget => {
  const targets = chartTargets(arrangement);
  return (
    targets.find((target) => chartTargetId(target) === id) ??
    targets[0] ?? { kind: "lyrics" }
  );
};

export const hasChart = (arrangement: ChordChartArrangement): boolean =>
  arrangement.chordChart.trim() !== "";

export interface ChartSegment {
  readonly chord: string | null;
  readonly text: string;
}

export type ChartLine =
  | { readonly kind: "heading"; readonly text: string }
  | { readonly kind: "chords"; readonly text: string }
  | { readonly kind: "lyric"; readonly segments: readonly ChartSegment[] }
  | { readonly kind: "comment"; readonly text: string }
  | { readonly kind: "blank" }
  | { readonly kind: "break" };

const INLINE_CHORD = /\[(?<chord>[^\]]*)\]/gu;
const PLAIN_TEXT_TAG = /<\/?t>/giu;
const DIRECTIVE =
  /^\{\s*(?:c|comment|ci|comment_italic)\s*:\s*(?<text>.*)\}$/iu;
const OTHER_DIRECTIVE = /^\{[^}]*\}$/u;

/** A lyric line split at its inline chords: each chord sits over the text after it. */
const lyricSegments = (line: string): ChartSegment[] => {
  const segments: ChartSegment[] = [];
  let chord: string | null = null;
  let start = 0;
  for (const match of line.matchAll(INLINE_CHORD)) {
    const text = line.slice(start, match.index);
    if (chord !== null || text !== "") {
      segments.push({ chord, text });
    }
    chord = match.groups?.chord ?? "";
    start = match.index + match[0].length;
  }
  const rest = line.slice(start);
  if (chord !== null || rest !== "" || segments.length === 0) {
    segments.push({ chord, text: rest });
  }
  return segments;
};

/** Reads chart text into lines to draw. Windows line endings and trailing spaces don't matter. */
export const parseChartLines = (text: string): ChartLine[] =>
  text
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((raw): ChartLine => {
      const line = raw.replaceAll(PLAIN_TEXT_TAG, "").trimEnd();
      const trimmed = line.trim();
      if (trimmed === "") {
        return { kind: "blank" };
      }
      if (trimmed === COLUMN_BREAK || trimmed === PAGE_BREAK) {
        return { kind: "break" };
      }
      const directive = DIRECTIVE.exec(trimmed)?.groups?.text;
      if (directive !== undefined) {
        return { kind: "comment", text: directive.trim() };
      }
      if (OTHER_DIRECTIVE.test(trimmed)) {
        return { kind: "blank" };
      }
      if (isSectionHeading(trimmed)) {
        return { kind: "heading", text: trimmed };
      }
      if (isChordLine(raw)) {
        return { kind: "chords", text: line };
      }
      return { kind: "lyric", segments: lyricSegments(line) };
    })
    // Runs of blank lines and breaks read as one gap.
    .filter(
      (line, index, lines) =>
        !(
          (line.kind === "blank" || line.kind === "break") &&
          (index === 0 ||
            lines[index - 1]?.kind === "blank" ||
            lines[index - 1]?.kind === "break")
        )
    );

/** Lyrics only: the chart without its chord lines and inline chords. */
const stripChords = (lines: readonly ChartLine[]): ChartLine[] =>
  lines.flatMap((line): ChartLine[] => {
    if (line.kind === "chords") {
      return [];
    }
    if (line.kind === "lyric") {
      const text = line.segments.map((segment) => segment.text).join("");
      return text.trim() === ""
        ? []
        : [{ kind: "lyric", segments: [{ chord: null, text }] }];
    }
    return [line];
  });

export interface ChartReading {
  readonly lines: readonly ChartLine[];
  /** The key the chords show in, when they show; null for lyrics or an unknown key. */
  readonly key: string | null;
  /** Why the chords show as written instead of in the chosen key, if they do. */
  readonly note: string | null;
}

/**
 * The arrangement's chart for `target`: chords moved from the key they are written in
 * (`chordChartKey`) to the chosen key's starting key, or the lyrics with chords removed. When
 * Planning Center has no written key, the chords show as written, and the reading says so.
 */
export const readChart = (
  arrangement: ChordChartArrangement,
  target: ChartTarget
): ChartReading => {
  if (target.kind === "lyrics") {
    return {
      lines: stripChords(parseChartLines(arrangement.chordChart)),
      key: null,
      note: null,
    };
  }
  const written = parseKey(arrangement.chordChartKey);
  const wanted = parseKey(target.key.startingKey);
  if (written === null) {
    return {
      lines: parseChartLines(arrangement.chordChart),
      key: null,
      note: "Planning Center has no key for this chart, so its chords show as written.",
    };
  }
  if (wanted === null) {
    return {
      lines: parseChartLines(arrangement.chordChart),
      key: written.name,
      note: `This key has no starting key in Planning Center, so the chords show in ${displayKey(written.name)} as written.`,
    };
  }
  return {
    lines: parseChartLines(
      transposeChordChartText(arrangement.chordChart, written, wanted)
    ),
    key: wanted.name,
    note: null,
  };
};

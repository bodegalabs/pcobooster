import {
  isChordLine,
  isSectionHeading,
  transposeChordChartText,
} from "@pcobooster/planning-center-models/chord-chart";
import {
  parseKey,
  transposeKey,
} from "@pcobooster/planning-center-models/chord-chart-chords";

import { chordCharts, songs } from "./fixtures";
import type { DemoChordChart } from "./fixtures";
import { createStore } from "./store";

const KEYS_PER_MODE = 12;
const INLINE_CHORD_PATTERN = /\[(?<chord>[^\]\n]*)\]/gu;

export type ChartLine =
  | { readonly kind: "heading"; readonly text: string }
  | { readonly kind: "chords"; readonly text: string }
  | {
      readonly kind: "lyric";
      readonly segments: readonly {
        /** Character offset into the line, which identifies the segment. */
        readonly at: number;
        readonly chord: string | null;
        readonly text: string;
      }[];
    }
  | { readonly kind: "blank" };

const NEW_CHART_BPM = 72;

/** Every library song's chart; songs without a sample chart start empty in their usual key. */
const initialCharts: Readonly<Record<string, DemoChordChart>> =
  Object.fromEntries(
    songs.map((song) => [
      song.id,
      chordCharts.get(song.id) ?? {
        key: song.keys[0] ?? "C",
        bpm: NEW_CHART_BPM,
        meter: "4/4",
        chart: "",
      },
    ])
  );

// Module-level so a chart edited in one replica reads the same in every other.
const chartStore =
  createStore<Readonly<Record<string, DemoChordChart>>>(initialCharts);

export const useChordChart = (songId: string): DemoChordChart | undefined =>
  chartStore.use((charts) => charts[songId]);

export const updateChordChart = (
  songId: string,
  patch: Partial<Pick<DemoChordChart, "chart" | "key">>
) => {
  const charts = chartStore.get();
  const current = charts[songId];
  if (current !== undefined) {
    chartStore.set({ ...charts, [songId]: { ...current, ...patch } });
  }
};

export const resetChordCharts = () => {
  chartStore.set(initialCharts);
};

/** The twelve keys in the chart's own mode, starting from its written key. */
export const keysInMode = (writtenKey: string): string[] => {
  const key = parseKey(writtenKey);
  if (key === null) {
    return [];
  }
  return Array.from(
    { length: KEYS_PER_MODE },
    (_, step) => transposeKey(key, step).name
  );
};

/** The chart with its chords rewritten from one key into another, as the product does. */
export const transposeChart = (
  chart: string,
  fromKey: string,
  toKey: string
): string => {
  const from = parseKey(fromKey);
  const to = parseKey(toKey);
  return from === null || to === null
    ? chart
    : transposeChordChartText(chart, from, to);
};

const lyricSegments = (line: string) => {
  const segments: { at: number; chord: string | null; text: string }[] = [];
  let cursor = 0;
  let start = 0;
  let chord: string | null = null;
  for (const match of line.matchAll(INLINE_CHORD_PATTERN)) {
    const text = line.slice(cursor, match.index);
    if (text !== "" || chord !== null) {
      segments.push({ at: start, chord, text });
    }
    chord = match.groups?.chord ?? null;
    start = match.index;
    cursor = match.index + match[0].length;
  }
  segments.push({ at: start, chord, text: line.slice(cursor) });
  return segments;
};

const readLine = (line: string): ChartLine => {
  if (line.trim() === "") {
    return { kind: "blank" };
  }
  if (isSectionHeading(line)) {
    return { kind: "heading", text: line.trim() };
  }
  if (isChordLine(line)) {
    return { kind: "chords", text: line.trim() };
  }
  return { kind: "lyric", segments: lyricSegments(line) };
};

/** Each line of a chart as Planning Center lays it out: headings, chord rows, and lyrics. */
export const chartLines = (
  chart: string
): { readonly at: number; readonly line: ChartLine }[] => {
  let at = 0;
  return chart.split("\n").map((text) => {
    const start = at;
    at += text.length + 1;
    return { at: start, line: readLine(text) };
  });
};

/** The chart's lines in blank-line separated sections, which print without splitting. */
export const chartSections = (
  chart: string
): { readonly at: number; readonly line: ChartLine }[][] => {
  const sections: { at: number; line: ChartLine }[][] = [];
  let current: { at: number; line: ChartLine }[] = [];
  for (const entry of chartLines(chart)) {
    if (entry.line.kind === "blank") {
      if (current.length > 0) {
        sections.push(current);
      }
      current = [];
    } else {
      current.push(entry);
    }
  }
  if (current.length > 0) {
    sections.push(current);
  }
  return sections;
};

export type HighlightTone = "heading" | "chord" | null;

/** The chart's text in colored runs for the editor, without changing a character. */
export const highlightRuns = (
  chart: string
): {
  /** Character offset into the chart, which identifies the run. */
  readonly at: number;
  readonly text: string;
  readonly tone: HighlightTone;
}[] => {
  const runs: { at: number; text: string; tone: HighlightTone }[] = [];
  const lines = chart.split("\n");
  let lineStart = 0;
  for (const [index, line] of lines.entries()) {
    const newline = index < lines.length - 1 ? "\n" : "";
    if (isSectionHeading(line) || isChordLine(line)) {
      runs.push({
        at: lineStart,
        text: `${line}${newline}`,
        tone: isChordLine(line) ? "chord" : "heading",
      });
    } else {
      let cursor = 0;
      for (const match of line.matchAll(INLINE_CHORD_PATTERN)) {
        runs.push(
          {
            at: lineStart + cursor,
            text: line.slice(cursor, match.index),
            tone: null,
          },
          { at: lineStart + match.index, text: match[0], tone: "chord" }
        );
        cursor = match.index + match[0].length;
      }
      runs.push({
        at: lineStart + cursor,
        text: `${line.slice(cursor)}${newline}`,
        tone: null,
      });
    }
    lineStart += line.length + 1;
  }
  return runs.filter((run) => run.text !== "");
};

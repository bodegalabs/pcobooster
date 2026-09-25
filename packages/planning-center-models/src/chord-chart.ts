/**
 * Reads Planning Center's Lyrics & Chords text (`Arrangement.chord_chart`) into blocks a
 * preview can lay out. The format mixes ChordPro inline chords (`[G]Amazing grace`) with
 * chords written on their own line above the lyrics, plus Planning Center's special codes:
 * section headings in capitals, `COLUMN_BREAK`, `PAGE_BREAK`, `{ notes }`, `{{ chart-only }}`
 * codes, and `TRANSPOSE KEY` / `REDEFINE KEY`.
 */
import {
  chordTextToNumbers,
  chordTextToNumerals,
  isChord,
  semitonesBetween,
  transposeChordText,
  transposeKey,
} from "@pcobooster/planning-center-models/chord-chart-chords";
import type { MusicalKey } from "@pcobooster/planning-center-models/chord-chart-chords";

export interface ChordChartSegment {
  /** The chord sung at the start of `lyric`, if any. */
  readonly chord: string | null;
  readonly lyric: string;
}

export type ChordChartBlock =
  | { readonly kind: "section"; readonly label: string }
  | { readonly kind: "lyrics"; readonly segments: readonly ChordChartSegment[] }
  | { readonly kind: "chords"; readonly text: string }
  | { readonly kind: "blank" }
  | {
      readonly kind: "note";
      readonly text: string;
      readonly chartOnly: boolean;
    }
  | { readonly kind: "column-break"; readonly chartOnly: boolean }
  | { readonly kind: "page-break"; readonly chartOnly: boolean }
  | {
      readonly kind: "key-change";
      readonly mode: "transpose" | "redefine";
      readonly semitones: number;
    };

/** Section names Planning Center formats as headings, optionally numbered (`VERSE 2`). */
const SECTION_NAMES = [
  "intro",
  "verse",
  "pre-chorus",
  "prechorus",
  "pre chorus",
  "chorus",
  "post-chorus",
  "postchorus",
  "post chorus",
  "refrain",
  "bridge",
  "tag",
  "interlude",
  "instrumental",
  "turnaround",
  "vamp",
  "breakdown",
  "ending",
  "outro",
  "coda",
  "misc",
  "spoken",
  "solo",
  "rap",
  "hook",
  "channel",
] as const;

const SECTION_PATTERN = new RegExp(
  `^(?:${SECTION_NAMES.join("|")})(?:\\s*\\d+[a-z]?)?(?:\\s*[(]?\\s*[x×]\\s*\\d+\\s*[)]?)?(?:\\s*[(][^)]*[)])?\\s*:?$`,
  "iu"
);
const BRACKETED_CHORD_PATTERN = /\[(?<chord>[^\]]*)\]/gu;
const CHART_ONLY_CODE_PATTERN = /^\{\{\s*(?<code>.*?)\s*\}\}$/u;
const NOTE_PATTERN = /^\{\s*(?<text>.*?)\s*\}$/u;
const KEY_CHANGE_PATTERN =
  /^(?<mode>TRANSPOSE|REDEFINE)\s+KEY\s+(?<semitones>[+-]?\s*\d+)$/iu;
const STYLE_TAG_PATTERN = /<\/?(?:b|strong|i|em|u|t)>/giu;
const PLAIN_TEXT_TAG_PATTERN = /<t>/iu;
/** Chord-line tokens that are not chords: bar lines, repeats, and rests. */
const CHORD_LINE_SYMBOL_PATTERN =
  /^(?:\||\|\||\/|-|–|%|\.|:|\(|\)|[x×]\d+|\(?[x×]\d+\)?|N\.?C\.?|\(\S*\))$/iu;
const WHITESPACE_TOKEN_PATTERN = /\S+/gu;

export const COLUMN_BREAK = "COLUMN_BREAK";
export const PAGE_BREAK = "PAGE_BREAK";

export const isSectionHeading = (line: string): boolean =>
  !line.includes("[") && SECTION_PATTERN.test(line.trim());

export const stripStyleTags = (text: string): string =>
  text.replaceAll(STYLE_TAG_PATTERN, "");

/** A line of chords written above lyrics, such as `G    D/F#   Em`. */
export const isChordLine = (line: string): boolean => {
  if (line.includes("[") || PLAIN_TEXT_TAG_PATTERN.test(line)) {
    return false;
  }
  const tokens = line.match(WHITESPACE_TOKEN_PATTERN) ?? [];
  let chords = 0;
  for (const token of tokens) {
    if (isChord(token)) {
      chords += 1;
    } else if (!CHORD_LINE_SYMBOL_PATTERN.test(token)) {
      return false;
    }
  }
  return chords > 0;
};

const parseInlineChords = (line: string): ChordChartSegment[] => {
  const segments: ChordChartSegment[] = [];
  let chord: string | null = null;
  let cursor = 0;
  for (const match of line.matchAll(BRACKETED_CHORD_PATTERN)) {
    const lyric = line.slice(cursor, match.index);
    if (lyric.length > 0 || chord !== null) {
      segments.push({ chord, lyric });
    }
    chord = match.groups?.chord.trim() ?? "";
    cursor = match.index + match[0].length;
  }
  segments.push({ chord, lyric: line.slice(cursor) });
  return segments;
};

/** Pairs a chord line with the lyric line below it by column. */
const mergeChordLine = (chordLine: string, lyricLine: string) => {
  const segments: ChordChartSegment[] = [];
  const chords = [...chordLine.matchAll(WHITESPACE_TOKEN_PATTERN)];
  const firstColumn = chords[0]?.index ?? 0;
  if (firstColumn > 0) {
    segments.push({ chord: null, lyric: lyricLine.slice(0, firstColumn) });
  }
  for (const [index, match] of chords.entries()) {
    const nextColumn = chords[index + 1]?.index;
    segments.push({
      chord: match[0],
      lyric: lyricLine.slice(match.index, nextColumn),
    });
  }
  return segments;
};

const parseCode = (
  code: string,
  chartOnly: boolean
): ChordChartBlock | null => {
  const upper = code.toUpperCase();
  if (upper === COLUMN_BREAK) {
    return { kind: "column-break", chartOnly };
  }
  if (upper === PAGE_BREAK) {
    return { kind: "page-break", chartOnly };
  }
  const keyChange = KEY_CHANGE_PATTERN.exec(code)?.groups;
  if (keyChange !== undefined) {
    return {
      kind: "key-change",
      mode:
        keyChange.mode.toUpperCase() === "REDEFINE" ? "redefine" : "transpose",
      semitones: Math.trunc(Number(keyChange.semitones.replaceAll(/\s/gu, ""))),
    };
  }
  return null;
};

const parseStandaloneLine = (line: string): ChordChartBlock | null => {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return { kind: "blank" };
  }
  const chartOnly = CHART_ONLY_CODE_PATTERN.exec(trimmed)?.groups;
  if (chartOnly !== undefined) {
    return (
      parseCode(chartOnly.code, true) ?? {
        kind: "note",
        text: chartOnly.code,
        chartOnly: true,
      }
    );
  }
  const note = NOTE_PATTERN.exec(trimmed)?.groups;
  if (note !== undefined) {
    return { kind: "note", text: note.text, chartOnly: false };
  }
  const code = parseCode(trimmed, false);
  if (code !== null) {
    return code;
  }
  if (isSectionHeading(trimmed)) {
    return { kind: "section", label: trimmed.replace(/:$/u, "").toUpperCase() };
  }
  return null;
};

export const parseChordChart = (text: string): ChordChartBlock[] => {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const blocks: ChordChartBlock[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/\s+$/u, "");
    const standalone = parseStandaloneLine(line);
    if (standalone !== null) {
      blocks.push(standalone);
      continue;
    }
    if (isChordLine(line)) {
      const next = lines[index + 1]?.replace(/\s+$/u, "");
      const pairsWithLyrics =
        next !== undefined &&
        parseStandaloneLine(next) === null &&
        !isChordLine(next) &&
        !next.includes("[");
      if (pairsWithLyrics) {
        blocks.push({
          kind: "lyrics",
          segments: mergeChordLine(line, stripStyleTags(next)),
        });
        index += 1;
      } else {
        blocks.push({ kind: "chords", text: line });
      }
      continue;
    }
    blocks.push({
      kind: "lyrics",
      segments: parseInlineChords(stripStyleTags(line)),
    });
  }
  // Trailing blank lines never print.
  while (blocks.at(-1)?.kind === "blank") {
    blocks.pop();
  }
  return blocks;
};

export type ChordChartDisplay =
  | { readonly kind: "chords"; readonly key: MusicalKey | null }
  | { readonly kind: "numbers" }
  | { readonly kind: "numerals" }
  | { readonly kind: "lyrics" };

export interface ChordChartRenderOptions {
  /** The key the chart is written in (`chord_chart_key`). */
  readonly writtenKey: MusicalKey | null;
  readonly display: ChordChartDisplay;
}

/**
 * Spells chords for a display as the chart plays: `TRANSPOSE KEY` shifts the chords after
 * it, and both key-change codes move the key numbers are counted from.
 */
const createChordFormatter = (
  writtenKey: MusicalKey | null,
  display: ChordChartDisplay
) => {
  const baseShift =
    display.kind === "chords" && writtenKey !== null && display.key !== null
      ? semitonesBetween(writtenKey, display.key)
      : 0;
  let chordShift = baseShift;
  let referenceKey =
    writtenKey === null ? null : transposeKey(writtenKey, baseShift);
  return {
    changeKey: (mode: "transpose" | "redefine", semitones: number) => {
      if (referenceKey !== null) {
        referenceKey = transposeKey(referenceKey, semitones);
      }
      if (mode === "transpose") {
        chordShift += semitones;
      }
    },
    format: (text: string): string => {
      // Numbers describe what sounds, so they count from the shifted chords too.
      const sounding =
        chordShift === 0
          ? text
          : transposeChordText(text, chordShift, referenceKey);
      if (referenceKey === null || display.kind === "chords") {
        return sounding;
      }
      return display.kind === "numbers"
        ? chordTextToNumbers(sounding, referenceKey)
        : chordTextToNumerals(sounding, referenceKey);
    },
  };
};

/** One block as it prints, or null when the display leaves it out. */
const renderBlock = (
  block: Exclude<ChordChartBlock, { kind: "key-change" }>,
  lyricsOnly: boolean,
  format: (chords: string) => string
): ChordChartBlock | null => {
  switch (block.kind) {
    case "lyrics": {
      if (!lyricsOnly) {
        return {
          kind: "lyrics",
          segments: block.segments.map((segment) => ({
            chord: segment.chord === null ? null : format(segment.chord),
            lyric: segment.lyric,
          })),
        };
      }
      const lyric = block.segments.map((segment) => segment.lyric).join("");
      return lyric.trim().length > 0
        ? { kind: "lyrics", segments: [{ chord: null, lyric }] }
        : null;
    }
    case "chords": {
      return lyricsOnly ? null : { kind: "chords", text: format(block.text) };
    }
    case "note":
    case "column-break":
    case "page-break": {
      return lyricsOnly && block.chartOnly ? null : block;
    }
    case "section":
    case "blank": {
      return block;
    }
    default: {
      return block satisfies never;
    }
  }
};

/**
 * Blocks as they print for a display: chords transposed or spelled as numbers, key changes
 * applied, and chart-only codes and chords dropped from lyric sheets.
 */
export const renderChordChart = (
  blocks: readonly ChordChartBlock[],
  { writtenKey, display }: ChordChartRenderOptions
): ChordChartBlock[] => {
  const formatter = createChordFormatter(writtenKey, display);
  const rendered: ChordChartBlock[] = [];
  for (const block of blocks) {
    if (block.kind === "key-change") {
      formatter.changeKey(block.mode, block.semitones);
      continue;
    }
    const printed = renderBlock(
      block,
      display.kind === "lyrics",
      formatter.format
    );
    if (printed !== null) {
      rendered.push(printed);
    }
  }
  return rendered;
};

/** Transposes a chord line, keeping each chord over the lyric column it started on. */
const transposeChordLine = (
  line: string,
  semitones: number,
  to: MusicalKey
): string => {
  let result = "";
  for (const match of line.matchAll(WHITESPACE_TOKEN_PATTERN)) {
    const column = Math.max(match.index, result.length + (result ? 1 : 0));
    result = `${result.padEnd(column)}${transposeChordText(match[0], semitones, to)}`;
  }
  return result;
};

/** The chart's written key moved to another key: rewrites the chords in the text itself. */
export const transposeChordChartText = (
  text: string,
  from: MusicalKey,
  to: MusicalKey
): string => {
  const semitones = semitonesBetween(from, to);
  if (semitones === 0) {
    return text;
  }
  return text
    .split("\n")
    .map((line) => {
      if (isChordLine(line)) {
        return transposeChordLine(line, semitones, to);
      }
      return line.replaceAll(
        BRACKETED_CHORD_PATTERN,
        (_match, chord: string) =>
          `[${transposeChordText(chord, semitones, to)}]`
      );
    })
    .join("\n");
};

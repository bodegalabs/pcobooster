/**
 * Parity suites for the iOS port of the music logic: key spelling and theory
 * (`apps/web/src/lib/key-theory.ts`), key change ratings and advice
 * (`apps/web/src/lib/key-transition-advice.ts`), and the primitive song facts in
 * `apps/web/src/lib/song-library.ts`. Swift replays them in
 * `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Logic/Music/`.
 *
 * Pairs of keys run exhaustively. To keep fixtures small, chords, notes, and advice
 * segments are written as short strings that the Swift tests rebuild the same way.
 */
import {
  chordName,
  circleOfFifthsDistance,
  commonToneChords,
  commonTones,
  diatonicTriads,
  dominantIsIn,
  dominantSeventhOf,
  homeChordIsIn,
  keyName,
  noteName,
  parallelOf,
  parseMusicalKey,
  pitchOf,
  pivotChords,
  predominantOf,
  scaleOf,
  semitonesUp,
} from "@/lib/key-theory";
import type {
  Chord,
  CommonToneChord,
  MusicalKey,
  PivotChord,
  SpelledNote,
} from "@/lib/key-theory";
import {
  appendNote,
  MAX_ALTERNATE_SEMITONES,
  rankAlternateKeys,
  rateKeyChange,
  suggestionNote,
  transitionSuggestions,
} from "@/lib/key-transition-advice";
import type {
  AdviceSegment,
  KeyChangeKind,
  KeyChangeRating,
  TransitionSuggestion,
} from "@/lib/key-transition-advice";
import { describeKeyChange, tempoLabel } from "@/lib/song-library";

import { defineParitySuite } from "./parity";
import type { ParitySuite } from "./parity";

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const ACCIDENTALS = ["", "#", "b"] as const;
const TONICS = LETTERS.flatMap((letter) =>
  ACCIDENTALS.map((accidental) => `${letter}${accidental}`)
);

/** Every key spelling a band could write: 21 tonics, major then minor. */
const KEY_SPELLINGS: readonly string[] = [
  ...TONICS,
  ...TONICS.map((tonic) => `${tonic}m`),
];

const spelledKey = (spelling: string): MusicalKey => {
  const key = parseMusicalKey(spelling);
  if (key === null) {
    throw new Error(`Parity key ${spelling} did not parse`);
  }
  return key;
};

/** The spellings that parse to distinct keys (A#, D#, and G# major become Bb, Eb, Ab). */
const DISTINCT_KEY_NAMES: readonly string[] = [
  ...new Set(KEY_SPELLINGS.map((spelling) => keyName(spelledKey(spelling)))),
];

const pairsOf = (names: readonly string[]) =>
  names.flatMap((from) => names.map((to) => ({ from, to })));

const KINDS: readonly KeyChangeKind[] = [
  "same",
  "parallel",
  "relative",
  "close",
  "lift",
  "mediant",
  "step-down",
  "half-step-down",
  "tritone",
  "distant-mode",
];

// Characters JavaScript and Swift treat differently, built from code points so the source
// stays visible ASCII (the formatter also rewrites escaped dashes into real ones).
const char = (codePoint: number) => String.fromCodePoint(codePoint);
const EN_DASH = char(0x20_13);
const NBSP = char(0xa0);
const NEXT_LINE = char(0x85);
const BOM = char(0xfe_ff);
const LINE_SEPARATOR = char(0x20_28);
const IDEOGRAPHIC_SPACE = char(0x30_00);
const COMBINING_ACUTE = char(0x3_01);

const PARSE_EXTRAS: readonly string[] = [
  "",
  " ",
  "H",
  "c",
  "cm",
  "Bbmin",
  "Cmin",
  "Cmi",
  "Cmaj",
  "Cmaj7",
  "Cm7",
  "Cmaj7 (capo 2)",
  "Cma",
  "Cmaa",
  "Cmja",
  "C m",
  "C#maj",
  "F#m",
  "F♯",
  "F♯m",
  "B♭",
  "B♭min",
  "Ebb",
  "E#",
  "B#",
  "Cb",
  "Fb",
  "A#",
  "D#",
  "G#",
  "A#m",
  "D#m",
  "G#m",
  " Eb",
  "\tF#m",
  "\n\nG",
  `${NBSP}D`,
  `${IDEOGRAPHIC_SPACE}E`,
  `${BOM}E`,
  `${NEXT_LINE}F`,
  `${LINE_SEPARATOR}A`,
  "(Female Lead) John",
  "Am (capo 2)",
  "G/B",
  "Gsus",
  "Dm7b5",
  "Em - D",
  `G${EN_DASH}A`,
  `A${COMBINING_ACUTE}m`,
  "Ám",
  "Eb major",
  "E minor",
];

interface ParseInput {
  value: string | null;
  minorOverride?: boolean | null;
}

const PARSE_CASES: readonly ParseInput[] = [
  ...KEY_SPELLINGS.map((value) => ({ value })),
  ...PARSE_EXTRAS.map((value) => ({ value })),
  { value: null },
  { value: null, minorOverride: true },
  ...["A", "Am", "A#", "A#m", "Bbmin", "H", "D#", "Cmaj"].flatMap((value) => [
    { value, minorOverride: true },
    { value, minorOverride: false },
    { value, minorOverride: null },
  ]),
];

const noteView = (note: SpelledNote) => ({
  letter: note.letter,
  accidental: note.accidental,
  pitch: note.pitch,
});

const chordView = (chord: Chord) => ({
  root: noteView(chord.root),
  quality: chord.quality,
  numeral: chord.numeral,
  name: chordName(chord),
});

/** Keys the parser cannot produce, to pin the theory on any input. */
const DIRECT_KEYS: readonly MusicalKey[] = [
  { letter: "A", accidental: 1, minor: false },
  { letter: "D", accidental: 1, minor: false },
  { letter: "G", accidental: 1, minor: false },
  { letter: "F", accidental: 2, minor: false },
  { letter: "B", accidental: -2, minor: true },
  { letter: "E", accidental: -2, minor: false },
  { letter: "C", accidental: 2, minor: true },
];

const KEY_CASES: readonly MusicalKey[] = [
  ...DISTINCT_KEY_NAMES.map(spelledKey),
  ...DIRECT_KEYS,
];

const pivotText = ({ chord, borrowed }: PivotChord) =>
  `${chordName(chord)} ${chord.numeral}${borrowed ? " borrowed" : ""}`;

/**
 * `A/A t:F:I>f:D:I`: the held note in the new key's spelling and the old key's, then each
 * chord's role initial, name, and numeral.
 */
const commonToneText = (shared: CommonToneChord) =>
  `${noteName(shared.tone)}/${noteName(shared.fromTone)} ${shared.fromRole.slice(0, 1)}:${chordName(shared.from)}:${shared.from.numeral}>${shared.toRole.slice(0, 1)}:${chordName(shared.to)}:${shared.to.numeral}`;

const segmentText = (segment: AdviceSegment) =>
  `${segment.kind === "chord" ? "c" : "t"}:${segment.text}`;

const suggestionView = (suggestion: TransitionSuggestion) => ({
  id: suggestion.id,
  title: suggestion.title,
  segments: suggestion.segments.map(segmentText).join("|"),
});

const ratingView = ({ level, kind, reason }: KeyChangeRating) => ({
  level,
  kind,
  reason,
});

interface SuggestionInput {
  fromTitle: string;
  toTitle: string;
  from: string;
  to: string;
  /** The rated kind when absent. */
  kind?: KeyChangeKind;
}

/** Pairs that reach every builder, run through every kind's list. */
const KIND_SAMPLE_PAIRS: readonly { from: string; to: string }[] = [
  { from: "C", to: "C" },
  { from: "Am", to: "A" },
  { from: "C", to: "Am" },
  { from: "Am", to: "G" },
  { from: "Bb", to: "C" },
  { from: "C", to: "Db" },
  { from: "C", to: "Eb" },
  { from: "C", to: "E" },
  { from: "D", to: "C" },
  { from: "Eb", to: "D" },
  { from: "Bb", to: "E" },
  { from: "C", to: "F#m" },
  { from: "C", to: "Fm" },
  { from: "F#", to: "Gbm" },
  { from: "Ebm", to: "B" },
];

const TITLE_CASES: readonly SuggestionInput[] = [
  { fromTitle: "Way Maker", toTitle: "Goodness of God", from: "F", to: "E" },
  { fromTitle: "", toTitle: "", from: "Bb", to: "E" },
  { fromTitle: 'It\'s "Good"', toTitle: "B's", from: "C", to: "Eb" },
  { fromTitle: "Ñandú 🎵", toTitle: "사랑해", from: "Am", to: "E" },
  { fromTitle: " spaced ", toTitle: "\ttabbed", from: "Bb", to: "C" },
];

const SUGGESTION_CASES: readonly SuggestionInput[] = [
  ...pairsOf(DISTINCT_KEY_NAMES).map(({ from, to }) => ({
    fromTitle: "A",
    toTitle: "B",
    from,
    to,
  })),
  ...KIND_SAMPLE_PAIRS.flatMap(({ from, to }) =>
    KINDS.map((kind) => ({ fromTitle: "A", toTitle: "B", from, to, kind }))
  ),
  ...TITLE_CASES,
];

interface RankInput {
  from: string;
  to: string;
  /**
   * Candidate key spellings separated by spaces, or every spelling in `music.keySpellings`
   * when absent. Each candidate's value is its index.
   */
  candidates?: string;
}

const REVERSED_CANDIDATES = KEY_SPELLINGS.toReversed().join(" ");

const RANK_CASES: readonly RankInput[] = [
  ...pairsOf(DISTINCT_KEY_NAMES),
  ...KIND_SAMPLE_PAIRS.map(({ from, to }) => ({
    from,
    to,
    candidates: REVERSED_CANDIDATES,
  })),
  { from: "Bb", to: "E", candidates: "F Eb D C Ab" },
  { from: "C", to: "Eb", candidates: "F Eb D C Ab" },
  { from: "C", to: "Eb", candidates: "Db C# D E Db" },
  { from: "G", to: "A", candidates: "" },
];

interface AppendNoteInput {
  notes: string;
  line: string;
}

const APPEND_NOTE_CASES: readonly AppendNoteInput[] = [
  { notes: "  ", line: "Hold the A" },
  { notes: "Jamie leads\n", line: "Hold the A" },
  { notes: "Jamie leads\nHold the A", line: "Hold the A" },
  { notes: "", line: "Hold the A" },
  { notes: "", line: "" },
  { notes: "Jamie", line: "" },
  { notes: "Jamie leads \t\n\n", line: "Hold the A" },
  { notes: `${NBSP}${BOM}`, line: "Pad" },
  { notes: NEXT_LINE, line: "Pad" },
  { notes: `Lead${NEXT_LINE}`, line: "Pad" },
  { notes: `Lead${LINE_SEPARATOR}`, line: "Pad" },
  { notes: "Hold the A (its third)", line: "Hold the A" },
  { notes: `e${COMBINING_ACUTE}`, line: "e" },
  { notes: "é", line: `e${COMBINING_ACUTE}` },
  { notes: "Café\r\n", line: "Pad" },
  { notes: "🙏 Pray", line: "🙏" },
];

const SUGGESTION_NOTE_CASES: readonly AdviceSegment[][] = [
  [
    { kind: "text", text: "End on " },
    { kind: "chord", text: "Gm" },
    { kind: "text", text: ", then C7." },
  ],
  [],
  [{ kind: "chord", text: "Ab7" }],
  [
    { kind: "text", text: "" },
    { kind: "chord", text: "" },
  ],
];

const DESCRIBE_EXTRAS: readonly { from: string; to: string }[] = [
  { from: "Eb", to: "H" },
  { from: "", to: "C" },
  { from: "(Female Lead) John", to: "C" },
  { from: "Ebmaj7", to: "F#m7" },
  { from: " Bbmin", to: "\tC" },
  { from: "A#", to: "Bb" },
  { from: "G#m", to: "Abm" },
  { from: "E#", to: "F" },
  { from: "Cb", to: "B" },
];

interface TempoInput {
  /** `null` stands for an `undefined` arrangement. */
  arrangement: { bpm: number | null; meter: string | null } | null;
}

const TEMPO_CASES: readonly TempoInput[] = [
  { arrangement: null },
  { arrangement: { bpm: null, meter: null } },
  { arrangement: { bpm: 78, meter: "6/8" } },
  { arrangement: { bpm: 72, meter: null } },
  { arrangement: { bpm: null, meter: "4/4" } },
  { arrangement: { bpm: 0, meter: "" } },
  { arrangement: { bpm: 72.5, meter: "3/4" } },
  { arrangement: { bpm: 120.25, meter: null } },
  { arrangement: { bpm: 0.1 + 0.2, meter: null } },
  { arrangement: { bpm: -1, meter: null } },
  { arrangement: { bpm: 1_000_000, meter: null } },
  { arrangement: { bpm: 1e21, meter: null } },
  { arrangement: { bpm: 123_456_789_012_345_680_000, meter: null } },
  { arrangement: { bpm: 1.5e300, meter: null } },
  { arrangement: { bpm: 1e-6, meter: null } },
  { arrangement: { bpm: 1e-7, meter: null } },
  { arrangement: { bpm: -1.5e-10, meter: null } },
  { arrangement: { bpm: 1.23e-4, meter: null } },
  { arrangement: { bpm: 2 ** 53 + 2, meter: null } },
  { arrangement: { bpm: -0, meter: null } },
  { arrangement: { bpm: null, meter: "" } },
  { arrangement: { bpm: 96, meter: "12/8 " } },
];

export const musicParitySuites: readonly ParitySuite[] = [
  defineParitySuite({
    name: "music.keySpellings",
    cases: [null],
    run: () => KEY_SPELLINGS,
  }),
  defineParitySuite({
    name: "music.keyTheory.parse",
    cases: PARSE_CASES,
    run: ({ value, minorOverride }) => parseMusicalKey(value, minorOverride),
  }),
  defineParitySuite({
    name: "music.keyTheory.key",
    cases: KEY_CASES,
    run: (key) => ({
      name: keyName(key),
      noteName: noteName(key),
      pitch: pitchOf(key),
      parallel: parallelOf(key),
      scale: scaleOf(key).map(noteView),
      diatonicTriads: diatonicTriads(key).map(chordView),
      predominant: chordView(predominantOf(key)),
      dominantSeventh: chordView(dominantSeventhOf(key)),
    }),
  }),
  defineParitySuite({
    name: "music.keyTheory.pairs",
    cases: pairsOf(DISTINCT_KEY_NAMES),
    run: ({ from, to }) => {
      const fromKey = spelledKey(from);
      const toKey = spelledKey(to);
      return {
        semitonesUp: semitonesUp(fromKey, toKey),
        circleOfFifthsDistance: circleOfFifthsDistance(fromKey, toKey),
        homeChordIsIn: homeChordIsIn(fromKey, toKey),
        dominantIsIn: dominantIsIn(fromKey, toKey),
        commonTones: commonTones(fromKey, toKey).map(noteName).join(" "),
        pivotChords: pivotChords(fromKey, toKey).map(pivotText).join(", "),
        commonToneChords: commonToneChords(fromKey, toKey)
          .map(commonToneText)
          .join("; "),
      };
    },
  }),
  defineParitySuite({
    name: "music.keyTransitionAdvice.rateKeyChange",
    cases: pairsOf(KEY_SPELLINGS),
    run: ({ from, to }) =>
      ratingView(rateKeyChange(spelledKey(from), spelledKey(to))),
  }),
  defineParitySuite({
    name: "music.keyTransitionAdvice.transitionSuggestions",
    cases: SUGGESTION_CASES,
    run: ({ fromTitle, toTitle, from, to, kind }) => {
      const fromKey = spelledKey(from);
      const toKey = spelledKey(to);
      return transitionSuggestions(
        { fromTitle, toTitle, fromKey, toKey },
        kind ?? rateKeyChange(fromKey, toKey).kind
      ).map(suggestionView);
    },
  }),
  defineParitySuite({
    name: "music.keyTransitionAdvice.rankAlternateKeys",
    cases: RANK_CASES,
    run: ({ from, to, candidates }) =>
      rankAlternateKeys(
        { fromKey: spelledKey(from), toKey: spelledKey(to) },
        (candidates === undefined ? KEY_SPELLINGS : candidates.split(" "))
          .filter((spelling) => spelling !== "")
          .map((spelling, index) => ({
            key: spelledKey(spelling),
            value: index,
          }))
      ),
  }),
  defineParitySuite({
    name: "music.keyTransitionAdvice.constants",
    cases: [null],
    run: () => ({ maxAlternateSemitones: MAX_ALTERNATE_SEMITONES }),
  }),
  defineParitySuite({
    name: "music.keyTransitionAdvice.appendNote",
    cases: APPEND_NOTE_CASES,
    run: ({ notes, line }) => appendNote(notes, line),
  }),
  defineParitySuite({
    name: "music.keyTransitionAdvice.suggestionNote",
    cases: SUGGESTION_NOTE_CASES,
    run: (segments) => suggestionNote({ id: "id", title: "Title", segments }),
  }),
  defineParitySuite({
    name: "music.songLibrary.describeKeyChange",
    cases: [...pairsOf(KEY_SPELLINGS), ...DESCRIBE_EXTRAS],
    run: ({ from, to }) => describeKeyChange(from, to),
  }),
  defineParitySuite({
    name: "music.songLibrary.tempoLabel",
    cases: TEMPO_CASES,
    run: ({ arrangement }) => tempoLabel(arrangement ?? undefined),
  }),
];

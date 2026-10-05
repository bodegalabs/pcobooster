/**
 * Parity suites for the iOS port of the chord chart text logic: keys and chords
 * (`chord-chart-chords.ts`), chart lines and transposition (`chord-chart.ts`), import
 * (`chord-chart-import.ts`), the lyrics search query (`apps/web/src/lib/lyrics-search.ts`),
 * and the editor's highlighting (`apps/web/src/components/songs/chord-chart-highlight.tsx`).
 * Swift replays them in `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Logic/ChordCharts/`.
 *
 * The TypeScript leans on JavaScript regular expressions and UTF-16 string indices, which
 * Swift does not share, so besides hand-picked corpora two seeded fuzz suites feed random
 * lines and charts built from tricky pieces (Unicode whitespace, long s, the Kelvin sign,
 * combining marks, emoji) through every function.
 */
import path from "node:path";

import {
  COLUMN_BREAK,
  PAGE_BREAK,
  isChordLine,
  isSectionHeading,
  transposeChordChartText,
} from "@pcobooster/planning-center-models/chord-chart";
import {
  CHORD_CHART_KEYS,
  isChord,
  keyName,
  parseChord,
  parseKey,
  semitonesBetween,
  transposeChordText,
  transposeKey,
} from "@pcobooster/planning-center-models/chord-chart-chords";
import type { MusicalKey } from "@pcobooster/planning-center-models/chord-chart-chords";
import {
  detectChordChartFormat,
  importChordChart,
  lyricsToChordChart,
  mergeChordsIntoLyrics,
} from "@pcobooster/planning-center-models/chord-chart-import";
import { z } from "zod";

import { lyricsSearchQueryFor } from "@/lib/lyrics-search";

import { defineParitySuite } from "./parity";
import type { ParitySuite } from "./parity";

// Characters JavaScript and Swift treat differently, built from code points so the source
// stays visible ASCII (the formatter also rewrites escaped dashes into real ones).
const char = (codePoint: number) => String.fromCodePoint(codePoint);
const EN_DASH = char(0x20_13);
const EM_DASH = char(0x20_14);
const NBSP = char(0xa0);
const NEXT_LINE = char(0x85);
const BOM = char(0xfe_ff);
const LINE_SEPARATOR = char(0x20_28);
const PARAGRAPH_SEPARATOR = char(0x20_29);
const IDEOGRAPHIC_SPACE = char(0x30_00);
const NARROW_NBSP = char(0x20_2f);
const COMBINING_ACUTE = char(0x3_01);
const COMBINING_TILDE = char(0x3_03);
const LONG_S = char(0x1_7f);
const KELVIN = char(0x21_2a);
const ARABIC_THREE = char(0x6_63);
const HYPHEN = char(0x20_10);

const chartKey = (name: string): MusicalKey => {
  const key = parseKey(name);
  if (key === null) {
    throw new Error(`Parity key ${name} did not parse`);
  }
  return key;
};

const optionalChartKey = (name: string | null): MusicalKey | null =>
  name === null ? null : chartKey(name);

// Keys and chords

const ROOTS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const ROOT_ACCIDENTALS = ["", "#", "b", "♯", "♭"] as const;
const SPELLED_ROOTS = ROOTS.flatMap((root) =>
  ROOT_ACCIDENTALS.map((accidental) => `${root}${accidental}`)
);

const PARSE_KEY_CASES: readonly (string | null)[] = [
  ...CHORD_CHART_KEYS,
  ...SPELLED_ROOTS.flatMap((root) =>
    ["", "m", "min", "-"].map((mode) => `${root}${mode}`)
  ),
  null,
  "",
  " ",
  "H",
  "Hm",
  "c",
  "cm",
  " C ",
  `${NBSP}D${BOM}`,
  `${NEXT_LINE}G`,
  `G${NEXT_LINE}`,
  `\t\nAm\r\n`,
  `${IDEOGRAPHIC_SPACE}Eb${LINE_SEPARATOR}`,
  "Cmaj",
  "CM",
  "Cmi",
  "Cminor",
  "C#m7",
  "C m",
  "Cmm",
  "C--",
  "C#b",
  "Bbb",
  "G/B",
  `A${COMBINING_ACUTE}`,
  "(G)",
];

const KEY_NAME_CASES: readonly { pitch: number; minor: boolean }[] = Array.from(
  { length: 29 },
  (_, index) => index - 14
).flatMap((pitch) => [
  { pitch, minor: false },
  { pitch, minor: true },
]);

const SEMITONE_SHIFTS: readonly number[] = [
  ...Array.from({ length: 25 }, (_, index) => index - 12),
  -100,
  -25,
  -13,
  13,
  25,
  100,
];

const QUALITIES: readonly string[] = [
  "",
  "m",
  "M",
  "7",
  "m7",
  "maj7",
  "M7",
  "sus",
  "sus2",
  "sus4",
  "add9",
  "add2",
  "2",
  "5",
  "6",
  "9",
  "11",
  "13",
  "dim",
  "dim7",
  "°",
  "°7",
  "ø",
  "ø7",
  "∆",
  "∆7",
  "Δ7",
  "aug",
  "+",
  "+5",
  "-",
  "-7",
  "m7b5",
  "7b9",
  "7#9",
  "7(b9)",
  "7(#11)",
  "(add9)",
  "m(maj7)",
  "mmaj7",
  "7alt",
  "omit3",
  "no3",
  "min",
  "min7",
  "mi",
  "maj",
  "ma7",
  "b5",
  "#5",
  "♭9",
  "♯11",
  "7,9",
  "x",
  "e",
  "lo",
  "ad",
  "nd",
  "ug",
  " ",
  "\t",
  "\n",
  "m ",
  `m${NBSP}`,
  `${LONG_S}us4`,
  KELVIN,
  "MAJ7",
  "Sus4",
  "dimm",
  "omi",
  "susus",
  "|",
  "[",
  "]",
  "{",
  "}",
  "%",
  ".",
  EN_DASH,
  "🎸",
  COMBINING_ACUTE,
];

const BASSES: readonly string[] = [
  "",
  "/E",
  "/F#",
  "/Bb",
  "/G♭",
  "/C♯",
  "/H",
  "/",
  "/e",
  "/Eb/G",
  "/Ebb",
  "/E7",
  "/B#",
  "/Cb",
];

const WORDS: readonly string[] = [
  "Be",
  "Amazing",
  "God",
  "x2",
  "Hello",
  "And",
  "Am",
  "Bad",
  "Come",
  "Did",
  "Ebb",
  "Add",
  "A",
  "",
  " ",
  "G ",
  " G",
  "/G",
  "G//B",
  "N.C.",
  "C/",
  "C/E/G",
  `C${COMBINING_ACUTE}`,
];

const PARSE_CHORD_CASES: readonly string[] = [
  ...SPELLED_ROOTS,
  ...SPELLED_ROOTS.map((root) => `${root}m7/E`),
  ...QUALITIES.flatMap((quality, qualityIndex) =>
    BASSES.map(
      (bass, bassIndex) =>
        `${SPELLED_ROOTS[(qualityIndex * 13 + bassIndex * 7) % SPELLED_ROOTS.length] ?? "C"}${quality}${bass}`
    )
  ),
  ...WORDS,
];

const ALL_ROOTS_TEXT =
  "C C# Db D D# Eb E F F# Gb G G# Ab A A# Bb B Cb B# E# Fb C/E Am/G F#m7b5/C# B♭/D♭";

const TRANSPOSE_TEXTS: readonly string[] = [
  "G D/F# Em7 Csus2",
  "E B/D# C#m",
  "D A/C#",
  "A E/G#",
  "A#",
  "N.C. x2",
  "C/E/G",
  "Cm/Ebm",
  "|C|G|",
  "[G]Amazing",
  "{C}",
  "Am Bad Come God Did",
  "Ab♭",
  "B♯ E# Fb Cb",
  `C\tG${NBSP}D`,
  "Gsus4(add9)/B",
  "C-7",
  "F♯m7♭5/C♯",
  "Ç D",
  "Am\r",
  `A${COMBINING_ACUTE}m`,
  "C/H",
  "Bb/",
  "E/",
  "GG",
  "Am7b5Bb",
  "Em/D#m",
  "D/F#m",
  "C🎸G",
  "",
  "no chords here",
];

const TARGET_NAMES: readonly (string | null)[] = [null, ...CHORD_CHART_KEYS];
const TRANSPOSE_SHIFTS: readonly number[] = [
  -13, -7, -1, 0, 1, 2, 5, 6, 11, 12, 25,
];

interface TransposeChordTextInput {
  text: string;
  semitones: number;
  target: string | null;
}

const TRANSPOSE_CHORD_TEXT_CASES: readonly TransposeChordTextInput[] = [
  ...TRANSPOSE_TEXTS.flatMap((text, textIndex) =>
    TARGET_NAMES.map((target, targetIndex) => ({
      text,
      semitones:
        TRANSPOSE_SHIFTS[(textIndex + targetIndex) % TRANSPOSE_SHIFTS.length] ??
        0,
      target,
    }))
  ),
  ...TARGET_NAMES.flatMap((target) =>
    Array.from({ length: 12 }, (_, semitones) => ({
      text: ALL_ROOTS_TEXT,
      semitones,
      target,
    }))
  ),
  { text: "G D/F# Em7 Csus2", semitones: 2, target: "A" },
  { text: "E B/D# C#m", semitones: 1, target: "F" },
  { text: "D A/C#", semitones: -2, target: "C" },
  { text: "A E/G#", semitones: 1, target: "Bb" },
  { text: "A#", semitones: 0, target: "C" },
  { text: "N.C. x2", semitones: 3, target: "E" },
];

// Chart lines

const SECTION_NAMES: readonly string[] = [
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
];

const titleCase = (value: string) =>
  `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;

const HEADING_SUFFIXES: readonly string[] = [
  "",
  " 1",
  "2",
  " 2a",
  " 10B",
  " x2",
  "x2",
  " (x2)",
  "(×3)",
  " X 4",
  " ( x 2 )",
  " (softly)",
  " 2 (x3) (soft)",
  ":",
  " :",
  " 1:",
  "  ",
  " 2 x2 (to bridge):",
  " 2b:",
  " 2bb",
  " x2x",
  " ()",
  " (a)(b)",
  " (a) (b)",
  " (",
  " (x)",
  " 1 2",
  ` ${ARABIC_THREE}`,
  `${NBSP}1`,
  BOM,
  NEXT_LINE,
  " ::",
  " - 2",
  "s",
  " 2 (",
  " (x2",
  " x 2)",
  "(2)",
  ` 2${LONG_S}`,
  ` 2${KELVIN}`,
];

const HEADING_CASES: readonly string[] = [
  ...SECTION_NAMES.flatMap((name) => [
    name,
    name.toUpperCase(),
    titleCase(name),
  ]),
  ...SECTION_NAMES.flatMap((name, nameIndex) =>
    HEADING_SUFFIXES.filter(
      (_, suffixIndex) => (nameIndex + suffixIndex) % 3 === 0
    ).map((suffix) => `${name.toUpperCase()}${suffix}`)
  ),
  ...HEADING_SUFFIXES.map((suffix) => `Chorus${suffix}`),
  "VERSE 1",
  "Chorus",
  "PRE-CHORUS",
  "Bridge 2:",
  "TAG (x2)",
  "CHORUS 2x",
  "INSTRUMENTAL",
  "Verse of my life",
  "Amazing grace",
  "[G]Chorus",
  "Choruses",
  "Verse1a1",
  "Tagline",
  "pre  chorus",
  `Pre${HYPHEN}Chorus`,
  `${LONG_S}olo`,
  `hoo${KELVIN}`,
  `VER${LONG_S}E 2`,
  `  Chorus  `,
  `${LINE_SEPARATOR}Chorus${PARAGRAPH_SEPARATOR}`,
  `${NEXT_LINE}Chorus`,
  "",
  " ",
  ":",
  "Chorus [x2]",
  "Verse (Chorus [G])",
  "İntro",
  "ıntro",
];

const CHORD_LINE_CASES: readonly string[] = [
  "D          Bm       G          D",
  "| G | D/F# | Em | C | x2",
  "Be thou my vision",
  "A mighty fortress",
  "G <t>",
  "G <T> D",
  "G [D]",
  "N.C.",
  "N.C. G",
  "n.c G",
  "NC G",
  "N.c. G",
  "NCC G",
  "G (x2)",
  "G x2",
  "G X2",
  "G ×2",
  "G (×10)",
  "G x",
  "G (x2",
  "G x2)",
  "G -",
  `G ${EN_DASH} D`,
  `G ${EM_DASH} D`,
  "G % ",
  "G . :",
  "G (Dsus)",
  "G ()",
  "G (",
  "G )",
  "G ||",
  "G |||",
  "G /",
  "G //",
  "",
  "   ",
  "x2",
  "(G)",
  "G\r",
  `G${NBSP}D`,
  `G${NEXT_LINE}D`,
  `G${BOM}D`,
  `G${NARROW_NBSP}D`,
  "Am Bad",
  "C/E/G",
  "Em7 A7sus4 Dmaj7/F#",
  "G  D  Em  C  (Instrumental)",
  "G D Em C <b>",
  `G (🎸) D`,
  "|: G D :|",
  "G2 Dsus4 Em7 Cadd9",
  "Bb F/A Gm Eb",
];

interface TransposeChartInput {
  text: string;
  from: string;
  to: string;
}

const CHARTS: readonly string[] = [
  "VERSE\n[E]Beyond [C#m]all\nE    B\nLyrics here",
  "E    B  \r\n[E]Beyond\r\n",
  "C    G    Am   F\nAmazing grace how sweet",
  "C G Am F\nC  G  Am  F",
  "E       B/D#    C#m7    A2\nPraise the name of Je-sus",
  "  E\nIndented chord",
  `E    B\nn${COMBINING_TILDE}a${COMBINING_TILDE}o lyric\nE  (🎸)  B  E\n사랑해 사랑해`,
  "E\tB\tA\nTabbed chords",
  `E    B${NBSP}${NBSP}\nTrailing nbsp`,
  "COLUMN_BREAK\nE B\nPAGE_BREAK\n[E]Line [B/D#]two",
  "[[E]] [E [] [E]] [B/D#] [N.C.] [x2] [Esus4(add9)/G#]",
  "| E | B | C#m | A | x2\nN.C.\nE . . . | B . . .",
  "CHORUS 2x\nE B C#m A\n\nBRIDGE\n[A]Oh [E]oh",
  "{comment: E}\n{{E}}\nE B\n<t>E B</t>",
  "E\n\n\nB\n",
  "",
  "\n",
  "E B E B E B E B E B E B E B E B E B E B E B E B",
  "Fb Cb E# B# Ebm",
];

const KEY_PAIRS: readonly { from: string; to: string }[] = [
  { from: "E", to: "G" },
  { from: "C", to: "F#" },
  { from: "G", to: "F" },
  { from: "Bb", to: "B" },
  { from: "Am", to: "Cm" },
  { from: "C#m", to: "Em" },
  { from: "E", to: "E" },
  { from: "F#", to: "C" },
  { from: "E", to: "Db" },
  { from: "Ebm", to: "Am" },
];

const TRANSPOSE_CHART_CASES: readonly TransposeChartInput[] = CHARTS.flatMap(
  (text, textIndex) =>
    KEY_PAIRS.filter((_, pairIndex) => (textIndex + pairIndex) % 2 === 0).map(
      ({ from, to }) => ({ text, from, to })
    )
);

// Import

interface MergeInput {
  chordLine: string;
  lyricLine: string;
}

const MERGE_CASES: readonly MergeInput[] = [
  {
    chordLine: "D          Bm       G",
    lyricLine: "Be thou my vision O Lord of my heart",
  },
  { chordLine: "G       D", lyricLine: "Amen" },
  { chordLine: "", lyricLine: "Just lyrics  " },
  { chordLine: "   ", lyricLine: "Just lyrics" },
  { chordLine: "  G", lyricLine: "Indented" },
  { chordLine: "G", lyricLine: "" },
  { chordLine: "G     C", lyricLine: "🙏 Praise him" },
  // Columns count UTF-16 units: C lands after both emoji. A column inside a
  // surrogate pair would leave lone halves, which Swift strings cannot hold.
  { chordLine: "G   C", lyricLine: "🙏🙏 Praise" },
  {
    chordLine: "G     C",
    lyricLine: `n${COMBINING_TILDE}a${COMBINING_TILDE}o lyric`,
  },
  { chordLine: "G     C     D", lyricLine: "사랑해 사랑해" },
  { chordLine: "G\tC", lyricLine: "Tab\tbed" },
  { chordLine: "G C", lyricLine: `Trailing${NBSP}${BOM}` },
  { chordLine: "| G | C |", lyricLine: "Bars over words" },
  { chordLine: `G${NEXT_LINE}C`, lyricLine: "Next line" },
  { chordLine: "G🎸 C", lyricLine: "Emoji in a chord token" },
];

const IMPORT_TEXTS: readonly string[] = [
  [
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
  ].join("\n"),
  "Verse 1\nG       C\nAmazing grace\n\n| G | D |\n",
  "[Verse 1]\nAmazing grace\nHow sweet the sound\n\n\n\nChorus:\nMy chains are gone\n\n© 2006 Worship Together\nCCLI License # 11111",
  "VERSE\n[G]Amazing grace",
  [
    "{t:Song}",
    "{ title : Spaced }",
    "{Title: Upper}",
    "{TITLE}",
    "{artist: Someone}",
    "{a: Another}",
    "{time: 6/8}",
    "{tempo:}",
    "{key: G }",
    "{start_of_chorus: Chorus 2}",
    "[G]Chorus line",
    "{sov}",
    "{start_of_verse}",
    "{sob: Bridge}",
    "{start_of_bridge}",
    "{c: (Softly)}",
    "{ci: Chorus}",
    "{cb: Hold}",
    "{highlight: Tag x2}",
    "{comment_italic}",
    "{np}",
    "{npp}",
    "{column_break}",
    "{colb}",
    "{eoc}",
    "{capo: 2}",
    "{ccli: 123}",
    "{x_custom: y}",
    "{c:}",
    "{c: }",
    "{c}",
    "{title: A } B}",
    "{title:\tTabbed\t}",
    `{${LONG_S}oc}`,
    `{${KELVIN}ey: E}`,
    "{_}",
    "{1}",
    "{t: Value with {braces}}",
    "{c x}",
    "{c  :  spaced  }",
    `{c: before${LINE_SEPARATOR}after}`,
    `{c:${LINE_SEPARATOR}leading}`,
    "  # indented comment",
    "#comment",
    "Verse 2:",
    "[G]Last line   ",
  ].join("\n"),
  "{title: Song}\r\n[G]Line\r\n{soc}\r\n[C]Chorus\r\n",
  "[Verse 1]\nG       C\nAmazing grace\n(Chorus):\nG    D\n\nG  D  Em\nVerse 2:\nC\n\nG   D\nLast\n   \nD\n",
  "G C\nD Em\nLyric under two chord lines\nC\r\nWindows lyric\r\nG\n[Chorus]\n",
  "Bridge\nG\tD\nTab\tbed line\nG\n",
  "[G]Amazing grace\n[Chorus]\nPlain",
  "[Chorus]\n[Verse 1]\nWords only",
  "Plain lyrics\nNo chords at all\n",
  [
    "Line",
    "CCLI Song # 123",
    "ccli  license 1",
    "CCLI Licence",
    "© 2020",
    "(c) 2020",
    "(C) Someone",
    "Copyright 2020",
    "Copyrights",
    `copyright${LONG_S}`,
    `ccli${NBSP}song`,
    `ccli ${LONG_S}ong`,
    `CCLI ${KELVIN}`,
    "For use solely with the SongSelect Terms",
    "Note: Reproduction",
    "note:reproduction",
    "www.ccli.com",
    "wwwXccli.com",
    "SongSelect",
    "SongSelected",
    "songselect®",
    "  © leading spaces",
    "Not a © footer",
    "Last line",
  ].join("\n"),
  `Trailing   \nSpaces\t \n\n\n\n\nGap${LINE_SEPARATOR}  ${LINE_SEPARATOR}x  \n  \n`,
  `   \n\n  Leading blank lines\n${NBSP}`,
  "",
  "\n\n",
  "[G]",
  "[]",
  "[ ]",
  "Chorus\n[G]",
  "Verse 1\n[G]\n",
];

const LYRICS_TEXTS: readonly string[] = [
  [
    "Verse one line",
    "Still verse one",
    "",
    "Chorus line",
    "Sing it again",
    "",
    "Verse two line",
    "",
    "Chorus line",
    "Sing it again!",
    "",
    "Bridge line",
    "",
    "Tag line",
    "",
    "Tag line",
  ].join("\n"),
  "Chorus\nSing it\n\nVerse 2\nMore",
  "One line\nAnother line",
  "A\r\nB\r\n\r\nC\r\nD\r\n\r\nA\r\nB",
  "First\n  \nSecond\n\t\n\nFirst",
  `First\n${NBSP}\nSecond`,
  `First\n${LINE_SEPARATOR}\nSecond`,
  "ΑΣ ΒΑ\nline\n\nΑΣΒΑ\nline",
  "ΑΣ\n\nΑΣ\n\nΟΔΟΣ ΜΟΥ\n\nοδος μου",
  `Café\n\nCafe${COMBINING_ACUTE}\n\nCAFÉ`,
  "Hello 🙏\n\nhello\n\nHELLO!!!",
  "One\n\nTwo\n\nOne\n\nTwo\n\nThree",
  "© 2020 Someone\n\nVerse\n\nChorus",
  "Only\n\n",
  "\n\n\n",
  "",
  "  Indented\n  lines  \n\n  Second  stanza  ",
  "A\n\nB\n\nC\n\nD\n\nA\n\nC",
];

const QUERY_CASES: readonly { title: string; author: string }[] = [
  { title: "Amazing Grace", author: "John Newton" },
  { title: "Way Maker", author: "Sinach, Someone Else" },
  { title: "Song", author: "Chris Tomlin & Matt Redman" },
  { title: "Song", author: "Brian Johnson and Jenn Johnson" },
  { title: "Song", author: "Alexander Andrews" },
  { title: "Song", author: "Sandy" },
  { title: "Song", author: "Rand and Band" },
  { title: "Song", author: "Tomás and Ana" },
  { title: "Song", author: "éand friends" },
  { title: "Song", author: "and Someone" },
  { title: "Song", author: "Someone and" },
  { title: "Song", author: "AND Caps" },
  { title: "Song", author: `x${LONG_S}and y` },
  { title: "Song", author: "_and_ underscores and more" },
  { title: "Song", author: "1and2 and 3" },
  { title: "Song", author: "" },
  { title: "", author: "" },
  { title: "", author: "Only Author" },
  { title: "  Spaced Title  ", author: `  Spaced${NBSP}Author ,x` },
  { title: "Song", author: `${BOM}Bom Author` },
  { title: "Song", author: `Next${NEXT_LINE}Line` },
  { title: "Song", author: ", Leading comma" },
  { title: "Song", author: "&" },
  { title: "Song", author: "Hillsong Worship" },
];

// Highlighting

const HIGHLIGHT_TEXTS: readonly string[] = [
  "VERSE 1\n[G]Amazing [C]grace\nG    C\nHow sweet the sound",
  [
    "{{chart only note}}",
    "COLUMN_BREAK",
    "  page_break  ",
    "TRANSPOSE KEY +2",
    "transpose key - 3",
    "REDEFINE KEY 5",
    "TRANSPOSE KEY",
    "TRANSPOSE  KEY+1",
    "{{a}} b",
    "{{a}}}",
    `{{a${LINE_SEPARATOR}}}`,
    LONG_S,
    `COLUMN_BREA${KELVIN}`,
    `TRAN${LONG_S}POSE KEY 1`,
    "{ Softly }",
    "{a}}",
    " {x} ",
    `{a${LINE_SEPARATOR}}`,
    "{",
    "{}",
  ].join("\n"),
  "Chorus:\n[Chorus]\ntext [G] more\n[G\n[]\n[a]b[c\n[a[b]c]",
  "Line one\r\nG D\r\n[G]Two\r\n",
  "\n\n",
  "",
  "Trailing newline\n",
  `🙏 [G]Emoji ${NBSP}lyric\n사랑해 [C]사랑\nE  (🎸)  B`,
  "<t>G D</t>\nG <t> D",
  "VERSE 2 (x2):\nBRIDGE\nN.C.\n| G | D |",
];

// Fuzz

/** Park and Miller's minimal standard generator, so fixtures stay reproducible. */
const createRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
};

const pick = <T>(random: () => number, items: readonly T[]): T => {
  const item = items.at(Math.floor(random() * items.length));
  if (item === undefined) {
    throw new Error("Cannot pick from an empty list");
  }
  return item;
};

const BMP_PIECES: readonly string[] = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "m",
  "maj",
  "7",
  "sus4",
  "add9",
  "#",
  "b",
  "♯",
  "♭",
  "/",
  "|",
  "||",
  "[",
  "]",
  "{",
  "}",
  "(",
  ")",
  ":",
  "x2",
  "×3",
  "N.C.",
  "%",
  ".",
  "-",
  EN_DASH,
  EM_DASH,
  " ",
  " ",
  "  ",
  "    ",
  "\t",
  NBSP,
  BOM,
  NEXT_LINE,
  LINE_SEPARATOR,
  "\r",
  "verse",
  "Chorus",
  "PRE-CHORUS",
  "Bridge 2",
  "tag",
  "{c: Verse}",
  "{soc}",
  "{title: T}",
  "©",
  "ccli song",
  "copyright",
  "<t>",
  "COLUMN_BREAK",
  "PAGE_BREAK",
  "{{x}}",
  "TRANSPOSE KEY +1",
  "Amazing",
  "grace",
  "é",
  `n${COMBINING_TILDE}`,
  "사랑",
  LONG_S,
  KELVIN,
  "1",
  "2a",
  "and",
  "&",
  ",",
];

const CHORD_PIECES: readonly string[] = [
  "G",
  "D/F#",
  "Em7",
  "C",
  "Am",
  "Bb",
  "F#m7b5",
  "Dsus4",
  "A2",
  "E/G#",
  "Cmaj7",
  "C♯m",
  "Ab♭",
  "Gsus",
  "N.C.",
  "nc",
  "x2",
  "(x3)",
  "×4",
  "|",
  "||",
  "%",
  "-",
  EN_DASH,
  "/",
  ".",
  ":",
  "(Dsus)",
  "(🎸)",
  "H",
  "Bad",
  "<t>",
];

const CHORD_SEPARATORS: readonly string[] = [
  " ",
  " ",
  "  ",
  "    ",
  "\t",
  NBSP,
  BOM,
  NEXT_LINE,
];

const LYRIC_WORDS: readonly string[] = [
  "Amazing",
  "grace",
  "how",
  "sweet",
  "the",
  "sound",
  "and",
  "Am",
  "God",
  "é",
  `n${COMBINING_TILDE}o`,
  `[G]${COMBINING_ACUTE}a`,
  "사랑",
  "ΑΣ",
  "[G]",
  "[D/F#]",
  "[Em7]",
  "[N.C.]",
  "[",
  "]",
  "[]",
  "[[C]",
  "{",
  "}",
];

const HEADING_PIECES: readonly string[] = [
  " 1",
  "2",
  " 2a",
  " x2",
  " (x2)",
  "(×3)",
  ":",
  " (softly)",
  " ",
  LONG_S,
  KELVIN,
  ")",
  "(",
  "x",
  " 10B",
  NBSP,
];

const DIRECTIVE_NAMES: readonly string[] = [
  "title",
  "t",
  "artist",
  "soc",
  "eoc",
  "sov",
  "c",
  "comment",
  "np",
  "colb",
  "key",
  "x_y",
  `${LONG_S}oc`,
  `${KELVIN}ey`,
  "1",
];

const DIRECTIVE_SEPARATORS: readonly string[] = [
  ":",
  ": ",
  " ",
  "  :  ",
  "",
  "\t",
  LINE_SEPARATOR,
];

const DIRECTIVE_VALUES: readonly string[] = [
  "Verse 1",
  "Chorus",
  "G",
  "",
  "A } B",
  "x",
  "(Bridge)",
  `a${LINE_SEPARATOR}b`,
];

const CODE_LINES: readonly string[] = [
  "{{x}}",
  "COLUMN_BREAK",
  "page_break",
  "TRANSPOSE KEY +2",
  "REDEFINE KEY -1",
  "transpose key",
  "{ Softly }",
  "{a}}",
  "{{",
];

const FOOTER_LINES: readonly string[] = [
  "© 2020",
  "CCLI Song # 1",
  "ccli licence 2",
  "Copyright",
  "copyrights",
  "SongSelect®",
  "(c) Someone",
];

const repeat = (random: () => number, most: number, make: () => string) =>
  Array.from({ length: 1 + Math.floor(random() * most) }, make);

const chordLineOf = (random: () => number) =>
  repeat(
    random,
    6,
    () => `${pick(random, CHORD_PIECES)}${pick(random, CHORD_SEPARATORS)}`
  ).join("");

/** Lyrics with inline chords; no emoji, so merging chords into them never splits one. */
const lyricLineOf = (random: () => number) =>
  repeat(random, 7, () => pick(random, LYRIC_WORDS)).join(
    random() < 0.8 ? " " : ""
  );

/** Lines of one kind or another, so every branch sees input close to its own. */
const LINE_MAKERS: readonly ((random: () => number) => string)[] = [
  chordLineOf,
  lyricLineOf,
  (random) => {
    const name = pick(random, SECTION_NAMES);
    const cased = random() < 0.5 ? name.toUpperCase() : titleCase(name);
    const heading = `${cased}${repeat(random, 3, () => pick(random, HEADING_PIECES)).join("")}`;
    return pick(random, [
      heading,
      `[${heading}]`,
      `(${heading}):`,
      ` ${heading} `,
    ]);
  },
  (random) =>
    `${pick(random, ["{", " {"])}${pick(random, DIRECTIVE_NAMES)}${pick(random, DIRECTIVE_SEPARATORS)}${pick(random, DIRECTIVE_VALUES)}${pick(random, ["}", " }", "} "])}`,
  (random) =>
    `${pick(random, ["", " ", "\t"])}${pick(random, CODE_LINES)}${pick(random, ["", " ", "\r"])}`,
  (random) => pick(random, FOOTER_LINES),
  (random) => repeat(random, 8, () => pick(random, BMP_PIECES)).join(""),
  (random) =>
    repeat(random, 8, () => pick(random, [...BMP_PIECES, "🙏", "🎸"])).join(""),
];

const randomLine = (random: () => number): string =>
  pick(random, LINE_MAKERS)(random);

const randomChart = (random: () => number): string => {
  const separator = random() < 0.2 ? "\r\n" : "\n";
  return repeat(random, 10, () =>
    random() < 0.2 ? "" : randomLine(random)
  ).join(separator);
};

const randomMerge = (random: () => number): MergeInput => ({
  chordLine: random() < 0.8 ? chordLineOf(random) : lyricLineOf(random),
  lyricLine: lyricLineOf(random),
});

const fuzzRandom = createRandom(20_261_001);
const FUZZ_LINES: readonly string[] = Array.from({ length: 400 }, () =>
  randomLine(fuzzRandom)
);
const FUZZ_MERGES: readonly MergeInput[] = Array.from({ length: 150 }, () =>
  randomMerge(fuzzRandom)
);
const FUZZ_CHARTS: readonly string[] = Array.from({ length: 250 }, () =>
  randomChart(fuzzRandom)
);

const keyE = chartKey("E");
const keyAb = chartKey("Ab");

/**
 * Merging counts columns in UTF-16 units, so a chord over the middle of an emoji splits its
 * surrogate pair. Swift strings cannot hold the lone halves, so such a case cannot be replayed.
 */
const replayableMerge = ({ chordLine, lyricLine }: MergeInput): string => {
  const merged = mergeChordsIntoLyrics(chordLine, lyricLine);
  if (!merged.isWellFormed()) {
    throw new Error(
      `Merging ${JSON.stringify(chordLine)} splits a surrogate pair in ${JSON.stringify(lyricLine)}`
    );
  }
  return merged;
};

/**
 * The editor highlighter returns React nodes; the parity suite reads which spans it made.
 * The component is a `.tsx` file, which the root TypeScript project cannot compile, so it is
 * loaded at run time and its output is parsed against the shape it renders.
 */
const HIGHLIGHT_MODULE_PATH = path.join(
  import.meta.dirname,
  "../../apps/web/src/components/songs/chord-chart-highlight.tsx"
);
const highlightModule: unknown = await import(HIGHLIGHT_MODULE_PATH);
const { highlightChordChart } = z
  .object({
    highlightChordChart: z.function({
      input: [z.string()],
      output: z.unknown(),
    }),
  })
  .parse(highlightModule);

type HighlightKind =
  | "code"
  | "note"
  | "section-heading"
  | "chord-line"
  | "inline-chord"
  | "lyric";

interface HighlightToken {
  kind: HighlightKind;
  start: number;
  end: number;
}

interface HighlightPiece {
  kind: HighlightKind;
  text: string;
}

/** The class on each span that colors a whole line. */
const LINE_CLASSES = [
  "text-chart-4",
  "text-muted-foreground",
  "text-status-scheduled",
  "text-status-info",
] as const;

const LINE_KIND_BY_CLASS: Record<(typeof LINE_CLASSES)[number], HighlightKind> =
  {
    "text-chart-4": "code",
    "text-muted-foreground": "note",
    "text-status-scheduled": "section-heading",
    "text-status-info": "chord-line",
  };

/** A line colored as a whole, such as a heading: one span holding its text. */
const wholeLineSchema = z
  .object({
    props: z.object({ className: z.enum(LINE_CLASSES), children: z.string() }),
  })
  .transform(({ props }): HighlightPiece[] => [
    { kind: LINE_KIND_BY_CLASS[props.className], text: props.children },
  ]);

/** Lyrics as plain strings, with a span around each inline chord. */
const inlinePiecesSchema = z.array(
  z.union([
    z.string().transform((text): HighlightPiece => ({ kind: "lyric", text })),
    z
      .object({ props: z.object({ children: z.string() }) })
      .transform(({ props }): HighlightPiece => ({
        kind: "inline-chord",
        text: props.children,
      })),
  ])
);

/** Each line is a span holding its pieces, then a newline unless it ends the chart. */
const highlightedChartSchema = z.array(
  z
    .object({
      props: z.object({
        children: z.tuple([
          z.union([inlinePiecesSchema, wholeLineSchema]),
          z.literal("\n").nullable(),
        ]),
      }),
    })
    .transform(
      ({
        props: {
          children: [pieces, newline],
        },
      }) => ({
        pieces,
        newline: newline !== null,
      })
    )
);

/** The highlighted pieces as UTF-16 ranges, without the newlines between lines. */
const highlightTokens = (text: string): HighlightToken[] => {
  const tokens: HighlightToken[] = [];
  let offset = 0;
  const lines = highlightedChartSchema.parse(highlightChordChart(text));
  for (const { pieces, newline } of lines) {
    for (const piece of pieces) {
      if (piece.text.length > 0) {
        tokens.push({
          kind: piece.kind,
          start: offset,
          end: offset + piece.text.length,
        });
      }
      offset += piece.text.length;
    }
    offset += newline ? 1 : 0;
  }
  if (offset !== text.length) {
    throw new Error("Highlighting changed the chart's length");
  }
  return tokens;
};

export const chordChartParitySuites: readonly ParitySuite[] = [
  defineParitySuite({
    name: "chordcharts.chords.constants",
    cases: [null],
    run: () => ({
      chartKeys: CHORD_CHART_KEYS,
      columnBreak: COLUMN_BREAK,
      pageBreak: PAGE_BREAK,
    }),
  }),
  defineParitySuite({
    name: "chordcharts.chords.keyName",
    cases: KEY_NAME_CASES,
    run: ({ pitch, minor }) => keyName(pitch, minor),
  }),
  defineParitySuite({
    name: "chordcharts.chords.parseKey",
    cases: PARSE_KEY_CASES,
    run: (value) => parseKey(value),
  }),
  defineParitySuite({
    name: "chordcharts.chords.transposeKey",
    cases: CHORD_CHART_KEYS.flatMap((key) =>
      SEMITONE_SHIFTS.map((semitones) => ({ key, semitones }))
    ),
    run: ({ key, semitones }) => transposeKey(chartKey(key), semitones),
  }),
  defineParitySuite({
    name: "chordcharts.chords.semitonesBetween",
    cases: CHORD_CHART_KEYS.flatMap((from) =>
      CHORD_CHART_KEYS.map((to) => ({ from, to }))
    ),
    run: ({ from, to }) => semitonesBetween(chartKey(from), chartKey(to)),
  }),
  defineParitySuite({
    name: "chordcharts.chords.parseChord",
    cases: PARSE_CHORD_CASES,
    run: (value) => ({ chord: parseChord(value), isChord: isChord(value) }),
  }),
  defineParitySuite({
    name: "chordcharts.chords.transposeChordText",
    cases: TRANSPOSE_CHORD_TEXT_CASES,
    run: ({ text, semitones, target }) =>
      transposeChordText(text, semitones, optionalChartKey(target)),
  }),
  defineParitySuite({
    name: "chordcharts.chart.isSectionHeading",
    cases: HEADING_CASES,
    run: (line) => isSectionHeading(line),
  }),
  defineParitySuite({
    name: "chordcharts.chart.isChordLine",
    cases: CHORD_LINE_CASES,
    run: (line) => isChordLine(line),
  }),
  defineParitySuite({
    name: "chordcharts.chart.transposeChordChartText",
    cases: TRANSPOSE_CHART_CASES,
    run: ({ text, from, to }) =>
      transposeChordChartText(text, chartKey(from), chartKey(to)),
  }),
  defineParitySuite({
    name: "chordcharts.import.mergeChordsIntoLyrics",
    cases: MERGE_CASES,
    run: replayableMerge,
  }),
  defineParitySuite({
    name: "chordcharts.import.importChordChart",
    cases: IMPORT_TEXTS,
    run: (text) => ({
      detected: detectChordChartFormat(text),
      imported: importChordChart(text),
    }),
  }),
  defineParitySuite({
    name: "chordcharts.import.lyricsToChordChart",
    cases: LYRICS_TEXTS,
    run: (text) => lyricsToChordChart(text),
  }),
  defineParitySuite({
    name: "chordcharts.lyricsSearchQuery",
    cases: QUERY_CASES,
    run: ({ title, author }) => lyricsSearchQueryFor(title, author),
  }),
  defineParitySuite({
    name: "chordcharts.highlight",
    cases: [...HIGHLIGHT_TEXTS, ...CHARTS, ...IMPORT_TEXTS],
    run: highlightTokens,
  }),
  defineParitySuite({
    name: "chordcharts.fuzz.lines",
    cases: FUZZ_LINES,
    run: (line) => ({
      sectionHeading: isSectionHeading(line),
      chordLine: isChordLine(line),
      chord: parseChord(line),
      transposed: transposeChordText(line, 3, keyE),
      query: lyricsSearchQueryFor(line, line),
    }),
  }),
  defineParitySuite({
    name: "chordcharts.fuzz.merges",
    cases: FUZZ_MERGES,
    run: replayableMerge,
  }),
  defineParitySuite({
    name: "chordcharts.fuzz.charts",
    cases: FUZZ_CHARTS,
    run: (text) => ({
      imported: importChordChart(text),
      lyricsChart: lyricsToChordChart(text),
      transposed: transposeChordChartText(text, keyE, keyAb),
      tokens: highlightTokens(text),
    }),
  }),
];

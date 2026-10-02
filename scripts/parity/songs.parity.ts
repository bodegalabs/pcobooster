import {
  previousSongBefore,
  songHistoryCountLabel,
  songPreviewFacts,
  summarizeSongHistory,
  tempoLabel,
} from "@/lib/song-library";
import type {
  PreviousSong,
  SongHistorySummary,
  SongPreviewFacts,
} from "@/lib/song-library";
import {
  DEFAULT_SONG_LIBRARY_FILTER,
  DEFAULT_SONG_LIBRARY_SORT,
  monthsBefore,
  parseSongLibraryFilter,
  parseSongLibrarySort,
  planningCenterSongUrl,
  selectSongLibrary,
  songLibraryCutoff,
  songLibraryFilters,
  songLibrarySorts,
} from "@/lib/songs-index";
import type {
  SongLibraryFilter,
  SongLibrarySort,
  SongLibraryView,
} from "@/lib/songs-index";

import type { PlanItem } from "../../packages/contracts/src/plan-item-schemas";
import { arrangementOptionSchema } from "../../packages/contracts/src/song-schemas";
import type { ArrangementOption } from "../../packages/contracts/src/song-schemas";
import {
  songHistoryEntrySchema,
  songLibraryEntrySchema,
} from "../../packages/contracts/src/songs";
import type {
  SongHistoryEntry,
  SongLibraryEntry,
} from "../../packages/contracts/src/songs";
import { defineParitySuite } from "./parity";
import type { ParitySuite } from "./parity";
import {
  chance,
  createRandom,
  integer,
  KEY_NAMES,
  ODD_KEY_NAMES,
  pick,
  PLAN_DATE_MS,
  planItem,
  randomPlans,
  songItem,
} from "./plans.parity";

/** U+0301: `Cafe` plus it renders as `Café` but is not the same code points. */
const COMBINING_ACUTE = String.fromCodePoint(0x3_01);
/** U+00A0, which JavaScript trims as whitespace. */
const NO_BREAK_SPACE = String.fromCodePoint(0xa0);
/** U+00AD, which ICU collation ignores. */
const SOFT_HYPHEN = String.fromCodePoint(0xad);
/** U+200B, which ICU collation ignores. */
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x20_0b);

/**
 * Parity suites for the song logic in
 * `apps/ios/PCOBoosterCore/Sources/PCOBoosterCore/Logic/Songs`: song facts from plan items,
 * history, and arrangements (`apps/web/src/lib/song-library.ts`), and the library's filters,
 * sorts, and search (`apps/web/src/lib/songs-index.ts`), including the `localeCompare` title
 * order the Swift port reproduces with Foundation collation.
 *
 * Library inputs are parsed with the contract schemas. Dates sit on the edges that matter:
 * the plan's own date, the `unused` cutoffs to the millisecond, and month ends that clamp.
 */

const DAY_MS = 86_400_000;

// Song facts

/** One plan and several insertion points to look back from. */
interface PreviousSongInput {
  insertAfterIds: (string | null)[];
  items: PlanItem[];
}

/** Every insertion point to try: the end (null), a missing id, and after each item. */
const insertionPoints = (
  items: readonly { id: string }[]
): (string | null)[] => [null, "missing", ...items.map((item) => item.id)];

const previousSongCases = (): PreviousSongInput[] => {
  const seeded = [
    planItem({ id: "set", itemType: "header" }),
    songItem("egypt", { start: "Eb", end: "F" }),
    planItem({ id: "prayer" }),
    planItem({ id: "sermon", itemType: "header" }),
    planItem({ id: "response" }),
  ];
  const untitled = [
    songItem("first", { start: "G" }),
    planItem({ ...songItem("untitled", { start: "Bbm" }), title: "" }),
    planItem({ id: "prayer" }),
    songItem("keyless"),
  ];
  return [
    { items: seeded, insertAfterIds: insertionPoints(seeded) },
    { items: [], insertAfterIds: [null, "missing"] },
    { items: untitled, insertAfterIds: insertionPoints(untitled) },
    ...randomPlans(301, 60, 8).map((items) => ({
      items,
      insertAfterIds: insertionPoints(items),
    })),
  ];
};

const previousSongBeforeSuite = defineParitySuite<
  PreviousSongInput,
  (PreviousSong | null)[]
>({
  name: "songs.previousSongBefore",
  cases: previousSongCases(),
  run: ({ items, insertAfterIds }) =>
    insertAfterIds.map((insertAfterId) =>
      previousSongBefore(items, insertAfterId)
    ),
});

const historyEntry = (
  day: string,
  serviceTypeId: string | null,
  startingKey: string | null
): SongHistoryEntry =>
  songHistoryEntrySchema.parse({
    planId: `plan-${day}`,
    serviceTypeId,
    serviceTypeName: serviceTypeId ?? "",
    sortDate: new Date(`${day}T17:00:00Z`),
    keyName: startingKey,
    startingKey,
    arrangementName: null,
  });

const SERVICE_TYPE_IDS = ["youth", "agape", null] as const;

const HISTORY_KEYS: readonly (string | null)[] = [
  ...KEY_NAMES.slice(0, 8),
  null,
  null,
  "",
  "Café",
  `Cafe${COMBINING_ACUTE}`,
];

const randomHistory = (
  random: () => number,
  planDateMs: number
): SongHistoryEntry[] => {
  const entries = Array.from({ length: integer(random, 0, 8) }, (_, index) => {
    const offset = chance(random, 0.15)
      ? integer(random, -1, 1)
      : integer(random, -40, 330) * DAY_MS;
    return songHistoryEntrySchema.parse({
      planId: chance(random, 0.1) ? null : `plan-${index}`,
      serviceTypeId: pick(random, SERVICE_TYPE_IDS),
      serviceTypeName: pick(random, ["Youth", "Agape", ""]),
      sortDate: new Date(planDateMs - offset),
      keyName: null,
      startingKey: pick(random, HISTORY_KEYS),
      arrangementName: null,
    });
  });
  // The API returns history newest first; a few lists stay unsorted.
  return chance(random, 0.85)
    ? entries.toSorted((a, b) => b.sortDate.getTime() - a.sortDate.getTime())
    : entries;
};

interface HistoryInput {
  history: SongHistoryEntry[];
  planDate: Date;
  serviceTypeId: string | null;
}

const historyCases = (): HistoryInput[] => {
  const random = createRandom(311);
  return [
    {
      history: [
        historyEntry("2026-10-18", "agape", "G"),
        historyEntry("2026-10-11", "agape", "G"),
        historyEntry("2026-10-04", "youth", "E"),
        historyEntry("2026-09-27", "youth", "F"),
        historyEntry("2026-08-02", "agape", "G"),
        historyEntry("2026-07-05", "youth", null),
      ],
      planDate: new Date("2026-10-04T17:00:00Z"),
      serviceTypeId: "youth",
    },
    {
      history: [historyEntry("2026-09-27", null, "D")],
      planDate: new Date("2026-10-04T17:00:00Z"),
      serviceTypeId: null,
    },
    ...Array.from({ length: 150 }, () => ({
      history: randomHistory(random, PLAN_DATE_MS),
      planDate: new Date(PLAN_DATE_MS),
      serviceTypeId: pick(random, SERVICE_TYPE_IDS),
    })),
  ];
};

const summarizeSongHistorySuite = defineParitySuite<
  HistoryInput,
  SongHistorySummary
>({
  name: "songs.summarizeSongHistory",
  cases: historyCases(),
  run: ({ history, planDate, serviceTypeId }) =>
    summarizeSongHistory(history, planDate, serviceTypeId),
});

interface CountLabelInput {
  serviceTypeName: string | null;
  timesHere: number;
  timesThisYear: number;
}

const songHistoryCountLabelSuite = defineParitySuite<CountLabelInput, string>({
  name: "songs.songHistoryCountLabel",
  cases: [0, 1, 2, 4, 12].flatMap((timesThisYear) =>
    [0, 1, 2].flatMap((timesHere) =>
      ["Youth", null, "", "Agape Worship"].map((serviceTypeName) => ({
        serviceTypeName,
        timesHere,
        timesThisYear,
      }))
    )
  ),
  run: ({ timesThisYear, timesHere, serviceTypeName }) =>
    songHistoryCountLabel({ timesThisYear, timesHere }, serviceTypeName),
});

const arrangement = (
  overrides: Partial<ArrangementOption> & Pick<ArrangementOption, "id">
): ArrangementOption =>
  arrangementOptionSchema.parse({
    name: "Default",
    sequence: [],
    length: 333,
    bpm: 72,
    meter: "4/4",
    archived: false,
    keys: [],
    ...overrides,
  });

const keyChoice = (id: string, startingKey: string | null) => ({
  id,
  name: startingKey ?? "",
  startingKey,
  endingKey: null,
});

const TEMPO_ARRANGEMENTS: readonly ArrangementOption[] = [
  arrangement({ id: "both" }),
  arrangement({ id: "bpm", meter: null }),
  arrangement({ id: "meter", bpm: null }),
  arrangement({ id: "neither", bpm: null, meter: null }),
  arrangement({ id: "empty-meter", bpm: null, meter: "" }),
  arrangement({ id: "fraction", bpm: 72.5, meter: "6/8" }),
  arrangement({ id: "zero", bpm: 0, meter: "3/4" }),
  arrangement({ id: "big", bpm: 1e21, meter: null }),
];

interface TempoInput {
  arrangement?: ArrangementOption;
}

const tempoLabelSuite = defineParitySuite<TempoInput, string>({
  name: "songs.tempoLabel",
  cases: [{}, ...TEMPO_ARRANGEMENTS.map((option) => ({ arrangement: option }))],
  run: (input) => tempoLabel(input.arrangement),
});

interface PreviewInput {
  arrangements: ArrangementOption[];
  history?: SongHistoryEntry[];
  planDate: Date;
  previousSong: PreviousSong | null;
  serviceTypeId: string | null;
}

const PREVIOUS_SONGS: readonly (PreviousSong | null)[] = [
  null,
  { title: "Egypt", endKey: "Eb" },
  { title: "the last song", endKey: "F#m" },
  { title: "Odd", endKey: "Worship" },
];

const randomArrangements = (random: () => number): ArrangementOption[] =>
  Array.from({ length: integer(random, 0, 3) }, (_, index) =>
    arrangement({
      id: `arr-${index}`,
      archived: chance(random, 0.2),
      bpm: pick(random, [null, 72, 72, 120.5, 0]),
      meter: pick(random, [null, "4/4", "4/4", "6/8", ""]),
      keys: Array.from({ length: integer(random, 0, 3) }, (__, keyIndex) =>
        keyChoice(
          `key-${index}-${keyIndex}`,
          chance(random, 0.15)
            ? null
            : pick(random, chance(random, 0.85) ? KEY_NAMES : ODD_KEY_NAMES)
        )
      ),
    })
  );

const previewCases = (): PreviewInput[] => {
  const random = createRandom(321);
  const seededArrangement = arrangement({
    id: "arr-1",
    keys: [keyChoice("k-1", "G"), keyChoice("k-2", "A")],
  });
  return [
    {
      history: [],
      arrangements: [seededArrangement],
      serviceTypeId: "youth",
      previousSong: { title: "Egypt", endKey: "Eb" },
      planDate: new Date("2026-10-05T17:00:00Z"),
    },
    {
      history: [historyEntry("2026-09-27", "youth", "F")],
      arrangements: [{ ...seededArrangement, archived: true }],
      serviceTypeId: "youth",
      previousSong: null,
      planDate: new Date("2026-10-05T17:00:00Z"),
    },
    {
      arrangements: [seededArrangement, seededArrangement],
      serviceTypeId: null,
      previousSong: { title: "Egypt", endKey: "Eb" },
      planDate: new Date("2026-10-05T17:00:00Z"),
    },
    ...Array.from({ length: 120 }, () => {
      // No history stands for one still loading (`undefined` on the web).
      const history = chance(random, 0.8)
        ? randomHistory(random, PLAN_DATE_MS)
        : undefined;
      return {
        history,
        arrangements: randomArrangements(random),
        serviceTypeId: pick(random, SERVICE_TYPE_IDS),
        previousSong: pick(random, PREVIOUS_SONGS),
        planDate: new Date(PLAN_DATE_MS),
      };
    }),
  ];
};

const songPreviewFactsSuite = defineParitySuite<PreviewInput, SongPreviewFacts>(
  {
    name: "songs.songPreviewFacts",
    cases: previewCases(),
    run: (input) =>
      songPreviewFacts({
        history: input.history,
        arrangements: input.arrangements,
        serviceTypeId: input.serviceTypeId,
        previousSong: input.previousSong,
        planDate: input.planDate,
      }),
  }
);

// Library

const planningCenterSongUrlSuite = defineParitySuite<string, string>({
  name: "songs.planningCenterSongUrl",
  cases: [
    "12345",
    "",
    "a b",
    "a/b?c#d",
    "café",
    "\u{1F3B8}",
    "100%",
    "-_.!~*'()",
    "[x]&y=z+1",
  ],
  run: planningCenterSongUrl,
});

interface LibraryOptions {
  defaultFilter: SongLibraryFilter;
  defaultSort: SongLibrarySort;
  filters: { label: string; months: number | null; value: string }[];
  sorts: { label: string; value: string }[];
}

const libraryOptionsSuite = defineParitySuite<null, LibraryOptions>({
  name: "songs.libraryOptions",
  cases: [null],
  run: () => ({
    defaultFilter: DEFAULT_SONG_LIBRARY_FILTER,
    defaultSort: DEFAULT_SONG_LIBRARY_SORT,
    filters: songLibraryFilters.map((filter) => ({
      label: filter.label,
      months: "months" in filter ? filter.months : null,
      value: filter.value,
    })),
    sorts: songLibrarySorts.map(({ label, value }) => ({ label, value })),
  }),
});

interface ParseInput {
  value?: string;
}

const PARSE_VALUES: readonly ParseInput[] = [
  {},
  { value: "" },
  { value: "all" },
  { value: "unused-6" },
  { value: "unused-12" },
  { value: "unused-24" },
  { value: "never" },
  { value: "stale" },
  { value: "UNUSED-6" },
  { value: "recent" },
  { value: "title" },
  { value: "longest" },
  { value: "popular" },
  { value: " title" },
];

const parseSongLibraryFilterSuite = defineParitySuite<ParseInput, string>({
  name: "songs.parseSongLibraryFilter",
  cases: [...PARSE_VALUES],
  run: ({ value }) => parseSongLibraryFilter(value),
});

const parseSongLibrarySortSuite = defineParitySuite<ParseInput, string>({
  name: "songs.parseSongLibrarySort",
  cases: [...PARSE_VALUES],
  run: ({ value }) => parseSongLibrarySort(value),
});

const NOW = new Date("2026-10-01T18:00:00.000Z");

/** Month ends that clamp, leap days, year ends, and instants with seconds to drop. */
const NOWS: readonly Date[] = [
  NOW,
  new Date("2026-05-31T12:00:00.000Z"),
  new Date("2026-03-31T23:59:59.999Z"),
  new Date("2024-02-29T06:30:15.250Z"),
  new Date("2025-02-28T00:00:00.000Z"),
  new Date("2026-01-01T00:00:00.000Z"),
  new Date("2026-12-31T23:59:00.000Z"),
  new Date("2026-08-31T09:45:30.000Z"),
  new Date("2026-07-31T17:00:00.000Z"),
  new Date("2000-02-29T12:00:00.000Z"),
  new Date("1970-01-31T00:00:00.000Z"),
];

interface MonthsInput {
  months: number;
  now: Date;
}

const monthsBeforeSuite = defineParitySuite<MonthsInput, Date>({
  name: "songs.monthsBefore",
  cases: NOWS.flatMap((now) =>
    [0, 1, 2, 3, 6, 11, 12, 13, 24, 25, 120, -1, -6].map((months) => ({
      months,
      now,
    }))
  ),
  run: ({ now, months }) => monthsBefore(now, months),
});

interface CutoffInput {
  filter: SongLibraryFilter;
  now: Date;
}

const songLibraryCutoffSuite = defineParitySuite<CutoffInput, Date | null>({
  name: "songs.songLibraryCutoff",
  cases: NOWS.flatMap((now) =>
    songLibraryFilters.map(({ value }) => ({ filter: value, now }))
  ),
  run: ({ filter, now }) => songLibraryCutoff(filter, now),
});

const libraryEntry = (
  id: string,
  title: string,
  lastScheduledAt: Date | null,
  createdAt: Date | null,
  extra: { author?: string; themes?: string } = {}
): SongLibraryEntry =>
  songLibraryEntrySchema.parse({
    id,
    title,
    author: extra.author ?? "",
    themes: extra.themes ?? "",
    lastScheduledAt,
    createdAt,
  });

const testSong = (
  id: string,
  lastScheduledAt: string | null,
  createdAt: string | null = "2020-01-01T00:00:00Z",
  extra: { author?: string; title?: string } = {}
): SongLibraryEntry =>
  libraryEntry(
    id,
    extra.title ?? `Song ${id}`,
    lastScheduledAt === null ? null : new Date(lastScheduledAt),
    createdAt === null ? null : new Date(createdAt),
    { author: extra.author }
  );

const TEST_LIBRARY: readonly SongLibraryEntry[] = [
  testSong("recent", "2026-09-27T00:00:00Z"),
  testSong("old", "2024-01-07T00:00:00Z"),
  testSong("older", "2021-03-14T00:00:00Z"),
  testSong("never-old", null, "2019-05-01T00:00:00Z"),
  testSong("never-new", null, "2026-09-01T00:00:00Z"),
  testSong("undated", null, null),
];

const SEARCH_LIBRARY: readonly SongLibraryEntry[] = [
  testSong("a", "2026-09-27T00:00:00Z", null, {
    title: "Goodness of God",
    author: "Jenn Johnson",
  }),
  testSong("b", "2020-01-01T00:00:00Z", null, { title: "Johnson Hymn" }),
  testSong("c", "2020-01-01T00:00:00Z", null, { title: "Way Maker" }),
];

/** Titles that sort differently under naive code point, case-insensitive, and ICU orders. */
const LIBRARY_TITLES: readonly string[] = [
  "Amazing Grace",
  "amazing grace",
  "Amazing Grace (My Chains Are Gone)",
  "Amazing Grace - Live",
  "10,000 Reasons",
  "10000 Reasons",
  "Á la carte",
  "A la carte",
  "Æon",
  "Aeon",
  "Égypte",
  "Egypt",
  "egypt",
  "Way Maker",
  "Waymaker",
  "Way-maker",
  "What A Beautiful Name",
  "What a Beautiful Name",
  "Goodness of God",
  "Good Good Father",
  "It Is Well",
  "It Is Well (With My Soul)",
  "O Come, All Ye Faithful",
  "O Come All Ye Faithful",
  "Ölberg",
  "Olberg",
  "Ñandú",
  "Nandu",
  "“Quoted”",
  '"Quoted"',
  "(Live) Glory",
  "[Acoustic] Glory",
  "¡Hola!",
  "찬양",
  "日本",
  "\u{1F3B8} Jam",
  "Ｆｕｌｌ Width",
  "Full Width",
  `Song${NO_BREAK_SPACE}Title`,
  "Song Title",
  "",
];

const AUTHORS = ["", "Jenn Johnson", "Pat Barrett", "Chris Tomlin", "Hillsong"];
const THEMES = ["", "Grace", "Worship, Praise", "Easter", "Advent"];

const randomLibrary = (
  random: () => number,
  nowMs: number
): SongLibraryEntry[] => {
  const cutoffs = [6, 12, 24].map((months) =>
    monthsBefore(new Date(nowMs), months).getTime()
  );
  const date = (): Date | null => {
    const roll = integer(random, 0, 9);
    if (roll === 0) {
      return null;
    }
    if (roll <= 3) {
      return new Date(pick(random, cutoffs) + integer(random, -1, 1));
    }
    return new Date(nowMs - integer(random, -30, 1200) * DAY_MS);
  };
  return Array.from({ length: integer(random, 0, 14) }, (_, index) =>
    libraryEntry(
      `song-${index}`,
      pick(random, LIBRARY_TITLES),
      date(),
      date(),
      { author: pick(random, AUTHORS), themes: pick(random, THEMES) }
    )
  );
};

const QUERIES: readonly string[] = [
  "",
  "",
  "",
  "   ",
  "johnson",
  "grace",
  "amazing grace",
  "way maker",
  "god",
  "10000",
  "Égypte",
  " egypt ",
  "worship",
  "a",
  "zzz",
];

interface LibraryInput {
  now: Date;
  songs: SongLibraryEntry[];
  view: SongLibraryView;
}

const LIBRARY_FILTERS = songLibraryFilters.map(({ value }) => value);
const LIBRARY_SORTS = songLibrarySorts.map(({ value }) => value);

const libraryCases = (): LibraryInput[] => {
  const random = createRandom(331);
  const seeded: LibraryInput[] = [
    ...LIBRARY_FILTERS.flatMap((filter) =>
      LIBRARY_SORTS.map((sort) => ({
        now: NOW,
        songs: [...TEST_LIBRARY],
        view: { filter, sort, query: "" },
      }))
    ),
    ...LIBRARY_FILTERS.map((filter) => ({
      now: NOW,
      songs: [...SEARCH_LIBRARY],
      view: { filter, sort: "recent" as const, query: "johnson" },
    })),
  ];
  const generated = Array.from({ length: 200 }, () => {
    const now = pick(random, NOWS);
    return {
      now,
      songs: randomLibrary(random, now.getTime()),
      view: {
        filter: pick(random, LIBRARY_FILTERS),
        sort: pick(random, LIBRARY_SORTS),
        query: pick(random, QUERIES),
      },
    };
  });
  return [...seeded, ...generated];
};

const selectSongLibrarySuite = defineParitySuite<LibraryInput, string[]>({
  name: "songs.selectSongLibrary",
  cases: libraryCases(),
  run: ({ songs, view, now }) =>
    selectSongLibrary(songs, view, now).map((song) => song.id),
});

/**
 * Strings whose `localeCompare` order is easy to get wrong: case, accents (composed and
 * decomposed), punctuation, digits, ligatures, full-width and circled forms, ignorable
 * characters, and other scripts.
 */
const COLLATION_CORPUS: readonly string[] = [
  ...new Set([
    ...LIBRARY_TITLES,
    " ",
    "a",
    "A",
    "b",
    "B",
    "ab",
    "Ab",
    "aB",
    "a b",
    "a-b",
    "a_b",
    "a.b",
    "a,b",
    "a'b",
    "a’b",
    "ab ",
    " ab",
    "e",
    "é",
    `e${COMBINING_ACUTE}`,
    "ê",
    "è",
    "E",
    "É",
    "Zoe",
    "Zoë",
    "zoe",
    "ZOE",
    "1",
    "10",
    "2",
    "02",
    "1a",
    "a1",
    "a10",
    "a2",
    "Song 1",
    "Song 10",
    "Song 2",
    "Song",
    "song",
    "Songs",
    "Œuvre",
    "Oeuvre",
    "ß",
    "ss",
    "SS",
    "Ångström",
    "Angstrom",
    "ñ",
    "n",
    "Ł",
    "L",
    "ı",
    "i",
    "İ",
    "I",
    "Ⅳ",
    "IV",
    "ﬁ",
    "fi",
    "①",
    "１",
    "Ａ",
    "a\u0000b",
    "\t",
    "!",
    "?",
    "#",
    "$",
    "&",
    "(",
    "*",
    "+",
    "@",
    "[",
    "^",
    "`",
    "~",
    "|",
    "/",
    "\\",
    "-",
    "_",
    "…",
    "«",
    "»",
    "Ελληνικά",
    "Русский",
    "русский",
    "עברית",
    "العربية",
    "हिन्दी",
    "😀",
    "👍🏽",
    `a${ZERO_WIDTH_SPACE}b`,
    `a${SOFT_HYPHEN}b`,
    "co-op",
    "coop",
    "co op",
    "Coop",
    "résumé",
    "resume",
    "Résumé",
    "RESUME",
    "cote",
    "côte",
    "coté",
    "côté",
    "þ",
    "ð",
    "ø",
    "Ø",
    "o",
    "O",
    "Ó",
    "Ö",
    "Ò",
  ]),
];

const orderSymbol = (order: number): string => {
  if (order < 0) {
    return "<";
  }
  return order > 0 ? ">" : "=";
};

/** One row per string: how it compares with each corpus string, as `<`, `=`, and `>`. */
const compareTitlesSuite = defineParitySuite<string[], string[]>({
  name: "songs.compareTitles",
  cases: [[...COLLATION_CORPUS]],
  run: (corpus) =>
    corpus.map((a) =>
      corpus.map((b) => orderSymbol(a.localeCompare(b))).join("")
    ),
});

export const songsParitySuites: readonly ParitySuite[] = [
  previousSongBeforeSuite,
  summarizeSongHistorySuite,
  songHistoryCountLabelSuite,
  tempoLabelSuite,
  songPreviewFactsSuite,
  planningCenterSongUrlSuite,
  libraryOptionsSuite,
  parseSongLibraryFilterSuite,
  parseSongLibrarySortSuite,
  monthsBeforeSuite,
  songLibraryCutoffSuite,
  selectSongLibrarySuite,
  compareTitlesSuite,
];

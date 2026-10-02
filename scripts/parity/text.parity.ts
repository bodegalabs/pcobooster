import { scoreSongSearch } from "@pcobooster/planning-center-models/song-search";

import { describeSignInError } from "@/lib/auth-redirect";
import { getInitials } from "@/lib/format/initials";
import { resolvePositionIconId } from "@/lib/format/position-icon";
import type { PositionIconId } from "@/lib/format/position-icon";
import { middleTruncate } from "@/lib/middle-truncate";
import { formatDuration } from "@/lib/plan-overview";
import { formatPlayedAgo } from "@/lib/plan-set-insights";
import { formatCompactAgo } from "@/lib/song-library";
import {
  describeCadence,
  describeDaysAgo,
  formatDayKey,
  formatWeekdayDayKey,
} from "@/lib/team-health";

import { defineParitySuite } from "./parity";
import type { ParitySuite } from "./parity";

/**
 * Parity suites for the text helpers in
 * `apps/ios/PCOBoosterCore/Sources/PCOBoosterCore/Logic/Text`: durations, middle truncation,
 * initials, sign-in errors, "ago" labels, serving-rhythm copy, song search, and position
 * icons. Strings include accents (composed and decomposed), emoji, Korean, and JavaScript's
 * own whitespace set, since the ports count UTF-16 code units and grapheme clusters like
 * the TypeScript.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const formatDurationSuite = defineParitySuite<number, string | null>({
  name: "text.formatDuration",
  cases: [
    0, 0.4, 0.999, 1, 59, 59.9, 60, 61, 65, 599, 3599, 3600, 3605, 3905, 35_999,
    36_000, 86_399, 86_400, 360_000, 1_000_000_000, -0.5, -5,
  ],
  run: formatDuration,
});

type MeasureName = "monospace" | "proportional";

/** The TypeScript test's stand-in for Pretext: every UTF-16 code unit is 10 wide. */
const monospace = (text: string): number => text.length * 10;

const NARROW = new Set([" ", "i", "l", ".", ",", "'", "|", "!"]);
const WIDE = new Set(["m", "w", "M", "W"]);

const proportionalWidth = (unit: string): number => {
  if (unit === "…") {
    return 12;
  }
  if (NARROW.has(unit)) {
    return 3;
  }
  if (WIDE.has(unit)) {
    return 13;
  }
  if (/[A-Z]/u.test(unit)) {
    return 10;
  }
  if (/[0-9]/u.test(unit)) {
    return 8;
  }
  if (/[a-z]/u.test(unit)) {
    return 7;
  }
  return 11;
};

/** Uneven widths per UTF-16 code unit, so word and grapheme fitting take different paths. */
const proportional = (text: string): number => {
  let width = 0;
  for (let index = 0; index < text.length; index += 1) {
    width += proportionalWidth(text.charAt(index));
  }
  return width;
};

const MEASURES: Record<MeasureName, (text: string) => number> = {
  monospace,
  proportional,
};

const TRUNCATE_TEXTS = [
  "Camera 1 Left AM",
  "Camera 2 Middle PM",
  "Rehearsal for PM service",
  "Camera 3 Right AM",
  "Supercalifragilistic",
  "Communion || Worship Choir AM",
  "Livestream PM",
  "Café Crème Brûlée Night",
  "Piñata Rehearsal PM",
  "\u{1F3B8} Electric Guitar Lead PM",
  "\u{1F468}‍\u{1F469}‍\u{1F467} Family Service",
  "\u{1F1FA}\u{1F1F8} Flag Day Service",
  "찬양팀 리허설 오전 예배",
  "Camera  2  Wide  AM",
  " Leading space AM",
  "Trailing space AM ",
  "Supercalifragilisticexpialidocious Rehearsal",
  "A",
  "",
] as const;

interface MiddleTruncateInput {
  maxWidth: number;
  measure: MeasureName;
  text: string;
}

const widths = (step: number, max: number): number[] =>
  Array.from(
    { length: Math.floor(max / step) + 1 },
    (_, index) => index * step
  );

const middleTruncateSuite = defineParitySuite<MiddleTruncateInput, string>({
  name: "text.middleTruncate",
  cases: [
    ...TRUNCATE_TEXTS.flatMap((text) => [
      ...[-10, ...widths(10, 260)].map((maxWidth) => ({
        maxWidth,
        measure: "monospace" as const,
        text,
      })),
      ...widths(20, 260).map((maxWidth) => ({
        maxWidth,
        measure: "proportional" as const,
        text,
      })),
    ]),
    { maxWidth: 125.5, measure: "proportional", text: "Camera 2 Middle PM" },
  ],
  run: ({ maxWidth, measure, text }) =>
    middleTruncate(text, maxWidth, MEASURES[measure]),
});

const initialsSuite = defineParitySuite<string, string>({
  name: "text.initials",
  cases: [
    "Jake Bodea",
    "jake",
    "J",
    "",
    "   ",
    "Mary Ann Smith",
    "  ana   maría ",
    "Émile Zola",
    "Émile Zola",
    "Émile",
    "ßaa",
    "straße",
    "ǆemal",
    "Ωmega Point",
    "李小龙",
    "李 小龙",
    "o'brien",
    "x y",
    "﻿Zoe Lee",
    "a\u0085b",
    "Ana Lucia",
    "line\nbreak",
    "\u{1F600}",
    "\u{1F600}x",
  ],
  run: getInitials,
});

const describeSignInErrorSuite = defineParitySuite<
  string | null,
  string | null
>({
  name: "text.describeSignInError",
  cases: [
    null,
    "",
    "access_denied",
    "state_mismatch",
    "state_not_found",
    "please_restart_the_process",
    "unable_to_get_user_info",
    "account_not_linked",
    "account_already_linked_to_different_user",
    "email_not_found",
    "something_new",
    "ACCESS_DENIED",
    " access_denied",
  ],
  run: describeSignInError,
});

interface AgoInput {
  at: Date;
  reference: Date;
}

/** How long before the reference, in milliseconds: around each unit's edges, and a few ahead of it. */
const AGO_OFFSETS = [
  -2 * DAY_MS,
  -1,
  0,
  1,
  DAY_MS - 1,
  DAY_MS,
  47 * HOUR_MS,
  7 * DAY_MS - 1,
  7 * DAY_MS,
  13 * DAY_MS,
  14 * DAY_MS,
  29 * DAY_MS,
  59 * DAY_MS,
  60 * DAY_MS - 1,
  60 * DAY_MS,
  89 * DAY_MS,
  90 * DAY_MS,
  179 * DAY_MS,
  300 * DAY_MS,
  365 * DAY_MS - 1,
  365 * DAY_MS,
  729 * DAY_MS,
  730 * DAY_MS,
  1500 * DAY_MS,
] as const;

const agoInputs = (references: readonly string[]): AgoInput[] =>
  references.flatMap((iso) => {
    const reference = Date.parse(iso);
    return AGO_OFFSETS.map((offset) => ({
      at: new Date(reference - offset),
      reference: new Date(reference),
    }));
  });

const formatCompactAgoSuite = defineParitySuite<AgoInput, string>({
  name: "text.formatCompactAgo",
  cases: [
    ...[
      "2026-10-02T17:00:00Z",
      "2026-09-07T17:00:00Z",
      "2026-05-05T17:00:00Z",
      "2024-09-01T17:00:00Z",
    ].map((at) => ({
      at: new Date(at),
      reference: new Date("2026-10-05T17:00:00Z"),
    })),
    ...agoInputs(["2026-10-05T17:00:00.000Z", "2026-03-08T09:30:00.250Z"]),
  ],
  run: ({ at, reference }) => formatCompactAgo(at, reference),
});

const formatPlayedAgoSuite = defineParitySuite<AgoInput, string>({
  name: "text.formatPlayedAgo",
  cases: [
    ...[
      "2026-09-25T12:00:00Z",
      "2026-09-07T12:00:00Z",
      "2026-04-01T12:00:00Z",
      "2024-06-01T12:00:00Z",
    ].map((at) => ({
      at: new Date(at),
      reference: new Date("2026-09-28T12:00:00Z"),
    })),
    ...agoInputs(["2026-09-28T12:00:00.000Z", "2026-11-01T08:59:59.999Z"]),
  ],
  run: ({ at, reference }) => formatPlayedAgo(at, reference),
});

const describeCadenceSuite = defineParitySuite<number, string>({
  name: "text.describeCadence",
  cases: [
    -7, -3.5, 0, 0.5, 3, 3.49, 3.5, 3.51, 7, 10, 10.49, 10.5, 14, 17.5, 21,
    24.5, 28, 29, 31.49, 31.5, 35, 42, 70, 182.5, 365,
  ],
  run: describeCadence,
});

const describeDaysAgoSuite = defineParitySuite<number, string>({
  name: "text.describeDaysAgo",
  cases: [
    -5, -1, 0, 1, 2, 13, 14, 17, 18, 24, 25, 31, 32, 38, 39, 45, 52, 59, 60, 74,
    75, 104, 105, 135, 365, 1000,
  ],
  run: describeDaysAgo,
});

/** Day keys, including ones JavaScript's date parser rolls over ("2026-02-30" is March 2) and its extended years. */
const LABEL_DAY_KEYS = [
  "2026-07-12",
  "2026-09-25",
  "2026-01-01",
  "2026-12-31",
  "2028-02-29",
  "2026-02-30",
  "2026-04-31",
  "0099-01-01",
  "+002026-09-10",
  "-000044-03-15",
  "1970-01-01",
  "2100-03-01",
] as const;

const formatDayKeySuite = defineParitySuite<string, string>({
  name: "text.formatDayKey",
  cases: LABEL_DAY_KEYS,
  run: formatDayKey,
});

const formatWeekdayDayKeySuite = defineParitySuite<string, string>({
  name: "text.formatWeekdayDayKey",
  cases: LABEL_DAY_KEYS,
  run: formatWeekdayDayKey,
});

const SEARCH_NOW = Date.parse("2026-10-01T12:00:00.000Z");

interface SongInput {
  author: string;
  lastScheduledAt: Date | null;
  themes: string;
  title: string;
}

const song = (
  title: string,
  author: string,
  themes: string,
  daysAgo: number | null
): SongInput => ({
  author,
  lastScheduledAt:
    daysAgo === null ? null : new Date(SEARCH_NOW - daysAgo * DAY_MS),
  themes,
  title,
});

/** A small library: sung recently, at the 180-day edge, in the future, and never, with titles only some normalizations reach. */
const SEARCH_SONGS = [
  song("Way Maker", "Sinach", "Faith, Miracles", 7),
  song("Always", "Chris Tomlin", "", null),
  song("Goodness of God", "Jenn Johnson, Ed Cash", "Faithfulness", 200),
  song("Johnson's Hymn", "", "", null),
  song("Abide", "", "Easter, Resurrection", 179),
  song("Egypt", "Cory Asbury", "Freedom", 180),
  song("Égypte (Live)", "Bethel Music", "", -3),
  song("10,000 Reasons (Bless the Lord)", "Matt Redman", "Praise", 1),
  song("What A Beautiful Name", "Hillsong Worship", "Jesus, Name", null),
  song("Build My Life", "Pat Barrett", "Commitment", 30),
  song("Ｗａｙ Ｍａｋｅｒ", "", "", null),
  song("King of Kings", "Brooke Ligertwood", "Kingship", 90),
  song("İsrael Medley", "", "", null),
];

const SEARCH_QUERIES = [
  "way maker",
  "WAY",
  "way-maker",
  "maker way",
  "always",
  "johnson",
  "easter",
  "egypt",
  "god",
  "10000",
  "10 000 reasons",
  "bless",
  "name",
  "",
  "   ",
  "!!!",
  "jesus name",
  "king",
  "kings",
  "i srael",
  "israel",
  "build",
  "life build",
  "o",
  "e",
] as const;

interface SongSearchInput {
  now: Date;
  query: string;
  song: SongInput;
}

const scoreSongSearchSuite = defineParitySuite<SongSearchInput, number>({
  name: "text.scoreSongSearch",
  cases: SEARCH_SONGS.flatMap((entry) =>
    SEARCH_QUERIES.map((query) => ({
      now: new Date(SEARCH_NOW),
      query,
      song: entry,
    }))
  ),
  run: ({ now, query, song: entry }) => scoreSongSearch(entry, query, now),
});

interface PositionIconInput {
  positionName: string;
  teamName: string;
}

const positionIconSuite = defineParitySuite<PositionIconInput, PositionIconId>({
  name: "text.positionIcon",
  cases: [
    ["Lead Electric Guitar", "Band"],
    ["Bass Guitar", "Band"],
    ["Drums", "Band"],
    ["Keys", "Band"],
    ["Pads", "Band"],
    ["Electric Guitar - Rhythm", "Band"],
    ["Electric Guitar - Lead", "Band"],
    ["Rhythm", "Electric Guitar"],
    ["Lead", "Electric Guitar"],
    ["Acoustic Guitar", "Band"],
    ["Percussion", "Band"],
    ["Alto", "Vocals"],
    ["Male Lead", "Vocals"],
    ["Soprano", "Vocals"],
    ["Tenor", "Vocals"],
    ["Camera 1", "Audio/Visual"],
    ["Livestream", "Audio/Visual"],
    ["Lyrics", "Audio/Visual"],
    ["Photography", "Audio/Visual"],
    ["Sound", "Audio/Visual"],
    ["Team Member", "Band"],
    ["Team Member", "Vocals"],
    ["Team Member", "Audio/Visual"],
    ["Greeter", "Hospitality"],
    ["Cam2", "Production"],
    ["cam 1", ""],
    ["Cam 12", ""],
    ["FOH Engineer", "Tech"],
    ["A1", "Audio"],
    ["Audio Engineer", ""],
    ["Worship Leader", "Vocals"],
    ["Worship  \t Leader", ""],
    ["Cajón", "Band"],
    ["CAJON", ""],
    ["Cajón", ""],
    ["Basś", ""],
    ["ProPresenter", "Tech"],
    ["Slides", ""],
    ["Director", "Media"],
    ["Switcher", ""],
    ["Organ", "Choir"],
    ["Synth Pads", ""],
    ["Usher", "A/V Team"],
    ["Usher", "AV"],
    ["Usher", "Audio and Visual"],
    ["Usher", "Audiovisual"],
    ["Usher", "Visuals"],
    ["Usher", "Media Team"],
    ["Usher", "Production"],
    ["Usher", "Orchestra"],
    ["Usher", "Bands"],
    ["Usher", "Music"],
    ["Usher", "Choirs"],
    ["", ""],
    ["Lead_Guitar", ""],
    ["Mic-1", ""],
    ["Bass", "Vocals"],
    ["Drums", "Vocals"],
    ["Keys2", ""],
    ["Video Director", ""],
    ["Livestream Camera", ""],
    ["Broadcasting", ""],
    ["Photo Booth", ""],
    ["Lyrics Operator", "Worship"],
    ["Alto Sax", "Band"],
    ["Électric Guitar", ""],
    ["Ukulele", ""],
    ["Banjo", ""],
    ["Mandolin", ""],
    ["Keyboard", ""],
    ["Piano", ""],
    ["Singer", ""],
    ["Microphone", ""],
    ["Mics", ""],
    ["Baritone", ""],
    ["Monitors", ""],
    ["Videos", ""],
    ["Presentation", ""],
    ["Proclaim", ""],
    ["Streaming", ""],
    ["Photographs", ""],
    ["Stage Manager", "Production"],
    ["Host", "Tech Team"],
  ].map(([positionName, teamName]) => ({ positionName, teamName })),
  run: ({ positionName, teamName }) =>
    resolvePositionIconId(positionName, teamName),
});

export const textParitySuites: readonly ParitySuite[] = [
  formatDurationSuite,
  middleTruncateSuite,
  initialsSuite,
  describeSignInErrorSuite,
  formatCompactAgoSuite,
  formatPlayedAgoSuite,
  describeCadenceSuite,
  describeDaysAgoSuite,
  formatDayKeySuite,
  formatWeekdayDayKeySuite,
  scoreSongSearchSuite,
  positionIconSuite,
];

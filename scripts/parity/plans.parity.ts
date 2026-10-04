import { vi } from "vitest";

import {
  buildDraft,
  buildRunSheet,
  formatLength,
  getItemTypeLabel,
  getServicePositionLabel,
  parseLengthText,
  pickKeyId,
  synchronizeDraftWithSongOptions,
} from "@/components/schedule/plan-tab-helpers";
import type {
  DraftState,
  ParsedLengthText,
} from "@/components/schedule/plan-tab-helpers";
import { formatPlanTimeRangeLabel } from "@/components/schedule/plan-time-display";
import {
  appendPlanItem,
  applyPlanItemDraft,
  collectPlanSongOptionPrefetchIds,
  createOptimisticBasicPlanItem,
  createOptimisticSongPlanItem,
  insertPlanItem,
  movePlanItem,
  nextPlanItemSequence,
  planItemDraftChangesItem,
  planItemsHaveSameOrder,
  removePlanItem,
  reorderPlanItems,
  replacePlanItem,
  replacePlanItemById,
  shiftPlanItem,
} from "@/lib/plan-items-query-state";
import type { PlanInsertion } from "@/lib/plan-items-query-state";
import {
  buildReadinessChecks,
  keyLabelOf,
  keyOptionLabelOf,
  keyOptionPartsOf,
  summarizeOrder,
  summarizeStaffing,
  summarizeTimes,
} from "@/lib/plan-overview";
import type {
  KeyOptionParts,
  PlanOrder,
  PlanSchedule,
  PlanStaffing,
  ReadinessCheck,
} from "@/lib/plan-overview";
import {
  buildPlanInsights,
  daysSinceRecentPlay,
  keyTransitions,
} from "@/lib/plan-set-insights";
import type { KeyTransition } from "@/lib/plan-set-insights";
import {
  buildCreatePlanTimeRequest,
  buildDefaultNewPlanTimeEdit,
  buildEditablePlanTime,
  buildPlanTimePatch,
  getInvalidPlanTimeEditMessage,
  isValidPlanTimeEdit,
  planTimeEditHasChanges,
} from "@/lib/schedule/plan-time-edits";
import type { EditablePlanTime } from "@/lib/schedule/plan-time-edits";
import {
  groupPlansByMonthAndDay,
  parsePlanDate,
} from "@/lib/service-plan-selection";
import type { ServicePlanRow } from "@/lib/service-plan-selection";

import {
  planSchema,
  serviceTypeSchema,
  teamPositionGroupSchema,
} from "../../packages/contracts/src/catalog";
import type {
  Plan,
  ServiceType,
  TeamPositionGroup,
} from "../../packages/contracts/src/catalog";
import { planItemSchema } from "../../packages/contracts/src/plan-item-schemas";
import type {
  PlanItem,
  PlanItemArrangement,
  PlanItemKey,
  PlanItemType,
} from "../../packages/contracts/src/plan-item-schemas";
import { planTimeSchema } from "../../packages/contracts/src/plan-time-schemas";
import type {
  PlanTime,
  PlanTimeType,
} from "../../packages/contracts/src/plan-time-schemas";
import {
  arrangementOptionSchema,
  songCatalogEntrySchema,
  songOptionSetSchema,
} from "../../packages/contracts/src/song-schemas";
import type {
  ArrangementOption,
  KeyOption,
  SongCatalogEntry,
  SongOptionSet,
} from "../../packages/contracts/src/song-schemas";
import { defineParitySuite } from "./parity";
import type { ParitySuite } from "./parity";

/** U+FEFF, which JavaScript trims as whitespace. */
const BYTE_ORDER_MARK = String.fromCodePoint(0xfe_ff);
/** U+0301: `Cafe` plus it renders as `Café` but is not the same code points. */
const COMBINING_ACUTE = String.fromCodePoint(0x3_01);
/** U+2028, a JavaScript line terminator. */
const LINE_SEPARATOR = String.fromCodePoint(0x20_28);
/** U+00A0, which JavaScript trims as whitespace. */
const NO_BREAK_SPACE = String.fromCodePoint(0xa0);

/**
 * Parity suites for the plan logic in
 * `apps/ios/PCOBoosterCore/Sources/PCOBoosterCore/Logic/Plans`: the overview
 * (`apps/web/src/lib/plan-overview.ts`), run sheet edits
 * (`apps/web/src/lib/plan-items-query-state.ts`,
 * `apps/web/src/components/schedule/plan-tab-helpers.ts`), set insights
 * (`apps/web/src/lib/plan-set-insights.ts`), plan time edits and labels
 * (`apps/web/src/lib/schedule/plan-time-edits.ts`,
 * `apps/web/src/components/schedule/plan-time-display.ts`), and the agenda rows.
 *
 * API inputs are built as contract types and parsed with the contract schemas, so every
 * fixture input is a value the API could send and decodes as the generated Swift model. Each
 * suite seeds the cases from the TypeScript tests and adds seeded random plans: duplicate and
 * fractional sequences, songs without keys, modulating keys, headers, bridging items, unsent
 * notifications, and times around 2026 DST changes in zones with half-hour and 45-minute
 * offsets.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Sunday October 4, 2026, 10 AM in Los Angeles. */
export const PLAN_DATE_MS = Date.UTC(2026, 9, 4, 17);

// Random inputs

/** Park and Miller's minimal standard generator, so fixtures stay reproducible. */
export const createRandom = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
};

/** One of `items`, which may itself be `undefined` (an absent optional field). */
export const pick = <T>(random: () => number, items: readonly T[]): T => {
  if (items.length === 0) {
    throw new Error("Cannot pick from an empty list");
  }
  return items[Math.floor(random() * items.length)];
};

export const chance = (random: () => number, probability: number): boolean =>
  random() < probability;

export const integer = (
  random: () => number,
  min: number,
  max: number
): number => min + Math.floor(random() * (max - min + 1));

/** `value` with the given probability, else null. */
const sometimes = <T>(
  random: () => number,
  probability: number,
  value: () => T
): T | null => (chance(random, probability) ? value() : null);

/** A random subset of `items`, in their order. */
const subset = <T>(random: () => number, items: readonly T[]): T[] =>
  items.filter(() => chance(random, 0.5));

/** Keys a band writes, including spellings the key parser respells or rejects. */
export const KEY_NAMES: readonly string[] = [
  "C",
  "G",
  "D",
  "A",
  "E",
  "B",
  "F#",
  "Gb",
  "Db",
  "C#",
  "Ab",
  "Eb",
  "Bb",
  "F",
  "Am",
  "Em",
  "Bm",
  "F#m",
  "C#m",
  "G#m",
  "Ebm",
  "Bbm",
  "Fm",
  "Cm",
  "Gm",
  "Dm",
  "A#",
  "D#",
  "Cb",
];

export const ODD_KEY_NAMES: readonly string[] = [
  "",
  " D",
  "Worship",
  "G/B",
  "Bbmaj7",
  "Ebmin",
  "c",
  "H",
  "Em7",
  "F♯",
  "B♭m",
];

const KEY_DESCRIPTIONS: readonly string[] = [
  "",
  " ",
  "Default",
  "Original",
  "Emily",
  "Female lead (highest note is C# at bridge)",
  "G",
  " G ",
  "Bb",
  "G -> A",
  "D -> null",
  "Low key",
  "  Jake  ",
];

export const ITEM_TITLES: readonly string[] = [
  "",
  "Welcome",
  "Announcements",
  "Prayer",
  "Scripture Reading",
  "Sermon",
  "Offering",
  "Communion",
  "Benediction",
  "Café Fellowship",
  "찬양",
  "\u{1F3B8} Jam",
];

export const SONG_TITLES: readonly string[] = [
  "Way Maker",
  "Goodness of God",
  "Build My Life",
  "It Is Well",
  "What a Beautiful Name",
  "10,000 Reasons",
  "Amazing Grace",
  "amazing grace",
  "Égypte",
  "",
];

const ITEM_TYPES: readonly PlanItemType[] = [
  "song",
  "song",
  "song",
  "header",
  "item",
  "item",
  "media",
];

const SERVICE_POSITIONS = [
  "pre",
  "during",
  "during",
  "during",
  "post",
] as const;

const LENGTHS: readonly (number | null)[] = [
  null,
  null,
  0,
  30,
  59,
  59.5,
  60,
  61,
  90,
  125,
  180,
  240,
  300,
  2400,
  3599,
  3600,
  3661,
  -5,
  0.4,
  12.5,
  86_400,
];

const DESCRIPTIONS: readonly string[] = [
  "",
  "Intro",
  "Before service",
  "Café",
  `Cafe${COMBINING_ACUTE}`,
];

export const randomKey = (random: () => number, id: string): PlanItemKey => {
  const keyName = (): string =>
    pick(random, chance(random, 0.85) ? KEY_NAMES : ODD_KEY_NAMES);
  const startingKey = sometimes(random, 0.85, keyName);
  const endingKey = chance(random, 0.25)
    ? startingKey
    : sometimes(random, 0.35, keyName);
  return { id, name: pick(random, KEY_DESCRIPTIONS), startingKey, endingKey };
};

const randomArrangement = (
  random: () => number,
  id: string
): PlanItemArrangement => ({
  archivedAt: null,
  id,
  sequence: [],
  length: pick(random, LENGTHS),
  name: pick(random, ["Default", "Acoustic", "Key of G"]),
});

const randomPlanItem = (
  random: () => number,
  index: number,
  planDateMs: number
): PlanItem => {
  const itemType = pick(random, ITEM_TYPES);
  const isSong = itemType === "song";
  const songId = chance(random, 0.1) ? "" : `song-${integer(random, 1, 6)}`;
  return planItemSchema.parse({
    song: isSong
      ? {
          lastScheduledAt: sometimes(
            random,
            0.6,
            () =>
              new Date(
                planDateMs -
                  integer(random, -3, 40) * DAY_MS +
                  integer(random, -12, 12) * HOUR_MS
              )
          ),
          id: songId,
          title: pick(random, SONG_TITLES),
          author: "",
          themes: "",
        }
      : null,
    arrangement:
      isSong && chance(random, 0.6)
        ? randomArrangement(random, `arr-${integer(random, 1, 3)}`)
        : null,
    id: `item-${index}`,
    title: pick(random, isSong ? SONG_TITLES : ITEM_TITLES),
    itemType,
    sequence: chance(random, 0.8) ? index + 1 : integer(random, 0, 4) / 2,
    servicePosition: pick(random, SERVICE_POSITIONS),
    length: pick(random, LENGTHS),
    description: pick(random, DESCRIPTIONS),
    htmlDetails: "",
    customArrangementSequence: [],
    key: chance(random, isSong ? 0.8 : 0.1)
      ? randomKey(random, `key-${integer(random, 1, 4)}`)
      : null,
    layout: null,
  });
};

export const randomPlanItems = (
  random: () => number,
  maxCount: number,
  planDateMs = PLAN_DATE_MS
): PlanItem[] =>
  Array.from({ length: integer(random, 0, maxCount) }, (_, index) =>
    randomPlanItem(random, index, planDateMs)
  );

/** `count` random plans of up to `maxCount` items each, from one seed. */
export const randomPlans = (
  seed: number,
  count: number,
  maxCount: number
): PlanItem[][] => {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => randomPlanItems(random, maxCount));
};

// Test plan items, as the TypeScript tests build them

export const planItem = (
  overrides: Partial<PlanItem> & Pick<PlanItem, "id">
): PlanItem =>
  planItemSchema.parse({
    title: overrides.id,
    itemType: "item",
    sequence: 1,
    servicePosition: "during",
    length: null,
    description: "",
    htmlDetails: "",
    customArrangementSequence: [],
    song: null,
    arrangement: null,
    key: null,
    layout: null,
    ...overrides,
  });

export const keyOf = (
  id: string,
  start: string | undefined,
  end?: string
): PlanItemKey | null =>
  start === undefined
    ? null
    : {
        id: `key-${id}`,
        name: start,
        startingKey: start,
        endingKey: end ?? null,
      };

/** A song item like the TypeScript tests': titled by its id. */
export const songItem = (
  id: string,
  keys: { start?: string; end?: string } = {},
  lastScheduledAt: Date | null = null
): PlanItem =>
  planItem({
    id,
    itemType: "song",
    sequence: 0,
    song: {
      id: `song-${id}`,
      title: id,
      author: "",
      themes: "",
      lastScheduledAt,
    },
    key: keyOf(id, keys.start, keys.end),
  });

const createItem = (id: string, sequence: number): PlanItem =>
  planItem({ id, title: `Item ${sequence}`, sequence });

const createSongItem = (
  id: string,
  sequence: number,
  songId: string
): PlanItem =>
  planItem({
    id,
    title: `Item ${sequence}`,
    sequence,
    itemType: "song",
    song: {
      id: songId,
      title: `Song ${songId}`,
      author: "",
      themes: "",
      lastScheduledAt: null,
    },
  });

// Overview

const group = (input: TeamPositionGroup): TeamPositionGroup =>
  teamPositionGroupSchema.parse(input);

const band = group({
  teamId: "band",
  teamName: "Band",
  positions: [
    {
      id: "keys",
      name: "Keys",
      teamId: "band",
      source: "team_position",
      neededCount: 0,
      filledConfirmedCount: 1,
      filledPendingCount: 0,
    },
    {
      id: "drums",
      name: "Drums",
      teamId: "band",
      source: "needed_position",
      neededCount: 2,
      filledConfirmedCount: 0,
      filledPendingCount: 1,
      filledPeople: [
        {
          id: "person-1",
          planPersonId: "plan-person-1",
          personId: "person-1",
          name: "Ben Singer",
          status: "pending",
          rawStatus: "U",
          notification: { prepared: true, sentAt: null, senderName: null },
        },
      ],
    },
  ],
});

const unusedTeam = group({
  teamId: "tech",
  teamName: "Tech",
  positions: [
    { id: "lights", name: "Lights", teamId: "tech", source: "custom" },
  ],
});

const NOTIFICATIONS = [
  null,
  { prepared: true, sentAt: null, senderName: null },
  { prepared: true, sentAt: "2026-09-01T17:00:00Z", senderName: "Pat" },
  { prepared: false, sentAt: null, senderName: null },
  { prepared: false, sentAt: "2026-09-01T17:00:00Z", senderName: null },
] as const;

const POSITION_NAMES = ["Vocals", "Keys", "Drums", "Bass", "Camera", "Lights"];
const TEAM_SOURCES = [
  undefined,
  "team_position",
  "needed_position",
  "plan_member",
  "custom",
] as const;
const COUNTS = [undefined, 0, 0, 1, 2, 3, -1] as const;
const TIME_IDS = ["time-0", "time-1", "time-2", null, undefined] as const;

/** Up to `maxTeams` teams of up to `maxPositions` positions, each with up to 3 people. */
const randomGroups = (
  random: () => number,
  maxTeams = 3,
  maxPositions = 3
): TeamPositionGroup[] =>
  Array.from({ length: integer(random, 0, maxTeams) }, (_, teamIndex) => {
    const teamId = `team-${teamIndex}`;
    return group({
      teamId,
      teamName: `Team ${teamIndex}`,
      positions: Array.from(
        { length: integer(random, 0, maxPositions) },
        (__, positionIndex) => ({
          id: `position-${teamIndex}-${positionIndex}`,
          name: pick(random, POSITION_NAMES),
          teamId,
          source: pick(random, TEAM_SOURCES),
          neededPositionId: pick(random, [
            undefined,
            "",
            `needed-${teamIndex}-${positionIndex}`,
          ]),
          timeId: pick(random, TIME_IDS),
          neededCount: pick(random, COUNTS),
          filledConfirmedCount: pick(random, COUNTS),
          filledPendingCount: pick(random, COUNTS),
          filledPeople: chance(random, 0.3)
            ? undefined
            : Array.from({ length: integer(random, 0, 3) }, () => {
                const planPersonId = `plan-person-${integer(random, 1, 9)}`;
                return {
                  id: planPersonId,
                  planPersonId,
                  personId: pick(random, [
                    "person-1",
                    "person-2",
                    "person-3",
                    null,
                    undefined,
                  ]),
                  name: "Person",
                  status: pick(random, ["pending", "confirmed"] as const),
                  rawStatus: pick(random, ["U", "C"]),
                  assignedTimeIds: chance(random, 0.3)
                    ? undefined
                    : subset(random, ["time-0", "time-1", "time-2"]),
                  notification: pick(random, NOTIFICATIONS),
                };
              }),
        })
      ),
    });
  });

const STAFFING_SEED_GROUPS: readonly TeamPositionGroup[][] = [
  [band, unusedTeam],
  [band],
  [unusedTeam],
  [{ ...band, positions: band.positions.slice(0, 1) }],
  [],
];

const randomGroupLists = (
  seed: number,
  count: number
): TeamPositionGroup[][] => {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => randomGroups(random));
};

const summarizeStaffingSuite = defineParitySuite<
  TeamPositionGroup[],
  PlanStaffing
>({
  name: "plans.summarizeStaffing",
  cases: [...STAFFING_SEED_GROUPS, ...randomGroupLists(11, 100)],
  run: summarizeStaffing,
});

const keyOption = (
  name: string,
  startingKey: string | null,
  endingKey: string | null = startingKey
): KeyOption => ({ id: "key-1", name, startingKey, endingKey });

interface KeyLabels {
  keyLabel: string | null;
  optionLabel: string;
  parts: KeyOptionParts;
}

const KEY_LABEL_SEEDS: readonly KeyOption[] = [
  keyOption("Female lead (highest note is C# at bridge)", "D"),
  keyOption("Emily", "D"),
  keyOption("Bb", "Bb"),
  keyOption("G -> A", "G", "A"),
  keyOption("Original", null),
  keyOption("Default", "G", "A"),
  keyOption("", "D", "D"),
  keyOption("", "", "A"),
  keyOption("D -> null", "D", null),
  keyOption("G -> G", "G", "G"),
  keyOption(" Bb ", "Bb"),
  keyOption("A -> B", "A", ""),
  keyOption(`E${COMBINING_ACUTE}`, "É"),
  keyOption("É", "É", `E${COMBINING_ACUTE}`),
];

const keyLabelCases = (): KeyOption[] => {
  const random = createRandom(23);
  const keys = Array.from({ length: 300 }, (_, index) =>
    randomKey(random, `key-${index}`)
  );
  return [...KEY_LABEL_SEEDS, ...keys];
};

const keyLabelsSuite = defineParitySuite<KeyOption, KeyLabels>({
  name: "plans.keyLabels",
  cases: keyLabelCases(),
  run: (key) => ({
    keyLabel: keyLabelOf(key),
    optionLabel: keyOptionLabelOf(key),
    parts: keyOptionPartsOf(key),
  }),
});

/** The overview test's song item: "Item {id}", singing "Song {id}". */
const overviewSongItem = (
  id: string,
  sequence: number,
  key: PlanItemKey | null,
  length: number | null = null
): PlanItem =>
  planItem({
    id,
    title: `Item ${id}`,
    itemType: "song",
    sequence,
    length,
    key,
    song: {
      id: `song-${id}`,
      title: `Song ${id}`,
      author: "",
      themes: "",
      lastScheduledAt: null,
    },
  });

const ORDER_SEED_ITEMS: readonly PlanItem[][] = [
  [
    overviewSongItem("b", 3, {
      id: "k2",
      name: "Default",
      startingKey: "G",
      endingKey: "A",
    }),
    planItem({ id: "welcome", sequence: 1, length: 120 }),
    planItem({ id: "header", itemType: "header", sequence: 0, length: 999 }),
    overviewSongItem("a", 2, null, 300),
    planItem({
      id: "preroll",
      sequence: 0,
      servicePosition: "pre",
      length: 600,
    }),
  ],
  [
    overviewSongItem("a", 1, {
      id: "k",
      name: "",
      startingKey: "D",
      endingKey: "D",
    }),
  ],
  [],
];

const summarizeOrderSuite = defineParitySuite<PlanItem[], PlanOrder>({
  name: "plans.summarizeOrder",
  cases: [...ORDER_SEED_ITEMS, ...randomPlans(31, 100, 8)],
  run: summarizeOrder,
});

const TIME_NAMES = ["", "9 AM", "Sunday 11", "Rehearsal", "Soundcheck"];
const TIME_TYPES: readonly PlanTimeType[] = [
  "service",
  "service",
  "rehearsal",
  "other",
];
const TEAM_IDS = ["team-0", "team-1", "team-2", "team-3"];
const POSITION_IDS = ["position-0-0", "position-1-1", "position-2-0"];

export const planTime = (input: PlanTime): PlanTime =>
  planTimeSchema.parse(input);

const randomPlanTime = (
  random: () => number,
  index: number,
  aroundMs: number
): PlanTime => {
  const startsAt = aroundMs + integer(random, -96, 96) * 15 * MINUTE_MS;
  return planTime({
    startsAt: new Date(
      chance(random, 0.1) ? startsAt + integer(random, -1, 1) : startsAt
    ),
    endsAt: sometimes(
      random,
      0.6,
      () => new Date(startsAt + integer(random, -2, 12) * 15 * MINUTE_MS)
    ),
    id: `time-${index}`,
    name: pick(random, TIME_NAMES),
    timeType: pick(random, TIME_TYPES),
    teamReminders: pick(random, [null, [], { "team-0": 2 }]),
    assignedTeamIds: subset(random, TEAM_IDS),
    assignedPositionIds: subset(random, POSITION_IDS),
    splitTeamRehearsalAssignmentIds: [],
  });
};

const randomPlanTimes = (
  random: () => number,
  maxCount: number,
  aroundMs: number
): PlanTime[] =>
  Array.from({ length: integer(random, 0, maxCount) }, (_, index) =>
    randomPlanTime(random, index, aroundMs)
  );

const testPlanTime = (
  id: string,
  timeType: PlanTimeType,
  startsAt: string
): PlanTime =>
  planTime({
    id,
    name: "",
    startsAt: new Date(startsAt),
    endsAt: null,
    timeType,
    teamReminders: null,
    assignedTeamIds: [],
    assignedPositionIds: [],
    splitTeamRehearsalAssignmentIds: [],
  });

const TIMES_SEEDS: readonly PlanTime[][] = [
  [
    testPlanTime("late", "service", "2026-09-27T18:00:00Z"),
    testPlanTime("rehearsal", "rehearsal", "2026-09-24T02:00:00Z"),
    testPlanTime("early", "service", "2026-09-27T16:00:00Z"),
    testPlanTime("other", "other", "2026-09-27T15:00:00Z"),
  ],
  [
    testPlanTime("a", "service", "2026-09-27T16:00:00.000Z"),
    testPlanTime("b", "service", "2026-09-27T16:00:00.000Z"),
    testPlanTime("c", "rehearsal", "2026-09-27T15:59:59.999Z"),
    testPlanTime("d", "service", "2026-09-27T16:00:00.001Z"),
  ],
  [],
];

interface ScheduleSummary {
  rehearsalCount: number;
  serviceCount: number;
  timeIds: string[];
}

const randomTimeLists = (seed: number, count: number): PlanTime[][] => {
  const random = createRandom(seed);
  return Array.from({ length: count }, () =>
    randomPlanTimes(random, 6, PLAN_DATE_MS)
  );
};

const summarizeTimesSuite = defineParitySuite<PlanTime[], ScheduleSummary>({
  name: "plans.summarizeTimes",
  cases: [...TIMES_SEEDS, ...randomTimeLists(41, 100)],
  run: (times) => {
    const schedule = summarizeTimes(times);
    return {
      rehearsalCount: schedule.rehearsalCount,
      serviceCount: schedule.serviceCount,
      timeIds: schedule.times.map((time) => time.id),
    };
  },
});

interface ReadinessInput {
  order: PlanOrder | null;
  schedule: PlanSchedule | null;
  staffing: PlanStaffing | null;
}

const READINESS_SEEDS: readonly ReadinessInput[] = [
  {
    staffing: summarizeStaffing([band]),
    order: summarizeOrder([overviewSongItem("a", 1, null)]),
    schedule: summarizeTimes([]),
  },
  {
    staffing: summarizeStaffing([
      { ...band, positions: band.positions.slice(0, 1) },
    ]),
    order: null,
    schedule: summarizeTimes([
      testPlanTime("s", "service", "2026-09-27T16:00:00Z"),
      testPlanTime("r", "rehearsal", "2026-09-24T02:00:00Z"),
    ]),
  },
  {
    staffing: summarizeStaffing([unusedTeam]),
    order: summarizeOrder([]),
    schedule: null,
  },
  { staffing: null, order: null, schedule: null },
];

const readinessCases = (): ReadinessInput[] => {
  const random = createRandom(43);
  const generated = Array.from({ length: 100 }, () => ({
    staffing: sometimes(random, 0.8, () =>
      summarizeStaffing(randomGroups(random, 2, 2))
    ),
    order: sometimes(random, 0.8, () =>
      summarizeOrder(randomPlanItems(random, 5))
    ),
    schedule: sometimes(random, 0.8, () =>
      summarizeTimes(randomPlanTimes(random, 2, PLAN_DATE_MS))
    ),
  }));
  return [...READINESS_SEEDS, ...generated];
};

const buildReadinessChecksSuite = defineParitySuite<
  ReadinessInput,
  ReadinessCheck[]
>({
  name: "plans.buildReadinessChecks",
  cases: readinessCases(),
  run: buildReadinessChecks,
});

// Run sheet edits

interface ItemPosition {
  id: string;
  sequence: number;
}

/** The ids and sequences of a reordered list; the edits copy every other field unchanged. */
const positions = (items: readonly PlanItem[]): ItemPosition[] =>
  items.map(({ id, sequence }) => ({ id, sequence }));

const ABC = [createItem("a", 1), createItem("b", 2), createItem("c", 3)];

const sequenceItems = (sequences: readonly number[]): PlanItem[] =>
  sequences.map((sequence, index) => createItem(`item-${index}`, sequence));

const SEQUENCE_LISTS: readonly number[][] = [
  [],
  [1],
  [1, 2, 3],
  [3, 1, 2],
  [2, 2, 1, 1],
  [0.5, 0, -1, 10],
  [5, 5, 5],
  [1e9, 2, 3],
];

interface AppendInput {
  item: PlanItem;
  items: PlanItem[];
}

const appendCases = (): AppendInput[] => {
  const seeded = SEQUENCE_LISTS.flatMap((sequences) =>
    [0, 1, 2, 2.5, 5].map((sequence) => ({
      item: createItem("new", sequence),
      items: sequenceItems(sequences),
    }))
  );
  return [
    ...seeded,
    ...randomPlans(51, 30, 6).map((items, index) => ({
      item: createItem(`new-${index}`, index % 4),
      items,
    })),
  ];
};

const appendPlanItemSuite = defineParitySuite<AppendInput, ItemPosition[]>({
  name: "plans.appendPlanItem",
  cases: appendCases(),
  run: ({ item, items }) => positions(appendPlanItem(items, item)),
});

const nextPlanItemSequenceSuite = defineParitySuite<PlanItem[], number>({
  name: "plans.nextPlanItemSequence",
  cases: [
    ...SEQUENCE_LISTS.map(sequenceItems),
    [createItem("item-1", 1), createItem("item-2", 2)],
    sequenceItems([-3, -1]),
    ...randomPlans(53, 25, 6),
  ],
  run: nextPlanItemSequence,
});

interface BasicItemInput {
  id: string;
  kind: "header" | "item";
  sequence: number;
}

const createOptimisticBasicPlanItemSuite = defineParitySuite<
  BasicItemInput,
  PlanItem
>({
  name: "plans.createOptimisticBasicPlanItem",
  cases: [
    { id: "temp-header", kind: "header", sequence: 3 },
    { id: "temp-item", kind: "item", sequence: 2 },
    { id: "optimistic-item-1", kind: "item", sequence: 0.5 },
    { id: "", kind: "header", sequence: -1 },
  ],
  run: ({ id, kind, sequence }) =>
    createOptimisticBasicPlanItem(id, kind, sequence),
});

const catalogSong = (input: SongCatalogEntry): SongCatalogEntry =>
  songCatalogEntrySchema.parse(input);

interface SongItemInput {
  id: string;
  sequence: number;
  song: SongCatalogEntry;
}

const createOptimisticSongPlanItemSuite = defineParitySuite<
  SongItemInput,
  PlanItem
>({
  name: "plans.createOptimisticSongPlanItem",
  cases: [
    {
      id: "temp-song",
      sequence: 3,
      song: catalogSong({
        id: "song-1",
        title: "Grace Alone",
        author: "The Modern Post",
        themes: "Grace",
        hidden: false,
        lastScheduledAt: null,
      }),
    },
    {
      id: "optimistic-song-2",
      sequence: 7,
      song: catalogSong({
        id: "song-2",
        title: "Build My Life",
        author: "Pat Barrett",
        themes: "Worship",
        hidden: true,
        matchScore: 120,
        lastScheduledAt: new Date("2026-05-17T16:00:00.000Z"),
      }),
    },
  ],
  run: ({ id, sequence, song }) =>
    createOptimisticSongPlanItem(id, song, sequence),
});

interface ReplaceInput {
  itemId: string | null;
  items: PlanItem[];
  updatedItem: PlanItem;
}

const replaceCases = (): ReplaceInput[] => {
  const current = [
    createItem("item-1", 1),
    createOptimisticBasicPlanItem("temp-item", "item", 2),
  ];
  return [
    {
      itemId: "temp-item",
      items: current,
      updatedItem: createItem("server-item", 2),
    },
    { itemId: null, items: current, updatedItem: createItem("item-1", 5) },
    { itemId: null, items: current, updatedItem: createItem("missing", 1) },
    {
      itemId: "item-1",
      items: [...current, createItem("item-1", 3)],
      updatedItem: createItem("merged", 9),
    },
    { itemId: "missing", items: [], updatedItem: createItem("x", 1) },
  ];
};

const replacePlanItemSuite = defineParitySuite<ReplaceInput, PlanItem[]>({
  name: "plans.replacePlanItem",
  cases: replaceCases(),
  run: ({ itemId, items, updatedItem }) =>
    itemId === null
      ? replacePlanItem(items, updatedItem)
      : replacePlanItemById(items, itemId, updatedItem),
});

const draftOf = (overrides: Partial<DraftState> = {}): DraftState => ({
  title: "Build My Life",
  lengthText: "4:00",
  servicePosition: "during",
  description: "",
  arrangementId: "arr-1",
  keyId: "key-1",
  ...overrides,
});

const DRAFT_TITLES = ["Welcome", "", "Build My Life", "Item 1", "Café"];
const DRAFT_POSITIONS = ["pre", "during", "post", "", "middle", "Pre"];
const DRAFT_DESCRIPTIONS = [
  "",
  "Intro",
  "Before service",
  `Cafe${COMBINING_ACUTE}`,
];
const DRAFT_LENGTHS: readonly (number | null)[] = [
  null,
  0,
  -1,
  0.5,
  60,
  240,
  300,
];

const randomDraft = (random: () => number, item: PlanItem): DraftState =>
  chance(random, 0.3)
    ? buildDraft(item)
    : draftOf({
        title: chance(random, 0.5) ? item.title : pick(random, DRAFT_TITLES),
        servicePosition: chance(random, 0.6)
          ? item.servicePosition
          : pick(random, DRAFT_POSITIONS),
        description: chance(random, 0.6)
          ? item.description
          : pick(random, DRAFT_DESCRIPTIONS),
        arrangementId: pick(random, [
          item.arrangement?.id ?? "",
          "",
          "arr-1",
          "arr-2",
        ]),
        keyId: pick(random, [item.key?.id ?? "", "", "key-1", "key-2"]),
      });

interface ApplyDraftInput {
  arrangement: PlanItemArrangement | null;
  draft: DraftState;
  item: PlanItem;
  key: PlanItemKey | null;
  length: number | null;
}

const applyDraftCases = (): ApplyDraftInput[] => {
  const random = createRandom(61);
  const items = randomPlans(62, 25, 5).flat();
  return [
    {
      item: createItem("item-1", 1),
      draft: draftOf({
        title: "Welcome",
        servicePosition: "pre",
        description: "Before service",
      }),
      length: 0,
      arrangement: null,
      key: null,
    },
    ...items.map((item) => ({
      item,
      draft: randomDraft(random, item),
      length: pick(random, DRAFT_LENGTHS),
      arrangement: sometimes(random, 0.4, () =>
        randomArrangement(random, "arr-9")
      ),
      key: sometimes(random, 0.4, () => randomKey(random, "key-9")),
    })),
  ];
};

const applyPlanItemDraftSuite = defineParitySuite<ApplyDraftInput, PlanItem>({
  name: "plans.applyPlanItemDraft",
  cases: applyDraftCases(),
  run: ({ item, draft, length, arrangement, key }) =>
    applyPlanItemDraft(item, draft, length, arrangement, key),
});

interface DraftVariant {
  draft: DraftState;
  length: number | null;
}

/** One item and several drafts to diff against it, to keep the fixture small. */
interface DraftChangeInput {
  item: PlanItem;
  variants: DraftVariant[];
}

const songWithDetails = planItem({
  id: "song-item-1",
  itemType: "song",
  title: "Build My Life",
  song: {
    id: "song-1",
    title: "Build My Life",
    author: "Pat Barrett",
    themes: "",
    lastScheduledAt: null,
  },
  arrangement: {
    id: "arr-1",
    name: "Default",
    sequence: [],
    length: null,
    archivedAt: null,
  },
  key: { id: "key-1", name: "A", startingKey: null, endingKey: null },
  length: 300,
  description: "Intro",
});

const draftChangeCases = (): DraftChangeInput[] => {
  const random = createRandom(63);
  const seedDraft = draftOf({
    title: "Ignored for songs",
    description: "Intro",
  });
  return [
    {
      item: songWithDetails,
      variants: [
        { draft: seedDraft, length: 300 },
        { draft: { ...seedDraft, keyId: "key-2" }, length: 300 },
        { draft: seedDraft, length: 0 },
        { draft: { ...seedDraft, arrangementId: "" }, length: 300 },
      ],
    },
    ...randomPlans(64, 25, 5)
      .flat()
      .map((item) => ({
        item,
        variants: [
          { draft: buildDraft(item), length: item.length },
          ...Array.from({ length: 3 }, () => ({
            draft: randomDraft(random, item),
            length: pick(random, [item.length, ...DRAFT_LENGTHS]),
          })),
        ],
      })),
  ];
};

const planItemDraftChangesItemSuite = defineParitySuite<
  DraftChangeInput,
  boolean[]
>({
  name: "plans.planItemDraftChangesItem",
  cases: draftChangeCases(),
  run: ({ item, variants }) =>
    variants.map(({ draft, length }) =>
      planItemDraftChangesItem(item, draft, length)
    ),
});

const idsToTry = (items: readonly PlanItem[]): string[] => [
  ...items.map((item) => item.id),
  "missing",
];

/** One list and several ids to remove from it, one at a time. */
interface RemoveInput {
  itemIds: string[];
  items: PlanItem[];
}

const removePlanItemSuite = defineParitySuite<RemoveInput, ItemPosition[][]>({
  name: "plans.removePlanItem",
  cases: [
    {
      items: [
        createItem("item-1", 1),
        createItem("item-2", 2),
        createItem("item-3", 3),
      ],
      itemIds: ["item-2"],
    },
    ...randomPlans(71, 30, 6).map((items) => ({
      items,
      itemIds: idsToTry(items),
    })),
    { items: [createItem("a", 4), createItem("a", 5)], itemIds: ["a"] },
  ],
  run: ({ items, itemIds }) =>
    itemIds.map((itemId) => positions(removePlanItem(items, itemId))),
});

interface Move {
  fromIndex: number;
  toIndex: number;
}

/** One list and every move between the indexes, each from the original list. */
interface MoveInput {
  items: PlanItem[];
  moves: Move[];
}

const INDEXES = [-5, -2, -1, 0, 1, 2, 3, 4, 7];

const movePlanItemSuite = defineParitySuite<MoveInput, ItemPosition[][]>({
  name: "plans.movePlanItem",
  cases: [ABC, sequenceItems([4, 9, 2, 7, 1]), [createItem("only", 3)], []].map(
    (items) => ({
      items,
      moves: INDEXES.flatMap((fromIndex) =>
        INDEXES.map((toIndex) => ({ fromIndex, toIndex }))
      ),
    })
  ),
  run: ({ items, moves }) =>
    moves.map(({ fromIndex, toIndex }) =>
      positions(movePlanItem(items, fromIndex, toIndex))
    ),
});

interface Reorder {
  draggedItemId: string;
  targetItemId: string;
}

/** One list and every drag between its ids (and a missing one). */
interface ReorderInput {
  items: PlanItem[];
  reorders: Reorder[];
}

const reorderCases = (): ReorderInput[] =>
  [
    [createItem("item-1", 1), createItem("item-2", 2)],
    ABC,
    sequenceItems([4, 9, 2, 7, 1]),
  ].map((items) => ({
    items,
    reorders: idsToTry(items).flatMap((draggedItemId) =>
      idsToTry(items).map((targetItemId) => ({ draggedItemId, targetItemId }))
    ),
  }));

const reorderPlanItemsSuite = defineParitySuite<ReorderInput, ItemPosition[][]>(
  {
    name: "plans.reorderPlanItems",
    cases: reorderCases(),
    run: ({ items, reorders }) =>
      reorders.map(({ draggedItemId, targetItemId }) =>
        positions(reorderPlanItems(items, draggedItemId, targetItemId))
      ),
  }
);

interface InsertInput {
  insertion?: PlanInsertion;
  item: PlanItem;
  items: PlanItem[];
}

const insertCases = (): InsertInput[] => {
  const lists = [ABC, [], sequenceItems([7, 7]), [createItem("solo", 1)]];
  const added = createItem("new", 0);
  return lists.flatMap((items) => [
    { items, item: added },
    { items, item: added, insertion: { afterItemId: null } },
    ...idsToTry(items).map((afterItemId) => ({
      items,
      item: added,
      insertion: { afterItemId },
    })),
  ]);
};

const insertPlanItemSuite = defineParitySuite<InsertInput, ItemPosition[]>({
  name: "plans.insertPlanItem",
  cases: insertCases(),
  run: ({ items, item, insertion }) =>
    positions(insertPlanItem(items, item, insertion)),
});

interface ShiftInput {
  itemId: string;
  items: PlanItem[];
  offset: -1 | 1;
}

const shiftPlanItemSuite = defineParitySuite<ShiftInput, ItemPosition[]>({
  name: "plans.shiftPlanItem",
  cases: [ABC, sequenceItems([4, 9, 2, 7]), [createItem("only", 3)]].flatMap(
    (items) =>
      idsToTry(items).flatMap((itemId) =>
        ([-1, 1] as const).map((offset) => ({ items, itemId, offset }))
      )
  ),
  run: ({ items, itemId, offset }) =>
    positions(shiftPlanItem(items, itemId, offset)),
});

interface SameOrderInput {
  current: PlanItem[];
  next: PlanItem[];
}

const sameOrderCases = (): SameOrderInput[] => {
  const current = [createItem("item-1", 1), createItem("item-2", 2)];
  return [
    {
      current,
      next: [createItem("item-1", 10), createItem("item-2", 11)],
    },
    { current, next: [createItem("item-2", 1), createItem("item-1", 2)] },
    { current, next: [createItem("item-1", 1)] },
    { current: [], next: [] },
    { current: ABC, next: shiftPlanItem(ABC, "b", 1) },
    { current: ABC, next: removePlanItem(ABC, "c") },
    { current: ABC, next: ABC.map((item) => ({ ...item, title: "Changed" })) },
  ];
};

const planItemsHaveSameOrderSuite = defineParitySuite<SameOrderInput, boolean>({
  name: "plans.planItemsHaveSameOrder",
  cases: sameOrderCases(),
  run: ({ current, next }) => planItemsHaveSameOrder(current, next),
});

/** One plan and several limits; null stands for the default limit (no argument). */
interface PrefetchInput {
  items: PlanItem[];
  limits: (number | null)[];
}

const prefetchCases = (): PrefetchInput[] => {
  const seeded = [
    createItem("item-1", 1),
    createSongItem("song-item-1", 2, "song-1"),
    createSongItem("song-item-2", 3, "song-1"),
    createSongItem("song-item-3", 4, "song-2"),
    createSongItem("song-item-4", 5, "song-3"),
  ];
  return [
    { items: seeded, limits: [2, null, -1, 0, 1, 3, 4, 6] },
    { items: [createSongItem("song-item-1", 1, "song-1")], limits: [0] },
    ...randomPlans(81, 40, 12).map((items) => ({
      items,
      limits: [null, 1, 3],
    })),
  ];
};

const collectPlanSongOptionPrefetchIdsSuite = defineParitySuite<
  PrefetchInput,
  string[][]
>({
  name: "plans.collectPlanSongOptionPrefetchIds",
  cases: prefetchCases(),
  run: ({ items, limits }) =>
    limits.map((limit) =>
      limit === null
        ? collectPlanSongOptionPrefetchIds(items)
        : collectPlanSongOptionPrefetchIds(items, limit)
    ),
});

// Run sheet helpers

const buildDraftSuite = defineParitySuite<PlanItem, DraftState>({
  name: "plans.buildDraft",
  cases: [
    ...LENGTHS.map((length, index) =>
      planItem({ id: `length-${index}`, length })
    ),
    planItem({ id: "huge", length: 1e20 }),
    planItem({ id: "hours", length: 36_005.75 }),
    songWithDetails,
    ...randomPlans(91, 15, 5).flat(),
  ],
  run: buildDraft,
});

const LENGTH_TEXTS: readonly string[] = [
  "",
  "   ",
  "0",
  "45",
  "4:05",
  "04:05",
  "1:02:03",
  "1:75",
  "61:00",
  " 4 : 05 ",
  "4:",
  ":05",
  "::",
  "1:2:3:4",
  "4.5",
  "4:05.5",
  "-4:05",
  "+4:05",
  "abc",
  "4:0x5",
  "1e3",
  "٤:٠٥",
  "４:05",
  `${NO_BREAK_SPACE}4:05${NO_BREAK_SPACE}`,
  `${BYTE_ORDER_MARK}4:05`,
  `4${LINE_SEPARATOR}0`,
  "007:08",
  "99999999999999999999",
  "123456789012345678901234567890:00",
  "0:0:0",
  "1:00:00",
];

const parseLengthTextSuite = defineParitySuite<string, ParsedLengthText>({
  name: "plans.parseLengthText",
  cases: [...LENGTH_TEXTS],
  run: parseLengthText,
});

const formatLengthSuite = defineParitySuite<number | null, string | null>({
  name: "plans.formatLength",
  cases: [
    null,
    0,
    -0,
    -5,
    0.25,
    1,
    5,
    9,
    10,
    45,
    59,
    59.5,
    60,
    61,
    65,
    65.5,
    119.999,
    600,
    3599,
    3600,
    3661,
    86_400,
    1e-7,
    1e21,
    123_456.789,
  ],
  run: formatLength,
});

interface RunSheetEntryOutput {
  id: string;
  sectionLength: number | null;
}

const runSheetSeed = (
  id: string,
  itemType: PlanItemType,
  length: number | null
): PlanItem => planItem({ id, itemType, length, sequence: 0 });

const buildRunSheetSuite = defineParitySuite<PlanItem[], RunSheetEntryOutput[]>(
  {
    name: "plans.buildRunSheet",
    cases: [
      [
        runSheetSeed("set", "header", null),
        runSheetSeed("song-a", "song", 300),
        runSheetSeed("song-b", "song", 240),
        runSheetSeed("empty", "header", null),
        runSheetSeed("sermon-header", "header", null),
        runSheetSeed("sermon", "item", 2400),
      ],
      [
        runSheetSeed("x", "item", 30),
        runSheetSeed("x", "header", null),
        runSheetSeed("y", "song", 12.5),
        runSheetSeed("x", "header", 99),
        runSheetSeed("z", "media", -4),
      ],
      [],
      ...randomPlans(101, 50, 8),
    ],
    run: (items) =>
      [...buildRunSheet(items)].map(([id, entry]) => ({
        id,
        sectionLength: entry.sectionLength,
      })),
  }
);

const itemTypeLabelSuite = defineParitySuite<PlanItem, string>({
  name: "plans.itemTypeLabel",
  cases: (["song", "header", "item", "media"] as const).map((itemType) =>
    planItem({ id: itemType, itemType })
  ),
  run: getItemTypeLabel,
});

const servicePositionLabelSuite = defineParitySuite<string | null, string>({
  name: "plans.servicePositionLabel",
  cases: ["pre", "during", "post", null, "", "Pre", "middle", " pre"],
  run: getServicePositionLabel,
});

const arrangementOption = (input: ArrangementOption): ArrangementOption =>
  arrangementOptionSchema.parse(input);

const keyChoice = (id: string, startingKey: string | null): KeyOption => ({
  id,
  name: startingKey ?? "",
  startingKey,
  endingKey: null,
});

const ARRANGEMENTS: readonly ArrangementOption[] = [
  arrangementOption({
    id: "arr-1",
    name: "Default",
    sequence: ["Verse 1"],
    length: 240,
    bpm: null,
    meter: null,
    archived: false,
    keys: [keyChoice("key-1", "G")],
  }),
  arrangementOption({
    id: "arr-2",
    name: "Acoustic",
    sequence: [],
    length: null,
    bpm: 72,
    meter: "4/4",
    archived: false,
    keys: [
      keyChoice("key-2", "A"),
      keyChoice("key-3", "B"),
      keyChoice("", null),
    ],
  }),
  arrangementOption({
    id: "arr-3",
    name: "Empty",
    sequence: [],
    length: null,
    bpm: null,
    meter: null,
    archived: true,
    keys: [],
  }),
  arrangementOption({
    id: "arr-4",
    name: "Blank first",
    sequence: [],
    length: null,
    bpm: 120.5,
    meter: "6/8",
    archived: false,
    keys: [keyChoice("", "C"), keyChoice("key-4", "D")],
  }),
];

const KEY_IDS = ["key-1", "key-2", "key-3", "key-4", "", "missing"];
const SUGGESTED_KEY_IDS = [null, "key-1", "key-3", "key-4", "", "missing"];

interface PickKeyInput {
  arrangement: ArrangementOption;
  currentKeyId: string;
  suggestedKeyId: string | null;
}

const pickKeyIdSuite = defineParitySuite<PickKeyInput, string>({
  name: "plans.pickKeyId",
  cases: ARRANGEMENTS.flatMap((arrangement) =>
    KEY_IDS.flatMap((currentKeyId) =>
      SUGGESTED_KEY_IDS.map((suggestedKeyId) => ({
        arrangement,
        currentKeyId,
        suggestedKeyId,
      }))
    )
  ),
  run: ({ arrangement, currentKeyId, suggestedKeyId }) =>
    pickKeyId(arrangement, currentKeyId, suggestedKeyId),
});

const songOptionsOf = (
  arrangements: readonly ArrangementOption[],
  suggestedKeyId: string | null
): SongOptionSet =>
  songOptionSetSchema.parse({
    song: {
      id: "song-1",
      title: "Build My Life",
      author: "Pat Barrett",
      themes: "Worship",
      hidden: false,
      lastScheduledAt: null,
    },
    arrangements,
    layouts: [],
    currentLayout: null,
    suggestedArrangementId: arrangements[0]?.id ?? null,
    suggestedKeyId,
    suggestedLayoutId: null,
    layoutMode: "existing-only",
  });

/** One set of song options (or none) and every draft to repair against it. */
interface SynchronizeInput {
  drafts: DraftState[];
  songOptions: SongOptionSet | null;
}

const synchronizeCases = (): SynchronizeInput[] => {
  const drafts = ["", "arr-1", "arr-2", "arr-3", "arr-4", "missing"].flatMap(
    (arrangementId) => KEY_IDS.map((keyId) => draftOf({ arrangementId, keyId }))
  );
  return [
    null,
    songOptionsOf(ARRANGEMENTS.slice(0, 1), "key-1"),
    songOptionsOf(ARRANGEMENTS, "key-3"),
    songOptionsOf(ARRANGEMENTS, null),
    songOptionsOf([], null),
  ].map((songOptions) => ({ drafts, songOptions }));
};

const synchronizeDraftSuite = defineParitySuite<SynchronizeInput, DraftState[]>(
  {
    name: "plans.synchronizeDraft",
    cases: synchronizeCases(),
    run: ({ drafts, songOptions }) =>
      drafts.map((draft) =>
        synchronizeDraftWithSongOptions(draft, songOptions)
      ),
  }
);

// Set insights

const INSIGHT_SEED_ITEMS: readonly PlanItem[][] = [
  [
    songItem("egypt", { start: "Eb" }),
    planItem({ id: "prayer", sequence: 0 }),
    songItem("blood", { start: "Bb", end: "C" }),
    songItem("cross", { start: "F#" }),
  ],
  [
    songItem("a", { start: "Bb" }),
    planItem({ id: "prayer", sequence: 0, length: 90 }),
    songItem("b", { start: "E" }),
  ],
  [
    songItem("a", { start: "G" }),
    planItem({ id: "set", itemType: "header", sequence: 0 }),
    songItem("b", { start: "C#" }),
    songItem("c"),
    songItem("d", { start: "D" }),
  ],
  [
    planItem({ ...songItem("untitled", { start: "G" }), title: "" }),
    planItem({ id: "", title: "", sequence: 0, length: 60 }),
    planItem({ ...songItem("next", { start: "C#m" }), title: "" }),
    planItem({ id: "short", sequence: 0, length: 59 }),
    songItem("after-short", { start: "Abm" }),
  ],
];

const keyTransitionsSuite = defineParitySuite<PlanItem[], KeyTransition[]>({
  name: "plans.keyTransitions",
  cases: [...INSIGHT_SEED_ITEMS, ...randomPlans(111, 120, 8)],
  run: keyTransitions,
});

interface RecentPlayInput {
  item: PlanItem;
  planDate: Date | null;
}

const recentPlayCases = (): RecentPlayInput[] => {
  const planDate = new Date("2026-10-04T17:00:00Z");
  const offsets = [
    -DAY_MS,
    0,
    1,
    DAY_MS - 1,
    DAY_MS,
    DAY_MS + 1,
    7 * DAY_MS,
    14 * DAY_MS,
    28 * DAY_MS,
    28 * DAY_MS + 1,
    29 * DAY_MS - 1,
    29 * DAY_MS,
    64 * DAY_MS,
  ];
  return [
    {
      item: songItem("a", {}, new Date("2026-09-20T17:00:00Z")),
      planDate,
    },
    { item: songItem("a", {}, new Date("2026-08-01T17:00:00Z")), planDate },
    { item: songItem("b", {}, planDate), planDate },
    { item: planItem({ id: "c" }), planDate },
    {
      item: songItem("d", {}, new Date("2026-09-20T17:00:00Z")),
      planDate: null,
    },
    ...offsets.map((offset) => ({
      item: songItem("o", {}, new Date(planDate.getTime() - offset)),
      planDate,
    })),
  ];
};

const daysSinceRecentPlaySuite = defineParitySuite<
  RecentPlayInput,
  number | null
>({
  name: "plans.daysSinceRecentPlay",
  cases: recentPlayCases(),
  run: ({ item, planDate }) => daysSinceRecentPlay(item, planDate),
});

interface InsightsInput {
  items: PlanItem[];
  planDate: Date | null;
}

interface InsightsOutput {
  recentPlays: { days: number; itemId: string }[];
  transitions: {
    bridgedBy: string | null;
    fromItemId: string;
    itemId: string;
    level: string;
  }[];
}

const insightsCases = (): InsightsInput[] => {
  const random = createRandom(121);
  return [
    {
      items: [
        songItem("a", { start: "C" }, new Date("2026-09-27T17:00:00Z")),
        songItem("b", { start: "F#" }),
        songItem("c", { start: "G" }),
      ],
      planDate: new Date("2026-10-04T17:00:00Z"),
    },
    ...Array.from({ length: 60 }, () => ({
      items: randomPlanItems(random, 8),
      planDate: chance(random, 0.9) ? new Date(PLAN_DATE_MS) : null,
    })),
  ];
};

const buildPlanInsightsSuite = defineParitySuite<InsightsInput, InsightsOutput>(
  {
    name: "plans.buildPlanInsights",
    cases: insightsCases(),
    run: ({ items, planDate }) => {
      const insights = buildPlanInsights(items, planDate);
      return {
        recentPlays: [...insights.recentPlays].map(([itemId, days]) => ({
          days,
          itemId,
        })),
        transitions: [...insights.transitions].map(([itemId, transition]) => ({
          bridgedBy: transition.bridgedBy,
          fromItemId: transition.fromItemId,
          itemId,
          level: transition.level,
        })),
      };
    },
  }
);

// Plan times

/** Zones with DST (half-hour and 45-minute offsets among them) and fixed ones. */
const TIME_ZONES: readonly string[] = [
  "America/Los_Angeles",
  "America/New_York",
  "America/Denver",
  "Europe/London",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Pacific/Chatham",
  "America/St_Johns",
  "Asia/Kolkata",
  "UTC",
  "",
];

/** 2026 offset changes: US, Europe, Australia, and New Zealand. */
const TRANSITIONS_MS: readonly number[] = [
  "2026-03-08T10:00:00Z",
  "2026-11-01T09:00:00Z",
  "2026-03-29T01:00:00Z",
  "2026-10-25T01:00:00Z",
  "2026-04-04T16:00:00Z",
  "2026-10-03T16:00:00Z",
  "2026-04-04T14:00:00Z",
  "2026-09-26T14:00:00Z",
  "2026-10-04T07:00:00Z",
  "2026-12-31T23:30:00Z",
].map((iso) => Date.parse(iso));

const timeGroups = (random: () => number): TeamPositionGroup[] | undefined =>
  chance(random, 0.2) ? undefined : randomGroups(random, 2, 3);

interface EditableInput {
  groups?: TeamPositionGroup[];
  planTime: PlanTime;
  timeZone: string;
}

const editableCases = (seed: number, count: number): EditableInput[] => {
  const random = createRandom(seed);
  return Array.from({ length: count }, (_, index) => ({
    groups: timeGroups(random),
    planTime: randomPlanTime(random, index % 3, pick(random, TRANSITIONS_MS)),
    timeZone: pick(random, TIME_ZONES),
  }));
};

const VALID_DATES: readonly string[] = [
  "2026-09-27",
  "2026-09-28",
  "2026-02-28",
  "2026-02-29",
  "2026-02-30",
  "2026-02-31",
  "2026-04-31",
  "2024-02-29",
  "2026-12-31",
  "2027-01-01",
  "0099-01-05",
  "0000-03-01",
  "1999-12-31",
];

const MALFORMED_DATES: readonly string[] = [
  "2026-13-01",
  "2026-00-10",
  "2026-01-00",
  "2026-02-32",
  "2026-1-05",
  "2026-01-5",
  "26-01-05",
  "2026/01/05",
  "2026-01-05 ",
  " 2026-01-05",
  "2026-09-27T10:00",
  "２０２６-09-27",
  "",
  "abc",
];

const NUMERIC_TIMES: readonly string[] = [
  "00:00",
  "09:00",
  "09:30",
  "9:00",
  "09",
  "9",
  "12:00",
  "23:59",
  "24:00",
  "24:01",
  "25:00",
  "12:60",
  "09:00:30",
  "09:5",
  "0900",
  " 09:00",
  "09:00 ",
  "-1:00",
  "+09:00",
  "09:00Z",
  "",
];

/**
 * V8's fallback parser reads a malformed date with a non-numeric time (`abcTnoon:00`) as
 * January 1, 2000, which the port deliberately rejects; these times only pair with
 * well-formed dates.
 */
const WORDY_TIMES: readonly string[] = ["noon", "ab:cd"];

const NAMES: readonly string[] = [
  "Service",
  "",
  "   ",
  NO_BREAK_SPACE,
  BYTE_ORDER_MARK,
  "9 AM",
];

const validityCases = (): EditablePlanTime[] => {
  const random = createRandom(141);
  const base: EditablePlanTime = {
    name: "Service",
    timeType: "service",
    startDate: "2026-09-27",
    startTime: "09:00",
    endDate: "2026-09-27",
    endTime: "10:15",
    assignedTeamIds: [],
    assignedPositionIds: [],
    assignedNeededPositionIds: [],
    assignedPlanPersonIds: [],
  };
  const date = (): string =>
    pick(random, chance(random, 0.75) ? VALID_DATES : MALFORMED_DATES);
  const dateAndTime = (): [string, string] => {
    const day = date();
    const wordy = VALID_DATES.includes(day) && chance(random, 0.1);
    return [day, pick(random, wordy ? WORDY_TIMES : NUMERIC_TIMES)];
  };
  const generated = Array.from({ length: 400 }, () => {
    const [startDate, startTime] = dateAndTime();
    const [endDate, endTime] = chance(random, 0.4)
      ? [startDate, pick(random, NUMERIC_TIMES)]
      : dateAndTime();
    return {
      ...base,
      name: chance(random, 0.85) ? "Service" : pick(random, NAMES),
      startDate,
      startTime,
      endDate,
      endTime,
    };
  });
  return [
    base,
    { ...base, endTime: "" },
    { ...base, endTime: "08:59" },
    { ...base, endTime: "09:00" },
    { ...base, endDate: "2026-09-26", endTime: "23:00" },
    { ...base, endDate: "", endTime: "10:00" },
    { ...base, name: " " },
    { ...base, startDate: "" },
    { ...base, startTime: "" },
    ...generated,
  ];
};

interface ValidityOutput {
  message: string;
  valid: boolean;
}

/** `isValidPlanTimeEdit` reads the host zone; Vitest runs in UTC, so Swift replays with UTC. */
const isValidPlanTimeEditSuite = defineParitySuite<
  EditablePlanTime,
  ValidityOutput
>({
  name: "plans.isValidPlanTimeEdit",
  cases: validityCases(),
  run: (edit) => ({
    message: getInvalidPlanTimeEditMessage(edit),
    valid: isValidPlanTimeEdit(edit),
  }),
});

interface EditInput {
  edit: EditablePlanTime;
  groups?: TeamPositionGroup[];
  planTime: PlanTime;
  timeZone: string;
}

const WALL_DATES: readonly string[] = [
  "2026-03-08",
  "2026-11-01",
  "2026-03-29",
  "2026-10-25",
  "2026-04-05",
  "2026-10-04",
  "2026-09-27",
  "2026-12-31",
  "2027-01-01",
  "2026-02-28",
  "2028-02-29",
];

const WALL_TIMES: readonly string[] = [
  "00:00",
  "00:30",
  "01:00",
  "01:30",
  "02:00",
  "02:30",
  "02:45",
  "03:00",
  "03:30",
  "09:00",
  "12:00",
  "18:45",
  "23:30",
  "23:59",
];

const ID_POOL = [
  "team-0",
  "team-1",
  "position-0-0",
  "needed-0-0",
  "needed-1-1",
  "needed-2-0",
  "plan-person-1",
  "plan-person-2",
  "plan-person-3",
  "plan-person-4",
];

const mutateIds = (random: () => number, ids: readonly string[]): string[] => {
  const choice = integer(random, 0, 5);
  if (choice === 0) {
    return [...ids];
  }
  if (choice === 1) {
    return ids.toReversed();
  }
  if (choice === 2) {
    return ids.slice(1);
  }
  if (choice === 3) {
    return [...ids, pick(random, ID_POOL)];
  }
  if (choice === 4) {
    return ids.length === 0 ? [] : [...ids.slice(1), ids[0] ?? ""];
  }
  return subset(random, ID_POOL);
};

const mutateEdit = (
  random: () => number,
  edit: EditablePlanTime
): EditablePlanTime => {
  const changed = { ...edit };
  if (chance(random, 0.2)) {
    changed.name = pick(random, [" Renamed ", edit.name, `${edit.name} `, "x"]);
  }
  if (chance(random, 0.15)) {
    changed.timeType = pick(random, TIME_TYPES);
  }
  if (chance(random, 0.3)) {
    changed.startDate = pick(random, WALL_DATES);
    changed.startTime = pick(random, WALL_TIMES);
  }
  if (chance(random, 0.3)) {
    changed.endDate = pick(random, [...WALL_DATES, ""]);
    changed.endTime = pick(random, [...WALL_TIMES, ""]);
  }
  changed.assignedTeamIds = mutateIds(random, edit.assignedTeamIds);
  changed.assignedPositionIds = mutateIds(random, edit.assignedPositionIds);
  changed.assignedNeededPositionIds = mutateIds(
    random,
    edit.assignedNeededPositionIds
  );
  changed.assignedPlanPersonIds = mutateIds(random, edit.assignedPlanPersonIds);
  return changed;
};

const editCases = (seed: number, count: number): EditInput[] =>
  editableCases(seed, count).map(
    ({ groups, planTime: time, timeZone }, index) => {
      const random = createRandom(seed + index + 1);
      const original = buildEditablePlanTime(time, timeZone, groups);
      return {
        edit: chance(random, 0.15) ? original : mutateEdit(random, original),
        groups,
        planTime: time,
        timeZone,
      };
    }
  );

interface PlanTimeEditsOutput {
  /** `buildEditablePlanTime(planTime, timeZone, groups)`: the form before editing. */
  editable: EditablePlanTime;
  /** `planTimeEditHasChanges` for the edited form. */
  hasChanges: boolean;
  /** `buildPlanTimePatch` for the edited form. */
  patch: ReturnType<typeof buildPlanTimePatch>;
}

/** The three form functions share inputs, so one fixture pins them together. */
const planTimeEditsSuite = defineParitySuite<EditInput, PlanTimeEditsOutput>({
  name: "plans.planTimeEdits",
  cases: editCases(151, 160),
  run: ({ planTime: time, edit, timeZone, groups }) => ({
    editable: buildEditablePlanTime(time, timeZone, groups),
    hasChanges: planTimeEditHasChanges(time, edit, timeZone, groups),
    patch: buildPlanTimePatch(time, edit, timeZone, groups),
  }),
});

interface DefaultEditInput {
  now: Date;
  planTimes: PlanTime[];
  timeZone: string;
}

/** `buildDefaultNewPlanTimeEdit` reads the clock, so each case runs with the clock at `now`. */
const withSystemTime = <Output>(now: Date, run: () => Output): Output => {
  vi.useFakeTimers({ now, toFake: ["Date"] });
  try {
    return run();
  } finally {
    vi.useRealTimers();
  }
};

const defaultEditCases = (): DefaultEditInput[] => {
  const random = createRandom(171);
  return Array.from({ length: 100 }, () => {
    const around = pick(random, TRANSITIONS_MS);
    return {
      now: new Date(around + integer(random, -8, 8) * 15 * MINUTE_MS + 17_123),
      planTimes: chance(random, 0.3) ? [] : randomPlanTimes(random, 4, around),
      timeZone: pick(random, TIME_ZONES),
    };
  });
};

const buildDefaultNewPlanTimeEditSuite = defineParitySuite<
  DefaultEditInput,
  EditablePlanTime
>({
  name: "plans.buildDefaultNewPlanTimeEdit",
  cases: defaultEditCases(),
  run: ({ now, planTimes, timeZone }) =>
    withSystemTime(now, () => buildDefaultNewPlanTimeEdit(planTimes, timeZone)),
});

interface CreateInput {
  edit: EditablePlanTime;
  timeZone: string;
}

type CreatePlanTimeRequest = ReturnType<typeof buildCreatePlanTimeRequest>;

const createCases = (): CreateInput[] => {
  const random = createRandom(181);
  return editCases(182, 120).map(({ edit, timeZone }) => ({
    edit: chance(random, 0.5) ? mutateEdit(random, edit) : edit,
    timeZone,
  }));
};

const buildCreatePlanTimeRequestSuite = defineParitySuite<
  CreateInput,
  CreatePlanTimeRequest
>({
  name: "plans.buildCreatePlanTimeRequest",
  cases: createCases(),
  run: ({ edit, timeZone }) => buildCreatePlanTimeRequest(edit, timeZone),
});

interface RangeInput {
  endDate: string;
  endTime: string;
  startDate: string;
  startTime: string;
}

const RANGE_DATES: readonly string[] = [
  "2026-09-27",
  "2026-09-28",
  "2026-02-29",
  "2026-02-31",
  "2026-13-45",
  "0099-01-05",
  "1999-12-31",
  "2026-9-27",
  "2026-09-27 ",
  "",
];

const RANGE_TIMES: readonly string[] = [
  "09:00",
  "00:00",
  "00:05",
  "12:00",
  "12:30",
  "13:05",
  "23:59",
  "24:00",
  "7:5",
  " 9:00",
  "9",
  "",
  "abc",
  "09:xx",
  "1.5:30",
  "-1:00",
  "-0:00",
  "0x0A:00",
  "1e1:00",
  "Infinity:00",
  "12:00:30",
  ":30",
  "09:",
];

const rangeCases = (): RangeInput[] => {
  const random = createRandom(191);
  return [
    { startDate: "", startTime: "", endDate: "", endTime: "" },
    {
      startDate: "2026-09-27",
      startTime: "09:00",
      endDate: "2026-09-27",
      endTime: "10:15",
    },
    {
      startDate: "2026-09-27",
      startTime: "21:00",
      endDate: "2026-09-28",
      endTime: "01:00",
    },
    ...Array.from({ length: 300 }, () => ({
      startDate: pick(random, RANGE_DATES),
      startTime: pick(random, RANGE_TIMES),
      endDate: pick(random, RANGE_DATES),
      endTime: pick(random, RANGE_TIMES),
    })),
  ];
};

const formatPlanTimeRangeLabelSuite = defineParitySuite<RangeInput, string>({
  name: "plans.formatPlanTimeRangeLabel",
  cases: rangeCases(),
  run: formatPlanTimeRangeLabel,
});

// Agenda rows

/**
 * The rows `useServicePlanSelection` builds (apps/web/src/hooks/use-service-plan-selection.ts).
 * The hook exports no function for them, so this is a copy of its `useMemo`; keep it in step.
 */
const servicePlanRows = (
  serviceTypes: readonly ServiceType[],
  plansByServiceTypeId: Readonly<Record<string, Plan[]>>,
  selectedServiceTypeIds: readonly string[]
): ServicePlanRow[] => {
  const selected = new Set(selectedServiceTypeIds);
  const flattened: ServicePlanRow[] = [];
  for (const serviceType of serviceTypes) {
    if (selected.has(serviceType.id)) {
      for (const plan of plansByServiceTypeId[serviceType.id] ?? []) {
        const sortDate = parsePlanDate(plan.sortDate);
        if (sortDate) {
          flattened.push({
            serviceTypeId: serviceType.id,
            serviceTypeName: serviceType.name,
            serviceTypeSequence: serviceType.sequence,
            planId: plan.id,
            planTitle: plan.title,
            seriesTitle: plan.seriesTitle ?? null,
            seriesId: plan.seriesId ?? null,
            sortDate,
          });
        }
      }
    }
  }
  return flattened.toSorted((a, b) => {
    const byDate = a.sortDate.getTime() - b.sortDate.getTime();
    if (byDate !== 0) {
      return byDate;
    }
    const byServiceOrder = a.serviceTypeSequence - b.serviceTypeSequence;
    if (byServiceOrder !== 0) {
      return byServiceOrder;
    }
    const byServiceName = a.serviceTypeName.localeCompare(b.serviceTypeName);
    if (byServiceName !== 0) {
      return byServiceName;
    }
    return a.planTitle.localeCompare(b.planTitle);
  });
};

const SERVICE_TYPE_NAMES = [
  "Sunday",
  "sunday",
  "Youth",
  "Éclair Night",
  "Eclair Night",
  "Agape",
  "10 AM",
  "9 AM",
];

const PLAN_TITLES = [
  "",
  "Easter",
  "easter",
  "Christmas Eve",
  "Advent 1",
  "Advent 10",
  "Advent 2",
  "Café",
  "Cafe",
];

interface RowsInput {
  plansByServiceTypeId: Record<string, Plan[]>;
  selectedServiceTypeIds: string[];
  serviceTypes: ServiceType[];
}

const randomCatalog = (random: () => number): RowsInput => {
  const serviceTypes = Array.from(
    { length: integer(random, 1, 4) },
    (_, index) =>
      serviceTypeSchema.parse({
        id: `st-${index}`,
        name: pick(random, SERVICE_TYPE_NAMES),
        sequence: integer(random, 0, 4) / 2,
      })
  );
  const plansByServiceTypeId: Record<string, Plan[]> = {};
  for (const serviceType of serviceTypes) {
    plansByServiceTypeId[serviceType.id] = Array.from(
      { length: integer(random, 0, 5) },
      (_, index) => {
        const sortDate = sometimes(
          random,
          0.9,
          () =>
            new Date(
              PLAN_DATE_MS +
                integer(random, -2, 2) * DAY_MS +
                integer(random, -1, 1) * HOUR_MS
            )
        );
        const seriesTitle = sometimes(random, 0.5, () =>
          pick(random, ["", "Advent"])
        );
        // Optional contract fields: `undefined` leaves the key out of the fixture.
        return planSchema.parse({
          id: `${serviceType.id}-plan-${index}`,
          title: pick(random, PLAN_TITLES),
          seriesTitle: seriesTitle ?? undefined,
          seriesId: pick(random, [undefined, null, "series-1"]),
          createdAt: new Date(PLAN_DATE_MS - 30 * DAY_MS),
          sortDate: sortDate ?? undefined,
        });
      }
    );
  }
  return {
    plansByServiceTypeId,
    selectedServiceTypeIds: subset(
      random,
      serviceTypes.map((serviceType) => serviceType.id)
    ),
    serviceTypes,
  };
};

const rowsCases = (): RowsInput[] => {
  const random = createRandom(201);
  return Array.from({ length: 60 }, () => randomCatalog(random));
};

const servicePlanRowsSuite = defineParitySuite<RowsInput, ServicePlanRow[]>({
  name: "plans.servicePlanRows",
  cases: rowsCases(),
  run: ({ serviceTypes, plansByServiceTypeId, selectedServiceTypeIds }) =>
    servicePlanRows(serviceTypes, plansByServiceTypeId, selectedServiceTypeIds),
});

interface GroupRowsInput {
  rows: ServicePlanRow[];
  timeZone: string;
}

interface GroupedMonth {
  days: { date: Date; dayKey: string; planIds: string[] }[];
  heading: string;
}

const groupRowsCases = (): GroupRowsInput[] => {
  const random = createRandom(211);
  return Array.from({ length: 50 }, () => {
    const { serviceTypes, plansByServiceTypeId } = randomCatalog(random);
    return {
      rows: servicePlanRows(
        serviceTypes,
        plansByServiceTypeId,
        serviceTypes.map((serviceType) => serviceType.id)
      ),
      timeZone: pick(random, TIME_ZONES),
    };
  });
};

const groupServicePlanRowsSuite = defineParitySuite<
  GroupRowsInput,
  GroupedMonth[]
>({
  name: "plans.groupServicePlanRows",
  cases: groupRowsCases(),
  run: ({ rows, timeZone }) =>
    groupPlansByMonthAndDay(rows, timeZone).map((month) => ({
      days: month.days.map((day) => ({
        date: day.date,
        dayKey: day.dayKey,
        planIds: day.rows.map((row) => row.planId),
      })),
      heading: month.heading,
    })),
});

export const plansParitySuites: readonly ParitySuite[] = [
  summarizeStaffingSuite,
  keyLabelsSuite,
  summarizeOrderSuite,
  summarizeTimesSuite,
  buildReadinessChecksSuite,
  appendPlanItemSuite,
  nextPlanItemSequenceSuite,
  createOptimisticBasicPlanItemSuite,
  createOptimisticSongPlanItemSuite,
  replacePlanItemSuite,
  applyPlanItemDraftSuite,
  planItemDraftChangesItemSuite,
  removePlanItemSuite,
  movePlanItemSuite,
  reorderPlanItemsSuite,
  insertPlanItemSuite,
  shiftPlanItemSuite,
  planItemsHaveSameOrderSuite,
  collectPlanSongOptionPrefetchIdsSuite,
  buildDraftSuite,
  parseLengthTextSuite,
  formatLengthSuite,
  buildRunSheetSuite,
  itemTypeLabelSuite,
  servicePositionLabelSuite,
  pickKeyIdSuite,
  synchronizeDraftSuite,
  keyTransitionsSuite,
  daysSinceRecentPlaySuite,
  buildPlanInsightsSuite,
  isValidPlanTimeEditSuite,
  planTimeEditsSuite,
  buildDefaultNewPlanTimeEditSuite,
  buildCreatePlanTimeRequestSuite,
  formatPlanTimeRangeLabelSuite,
  servicePlanRowsSuite,
  groupServicePlanRowsSuite,
];

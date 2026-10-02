/**
 * Parity suites for the iOS port of the Assign and scheduling logic in
 * `apps/ios/PCOBoosterCore/Sources/PCOBoosterCore/Logic/Scheduling`: distinct-day frequency,
 * Planning Center scheduling preferences, recommendation scores and their normalization,
 * plan-window history expansion, candidate list assembly and its progressive loading
 * predicates, ranking reasons, the recommendation strip, schedule day bars, candidate
 * schedule facts, team roster helpers, scheduling notifications, and the optimistic schedule
 * cache transforms. Swift replays them in
 * `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Logic/Scheduling/`.
 *
 * Every API value is built from the contract types and parsed with the contract schemas, so
 * each input decodes as the generated Swift model. Besides the TypeScript tests' own inputs,
 * seeded generators feed histories that cross org-day boundaries in several zones, ties that
 * only a stable sort keeps in order, names `localeCompare` orders in ways Swift's own string
 * comparison does not, and the multi-zone scenario pinned by
 * `packages/api/src/modules/planning-center/position-candidates-equivalence.golden.json`.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  buildFrequencyFromServiceHistory,
  isDeclinedAssignmentStatus,
  summarizeCandidateHistory,
} from "@pcobooster/planning-center-models/candidate-frequency";
import {
  scoreAndNormalizePeople,
  sortPeopleForSelection,
} from "@pcobooster/planning-center-models/candidate-scoring";
import { expandPlanWindowHistory } from "@pcobooster/planning-center-models/plan-window-history";
import {
  assemblePositionCandidates,
  findSelectedSlotAssignment,
  getSelectedPlanAssignmentLabels,
  mergeAssignmentLabels,
} from "@pcobooster/planning-center-models/position-candidates";
import { scoreSchedulingPreferences } from "@pcobooster/planning-center-models/scheduling-preferences";
import type { PersonWithAvailability } from "@pcobooster/planning-center-models/types";
import { z } from "zod";

import {
  optimisticallySchedulePerson,
  optimisticallyUnschedulePlanPerson,
  optimisticallyUpdatePlanPersonStatus,
  reconcileOptimisticPlanPersonId,
} from "@/hooks/use-schedule-cache-optimism";
import type { OptimisticSchedulePerson } from "@/hooks/use-schedule-cache-optimism";
import { summarizeCandidateSchedule } from "@/lib/people/candidate-summary";
import {
  otherPlanAssignments as otherPlanAssignmentLabels,
  positionFromLabel,
} from "@/lib/people/plan-assignment-labels";
import { partitionPeopleForRecommendationStrip } from "@/lib/people/recommendation-strip-order";
import { buildScheduleDays } from "@/lib/people/schedule-days";
import type { ScheduleDay } from "@/lib/people/schedule-days";
import {
  advancedBlockoutChecks,
  assembleCandidateList,
  CANDIDATE_DETAILS_BATCH_CONCURRENCY,
  collectCandidateDetails,
  expandWindowHistory,
  needsScheduleHistory,
  planCandidateDetailsBatches,
  windowHistoryAdvanced,
} from "@/lib/position-candidates";
import type { CandidateDetail } from "@/lib/position-candidates";
import { queryKeys } from "@/lib/query-keys";
import {
  groupRankingReasons,
  preferenceConflicts,
} from "@/lib/ranking-reasons";
import type { RankingFact } from "@/lib/ranking-reasons";
import {
  findFirstPosition,
  findNextOpenPosition,
  openSlotCount,
} from "@/lib/schedule/open-positions";
import type { OpenPositionRef } from "@/lib/schedule/open-positions";
import {
  collectUnnotifiedPeople,
  describeSchedulingNotification,
  getPositionNotificationStates,
  getSchedulingNotificationState,
} from "@/lib/schedule/scheduling-notifications";
import type {
  SchedulingNotificationState,
  UnnotifiedPerson,
} from "@/lib/schedule/scheduling-notifications";

import {
  filledPositionPersonSchema,
  teamPositionGroupSchema,
} from "../../packages/contracts/src/catalog";
import type {
  FilledPositionPerson,
  PlanPersonNotification,
  TeamPosition,
  TeamPositionGroup,
} from "../../packages/contracts/src/catalog";
import { PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE } from "../../packages/contracts/src/people";
import {
  blockoutProgressSchema,
  candidateDetailSchema,
  candidateHistorySchema,
  planWindowHistoryBatchSchema,
  positionCandidateSchema,
  positionCandidatesSchema,
  scheduleFrequencySchema,
  schedulingPreferencesSchema,
  selectedPlanAssignmentSchema,
  selectedPlanMatchSchema,
  serviceHistoryItemSchema,
} from "../../packages/contracts/src/people-schemas";
import type {
  windowPlanRefSchema,
  PlanWindowHistoryBatch,
  PositionCandidates,
  ScheduleFrequency,
  ServiceHistoryItem,
} from "../../packages/contracts/src/people-schemas";
import { defineParitySuite } from "./parity";
import type { ParitySuite } from "./parity";

type SchedulingPreferences = z.output<typeof schedulingPreferencesSchema>;
type PositionCandidate = z.output<typeof positionCandidateSchema>;
type SelectedPlanAssignment = z.output<typeof selectedPlanAssignmentSchema>;
type SelectedPlanMatch = z.output<typeof selectedPlanMatchSchema>;
type CandidateHistory = z.output<typeof candidateHistorySchema>;
type BlockoutProgress = z.output<typeof blockoutProgressSchema>;
type WindowPlanRef = z.output<typeof windowPlanRefSchema>;
type WindowRosterRow = PlanWindowHistoryBatch["people"][number]["rows"][number];
type WindowPlanSummary = PlanWindowHistoryBatch["plans"][number];
type WindowPlanTime = PlanWindowHistoryBatch["planTimes"][number];

// Characters JavaScript and Swift treat differently, built from code points so the source
// stays visible ASCII.
const char = (codePoint: number) => String.fromCodePoint(codePoint);
const NBSP = char(0xa0);
const BOM = char(0xfe_ff);
const ZERO_WIDTH_SPACE = char(0x20_0b);
const SOFT_HYPHEN = char(0xad);
const COMBINING_ACUTE = char(0x3_01);
const COMBINING_DIAERESIS = char(0x3_08);
const KELVIN = char(0x21_2a);
const CAPITAL_SIGMA = char(0x3_a3);
const DOTTED_CAPITAL_I = char(0x1_30);
const FULLWIDTH_THREE = char(0xff_13);
const FULLWIDTH_J = char(0xff_2a);
const IDEOGRAPHIC_SPACE = char(0x30_00);

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Park and Miller's minimal standard generator, so fixtures stay reproducible. */
const createRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
};

type Random = () => number;

/** A random item; `undefined` and `null` entries are choices too. */
const pick = <T>(random: Random, items: readonly T[]): T => {
  const chosen = Math.floor(random() * items.length);
  for (const [index, item] of items.entries()) {
    if (index === chosen) {
      return item;
    }
  }
  throw new Error("Cannot pick from an empty list");
};

const integer = (random: Random, min: number, max: number): number =>
  min + Math.floor(random() * (max - min + 1));

const chance = (random: Random, probability: number): boolean =>
  random() < probability;

const repeat = <T>(
  random: Random,
  min: number,
  max: number,
  make: (index: number) => T
): T[] =>
  Array.from({ length: integer(random, min, max) }, (_, index) => make(index));

const subset = <T>(random: Random, items: readonly T[]): T[] =>
  items.filter(() => chance(random, 0.4));

const shuffled = <T>(random: Random, items: readonly T[]): T[] =>
  items
    .map((item) => ({ item, order: random() }))
    .toSorted((a, b) => a.order - b.order)
    .map(({ item }) => item);

const shift = (date: Date, ms: number): Date => new Date(date.getTime() + ms);

interface Entry<Value> {
  key: string;
  value: Value;
}

const entriesOf = <Value>(map: ReadonlyMap<string, Value>): Entry<Value>[] =>
  [...map.entries()].map(([key, value]) => ({ key, value }));

const mapOf = <Value>(entries: readonly Entry<Value>[]): Map<string, Value> =>
  new Map(entries.map(({ key, value }) => [key, value]));

// Shared vocabulary

const ZONES = [
  "America/Los_Angeles",
  "America/New_York",
  "America/St_Johns",
  "UTC",
  "Europe/London",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Pacific/Chatham",
] as const;

/** Plan instants: late evenings that are already tomorrow in UTC, DST changes, year ends. */
const REFERENCE_DATES = [
  "2026-09-27T17:00:00.000Z",
  "2026-10-24T02:00:00.000Z",
  "2026-02-22T00:00:00.000Z",
  "2026-03-08T10:30:00.000Z",
  "2026-11-01T08:30:00.000Z",
  "2026-04-05T15:30:00.000Z",
  "2026-12-31T23:30:00.000Z",
  "2027-01-01T00:15:00.000Z",
  "2028-02-29T18:00:00.000Z",
  "2026-10-01T01:00:00.000Z",
  "2026-10-08T01:00:00.000Z",
  "2026-05-31T06:45:00.000Z",
].map((iso) => new Date(iso));

const STATUSES = [
  "C",
  "C",
  "C",
  "U",
  "U",
  "D",
  "Declined",
  "declined",
  " D ",
  "d",
  "",
  "Confirmed",
  "DECLINED",
  `${NBSP}D`,
  `D${BOM}`,
  "Decline",
] as const;

const TIME_TYPES = [
  undefined,
  "service",
  "service",
  "rehearsal",
  "rehearsal",
  "other",
] as const;

const POSITION_NAMES = [
  "Electric Guitar",
  "Keys",
  "Vocals",
  "Harmony",
  "Drums",
  "Bass Guitar",
] as const;

const TEAM_NAMES = ["Band", "Vocals", "Tech", "Bänd"] as const;

/** Names whose order `localeCompare` decides differently from plain code point order. */
const NAMES = [
  "Ana Alvarez",
  "ana alvarez",
  "Ana Álvarez",
  `Ana A${COMBINING_ACUTE}lvarez`,
  "Ben Brooks",
  "Zoë Lee",
  `Zoe${COMBINING_DIAERESIS} Lee`,
  "Zoe Lee",
  "zoe lee",
  "Émile Zola",
  "Emile Zola",
  "O'Brien",
  "O’Brien",
  "OBrien",
  "Mary-Ann Smith",
  "Mary Ann Smith",
  "Maryann Smith",
  "Łukasz Nowak",
  "Lukasz Nowak",
  "Øyvind Berg",
  "Oyvind Berg",
  "Straße",
  "Strasse",
  "李小龙",
  "김민준",
  "Ζωή",
  "Иван Петров",
  "Nguyễn Văn An",
  "Nguyen Van An",
  `Zed${ZERO_WIDTH_SPACE}`,
  "Zed",
  `${NBSP}Zed`,
  " Zed",
  `Ana${SOFT_HYPHEN}Lucia`,
  "AnaLucia",
  `${BOM}Ann`,
  "Ann",
  "Jake Bodea",
  "jake bodea",
  "Jake  Bodea",
  `${FULLWIDTH_J}ake Bodea`,
  "10 Band",
  "2 Band",
  "Ǆemal",
  "Džemal",
  "",
] as const;

// Service history

const historyItem = (
  random: Random,
  referenceDate: Date,
  index: number,
  previous: Date | undefined
): ServiceHistoryItem => {
  const date =
    previous !== undefined && chance(random, 0.15)
      ? previous
      : shift(
          referenceDate,
          integer(random, -70, 70) * DAY_MS +
            integer(random, -14, 14) * HOUR_MS +
            pick(random, [0, 0, 30, 45]) * MINUTE_MS
        );
  return {
    id: `item-${index}`,
    sourceScheduleId: `pp-${integer(random, 1, 12)}`,
    planId: chance(random, 0.2) ? undefined : `plan-${integer(random, 1, 9)}`,
    date,
    teamPositionName: pick(random, POSITION_NAMES),
    teamName: chance(random, 0.4) ? pick(random, TEAM_NAMES) : undefined,
    status: pick(random, STATUSES),
    timeType: pick(random, TIME_TYPES),
  };
};

const randomHistory = (
  random: Random,
  referenceDate: Date,
  max: number
): ServiceHistoryItem[] => {
  const items: ServiceHistoryItem[] = [];
  const count = integer(random, 0, max);
  for (let index = 0; index < count; index += 1) {
    items.push(historyItem(random, referenceDate, index, items.at(-1)?.date));
  }
  return z.array(serviceHistoryItemSchema).parse(items);
};

const served = (
  id: string,
  iso: string,
  partial: Partial<ServiceHistoryItem> = {}
): ServiceHistoryItem => ({
  id,
  sourceScheduleId: id,
  date: new Date(iso),
  teamPositionName: "Guitar",
  status: "C",
  timeType: "service",
  ...partial,
});

interface HistoryInput {
  history: ServiceHistoryItem[];
  referenceDate: Date;
  timeZone: string;
}

/** `history.test.ts` (API), as the history items its schedules map to. */
const HISTORY_SEEDS: readonly HistoryInput[] = [
  {
    history: [
      served("s-service:pt-service", "2026-02-15T00:00:00Z"),
      served("s-rehearsal:pt-rehearsal", "2026-02-20T00:00:00Z", {
        timeType: "rehearsal",
      }),
      served("s-fallback-rehearsal", "2026-02-25T00:00:00Z", {
        timeType: "rehearsal",
      }),
    ],
    referenceDate: new Date("2026-02-22T00:00:00Z"),
    timeZone: "UTC",
  },
  {
    history: [
      served("s-mixed:pt-service-1", "2026-02-22T00:00:00Z"),
      served("s-mixed:pt-rehearsal-1", "2026-02-20T17:00:00Z", {
        timeType: "rehearsal",
      }),
    ],
    referenceDate: new Date("2026-02-22T00:00:00Z"),
    timeZone: "UTC",
  },
  {
    history: [
      served("s-declined:pt-d", "2026-02-10T00:00:00Z", { status: "D" }),
      served("s-confirmed:pt-ok", "2026-02-12T00:00:00Z"),
    ],
    referenceDate: new Date("2026-02-22T00:00:00Z"),
    timeZone: "UTC",
  },
  {
    history: ["2026-02-20", "2026-02-10", "2026-03-10", "2026-02-25"].map(
      (day) => served(day, `${day}T12:00:00Z`)
    ),
    referenceDate: new Date("2026-02-22T12:00:00Z"),
    timeZone: "UTC",
  },
];

const historyInputs = (seed: number, count: number): HistoryInput[] => {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => {
    const referenceDate = pick(random, REFERENCE_DATES);
    return {
      history: randomHistory(random, referenceDate, 14),
      referenceDate,
      timeZone: pick(random, ZONES),
    };
  });
};

const isDeclinedAssignmentStatusSuite = defineParitySuite<
  string | null,
  boolean
>({
  name: "scheduling.isDeclinedAssignmentStatus",
  cases: [
    ...new Set(STATUSES),
    null,
    "U",
    "Pending",
    "declinedx",
    "DeClInEd",
    ` declined${IDEOGRAPHIC_SPACE}`,
    `d${ZERO_WIDTH_SPACE}`,
    "Ｄ",
    DOTTED_CAPITAL_I,
    "\tD\n",
  ],
  run: (status) => isDeclinedAssignmentStatus(status ?? undefined),
});

const buildFrequencySuite = defineParitySuite<HistoryInput, ScheduleFrequency>({
  name: "scheduling.buildFrequency",
  cases: [...HISTORY_SEEDS, ...historyInputs(101, 80)],
  run: ({ history, referenceDate, timeZone }) =>
    scheduleFrequencySchema.parse(
      buildFrequencyFromServiceHistory(history, referenceDate, timeZone)
    ),
});

interface CandidateHistorySummaryJson {
  frequency: ScheduleFrequency;
  serviceHistory: ServiceHistoryItem[];
}

const summarizeCandidateHistorySuite = defineParitySuite<
  HistoryInput,
  CandidateHistorySummaryJson
>({
  name: "scheduling.summarizeCandidateHistory",
  cases: [...HISTORY_SEEDS, ...historyInputs(202, 80)],
  run: ({ history, referenceDate, timeZone }) =>
    summarizeCandidateHistory(history, referenceDate, timeZone),
});

// Scheduling preferences

const preferences = (
  partial: Partial<SchedulingPreferences>
): SchedulingPreferences => ({
  schedulePreference: null,
  preferredWeeks: [],
  timePreferenceOptionIds: [],
  maxPlansPerDay: null,
  maxPlansPerMonth: null,
  ...partial,
});

interface PreferenceContextJson {
  referenceDate: Date;
  timeZone: string;
  planId?: string;
  slotTimePreferenceOptionId?: string | null;
}

interface PreferenceInput {
  preferences: SchedulingPreferences;
  history: ServiceHistoryItem[];
  context: PreferenceContextJson;
}

interface PreferenceScore {
  penalty: number;
  reasoning: string[];
}

const PLAN_SEL = "plan-sel";
/** Sunday September 27, 2026, 10:00 in Los Angeles. */
const SEPT_27 = new Date("2026-09-27T17:00:00Z");

const preferenceContext = (
  partial: Partial<PreferenceContextJson> = {}
): PreferenceContextJson => ({
  referenceDate: SEPT_27,
  timeZone: "America/Los_Angeles",
  planId: PLAN_SEL,
  ...partial,
});

const servedOnPlan = (
  iso: string,
  planId: string,
  partial: Partial<ServiceHistoryItem> = {}
): ServiceHistoryItem => ({
  id: `${planId}:${iso}`,
  sourceScheduleId: `pp-${planId}`,
  planId,
  date: new Date(iso),
  teamPositionName: "Electric Guitar",
  status: "C",
  timeType: "service",
  ...partial,
});

const MONTH_END = new Date("2026-10-01T01:00:00Z");
const MONTHLY_HISTORY = [
  servedOnPlan("2026-09-06T17:00:00Z", "plan-sep6"),
  servedOnPlan("2026-10-04T17:00:00Z", "plan-oct4"),
];
const MONTHLY_LIMIT_HISTORY = [
  servedOnPlan("2026-09-06T17:00:00Z", "plan-sep6"),
  servedOnPlan("2026-09-10T02:00:00Z", "plan-sep13", { timeType: "rehearsal" }),
  servedOnPlan("2026-09-13T17:00:00Z", "plan-sep13"),
  servedOnPlan("2026-09-20T17:00:00Z", "plan-sep20", { status: "D" }),
  servedOnPlan("2026-10-04T17:00:00Z", "plan-oct4"),
];
const EVENING = servedOnPlan("2026-09-14T00:30:00Z", "plan-sep13");
const WEEK_ONE = preferenceContext({
  referenceDate: new Date("2026-10-08T01:00:00Z"),
});

/** Every call in `scheduling-preferences.test.ts`. */
const PREFERENCE_SEEDS: readonly PreferenceInput[] = [
  ...["Every week", "As often as needed"].map((schedulePreference) => ({
    preferences: preferences({ schedulePreference }),
    history: [servedOnPlan("2026-09-20T17:00:00Z", "plan-sep20")],
    context: preferenceContext(),
  })),
  {
    preferences: preferences({ schedulePreference: "Unavailable" }),
    history: [],
    context: preferenceContext(),
  },
  {
    preferences: preferences({ schedulePreference: "Every other week" }),
    history: [
      servedOnPlan("2026-09-20T17:00:00Z", "plan-sep20"),
      servedOnPlan("2026-10-04T17:00:00Z", "plan-oct4"),
    ],
    context: preferenceContext(),
  },
  {
    preferences: preferences({ schedulePreference: "Every other week" }),
    history: [EVENING],
    context: preferenceContext(),
  },
  {
    preferences: preferences({ schedulePreference: "Every 3rd week" }),
    history: [EVENING],
    context: preferenceContext(),
  },
  {
    preferences: preferences({ schedulePreference: "Every other week" }),
    history: [
      servedOnPlan("2026-09-27T17:00:00Z", PLAN_SEL),
      servedOnPlan("2026-09-24T02:00:00Z", "plan-sep27", {
        timeType: "rehearsal",
      }),
      servedOnPlan("2026-09-20T17:00:00Z", "plan-sep20", { status: "D" }),
    ],
    context: preferenceContext(),
  },
  ...["Once a month", "Twice a month"].map((schedulePreference) => ({
    preferences: preferences({ schedulePreference }),
    history: MONTHLY_HISTORY,
    context: preferenceContext({ referenceDate: MONTH_END }),
  })),
  {
    preferences: preferences({
      schedulePreference: "Choose Weeks",
      preferredWeeks: [1, 3],
    }),
    history: [],
    context: WEEK_ONE,
  },
  {
    preferences: preferences({
      schedulePreference: "Choose Weeks",
      preferredWeeks: [2],
    }),
    history: [],
    context: WEEK_ONE,
  },
  ...[2, 3].map((maxPlansPerMonth) => ({
    preferences: preferences({ maxPlansPerMonth }),
    history: MONTHLY_LIMIT_HISTORY,
    context: preferenceContext(),
  })),
  {
    preferences: preferences({ maxPlansPerDay: 1 }),
    history: [servedOnPlan("2026-09-27T17:00:00Z", PLAN_SEL)],
    context: preferenceContext(),
  },
  {
    preferences: preferences({ maxPlansPerDay: 1 }),
    history: [
      servedOnPlan("2026-09-27T17:00:00Z", PLAN_SEL),
      servedOnPlan("2026-09-27T23:00:00Z", "plan-evening"),
    ],
    context: preferenceContext(),
  },
  ...["tpo-11am", "tpo-9am", null].map((slotTimePreferenceOptionId) => ({
    preferences: preferences({ timePreferenceOptionIds: ["tpo-9am"] }),
    history: [],
    context: preferenceContext({ slotTimePreferenceOptionId }),
  })),
  {
    preferences: preferences({}),
    history: [],
    context: preferenceContext({ slotTimePreferenceOptionId: "tpo-11am" }),
  },
  {
    preferences: preferences({
      schedulePreference: "Once a month",
      maxPlansPerMonth: 1,
      timePreferenceOptionIds: ["tpo-9am"],
    }),
    history: [servedOnPlan("2026-09-13T17:00:00Z", "plan-sep13")],
    context: preferenceContext({ slotTimePreferenceOptionId: "tpo-11am" }),
  },
];

const SCHEDULE_PREFERENCES = [
  null,
  "Every week",
  "As often as needed",
  "Unavailable",
  "Choose Weeks",
  "Choose Weeks",
  "Once a month",
  "Twice a month",
  "Three times a month",
  "Every other week",
  "Every other week",
  "Every 2nd week",
  "Every 3rd week",
  "Every 4th week",
  "Every 5th week",
  "Every 6th week",
  "Every 7th week",
  "Every 8th week",
  "Every 11th week",
  "Every 21th week",
  "Every 1st week",
  "Every 0th week",
  "Every 03rd week",
  "Every 2 week",
  "every other week",
  "Every 3rd week ",
  " Every 3rd week",
  "Every 99999999999999999999th week",
  "Every 1000000000000000000000th week",
  `Every ${FULLWIDTH_THREE}rd week`,
  "",
  "Once a Month",
  "Unavailable ",
] as const;

const randomPreferences = (random: Random): SchedulingPreferences => ({
  schedulePreference: pick(random, SCHEDULE_PREFERENCES),
  preferredWeeks: shuffled(random, [
    ...subset(random, [1, 2, 3, 4, 5]),
    ...(chance(random, 0.15) ? [pick(random, [0, 6, 2, 3])] : []),
  ]),
  timePreferenceOptionIds: subset(random, ["tpo-9am", "tpo-11am", "tpo-6pm"]),
  maxPlansPerDay: pick(random, [null, null, null, 0, -1, 1, 1, 2, 3]),
  maxPlansPerMonth: pick(random, [null, null, 0, -2, 1, 2, 3, 4, 6]),
});

const preferenceInputs = (seed: number, count: number): PreferenceInput[] => {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => {
    const referenceDate = pick(random, REFERENCE_DATES);
    return {
      preferences: schedulingPreferencesSchema.parse(randomPreferences(random)),
      history: randomHistory(random, referenceDate, 12).map((item) => ({
        ...item,
        planId: chance(random, 0.25)
          ? pick(random, [PLAN_SEL, "plan-1"])
          : item.planId,
      })),
      context: {
        referenceDate,
        timeZone: pick(random, ZONES),
        planId: pick(random, [undefined, PLAN_SEL, "plan-1", ""]),
        slotTimePreferenceOptionId: pick(random, [
          undefined,
          null,
          "tpo-9am",
          "tpo-11am",
          "tpo-x",
        ]),
      },
    };
  });
};

const runPreferences = ({
  preferences: prefs,
  history,
  context,
}: PreferenceInput): PreferenceScore =>
  scoreSchedulingPreferences(prefs, history, {
    referenceDate: context.referenceDate,
    orgTimeZone: context.timeZone,
    planId: context.planId,
    slotTimePreferenceOptionId: context.slotTimePreferenceOptionId,
  });

const preferenceCases = [...PREFERENCE_SEEDS, ...preferenceInputs(303, 160)];

const scoreSchedulingPreferencesSuite = defineParitySuite<
  PreferenceInput,
  PreferenceScore
>({
  name: "scheduling.scoreSchedulingPreferences",
  cases: preferenceCases,
  run: runPreferences,
});

// Candidate people

type Availability = "available" | "blocked" | "unknown";

/** `PersonWithAvailability` as the Swift `CandidatePerson` encodes it. */
interface CandidatePersonJson {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  photoUrl: string | null;
  photoThumbnailUrl: string | null;
  archived: boolean;
  availability: Availability;
  frequency?: ScheduleFrequency;
  serviceHistory?: ServiceHistoryItem[];
  isBlockedForDate?: boolean;
  isScheduledForSelectedPlanPosition: boolean;
  isConfirmedForSelectedPlanPosition: boolean;
  isDeclinedForSelectedPlanPosition: boolean;
  selectedPlanDeclineReason?: string;
  selectedPlanAssignmentLabels: string[];
  scheduledPlanPersonId?: string;
  schedulingPreferences?: SchedulingPreferences;
  recommendationScore?: number;
  recommendationReasoning: string[];
}

const toPerson = (json: CandidatePersonJson): PersonWithAvailability => ({
  ...json,
  serviceHistory: json.serviceHistory?.map((item) => ({ ...item })),
  selectedPlanAssignmentLabels: [...json.selectedPlanAssignmentLabels],
  recommendationReasoning: [...json.recommendationReasoning],
  positions: [],
});

const toPersonJson = (person: PersonWithAvailability): CandidatePersonJson => ({
  id: person.id,
  firstName: person.firstName,
  lastName: person.lastName,
  fullName: person.fullName,
  photoUrl: person.photoUrl,
  photoThumbnailUrl: person.photoThumbnailUrl,
  archived: person.archived,
  availability: person.availability ?? "unknown",
  frequency:
    person.frequency === undefined
      ? undefined
      : scheduleFrequencySchema.parse(person.frequency),
  serviceHistory: person.serviceHistory,
  isBlockedForDate: person.isBlockedForDate,
  isScheduledForSelectedPlanPosition:
    person.isScheduledForSelectedPlanPosition === true,
  isConfirmedForSelectedPlanPosition:
    person.isConfirmedForSelectedPlanPosition === true,
  isDeclinedForSelectedPlanPosition:
    person.isDeclinedForSelectedPlanPosition === true,
  selectedPlanDeclineReason: person.selectedPlanDeclineReason ?? undefined,
  selectedPlanAssignmentLabels: person.selectedPlanAssignmentLabels ?? [],
  scheduledPlanPersonId: person.scheduledPlanPersonId,
  schedulingPreferences: person.schedulingPreferences ?? undefined,
  recommendationScore: person.recommendationScore,
  recommendationReasoning: person.recommendationReasoning ?? [],
});

const basePerson = (
  id: string,
  fullName: string,
  partial: Partial<CandidatePersonJson> = {}
): CandidatePersonJson => ({
  id,
  firstName: fullName.split(" ")[0] ?? fullName,
  lastName: fullName.split(" ").slice(1).join(" ") || "Test",
  fullName,
  photoUrl: null,
  photoThumbnailUrl: null,
  archived: false,
  availability: "unknown",
  isScheduledForSelectedPlanPosition: false,
  isConfirmedForSelectedPlanPosition: false,
  isDeclinedForSelectedPlanPosition: false,
  selectedPlanAssignmentLabels: [],
  recommendationReasoning: [],
  ...partial,
});

const frequency = (partial: Partial<ScheduleFrequency>): ScheduleFrequency => ({
  recentServedDays: 0,
  last60Days: 0,
  last90Days: 0,
  totalServed: 0,
  upcomingServices: 0,
  recentRehearsalOnlyDays: 0,
  rehearsalLast60Days: 0,
  rehearsalLast90Days: 0,
  totalRehearsals: 0,
  upcomingRehearsals: 0,
  ...partial,
});

const optionalDate = (
  random: Random,
  referenceDate: Date,
  minDays: number,
  maxDays: number
): Date | undefined =>
  chance(random, 0.35)
    ? undefined
    : shift(
        referenceDate,
        integer(random, minDays, maxDays) * DAY_MS +
          integer(random, -12, 12) * HOUR_MS
      );

/** Frequencies the history never produces, such as upcoming counts without a date. */
const randomFrequency = (
  random: Random,
  referenceDate: Date
): ScheduleFrequency =>
  frequency({
    recentServedDays: integer(random, 0, 5),
    last60Days: integer(random, 0, 6),
    last90Days: integer(random, 0, 8),
    totalServed: integer(random, 0, 8),
    upcomingServices: integer(random, 0, 3),
    recentRehearsalOnlyDays: integer(random, 0, 3),
    rehearsalLast60Days: integer(random, 0, 3),
    rehearsalLast90Days: integer(random, 0, 3),
    totalRehearsals: integer(random, 0, 4),
    upcomingRehearsals: integer(random, 0, 2),
    lastServedDate: optionalDate(random, referenceDate, -40, 0),
    lastRehearsalDate: optionalDate(random, referenceDate, -40, 0),
    nextUpcomingDate: optionalDate(random, referenceDate, 0, 30),
    nextRehearsalDate: optionalDate(random, referenceDate, 0, 30),
  });

const randomCandidatePerson = (
  random: Random,
  index: number,
  referenceDate: Date,
  timeZone: string
): CandidatePersonJson => {
  const kind = random();
  const person = basePerson(`p-${index}`, pick(random, NAMES), {
    isBlockedForDate: pick(random, [undefined, false, false, false, true]),
    isScheduledForSelectedPlanPosition: chance(random, 0.15),
    isConfirmedForSelectedPlanPosition: chance(random, 0.1),
    isDeclinedForSelectedPlanPosition: chance(random, 0.08),
    schedulingPreferences: chance(random, 0.4)
      ? randomPreferences(random)
      : undefined,
    recommendationScore: chance(random, 0.3)
      ? integer(random, 0, 100)
      : undefined,
  });
  if (kind < 0.5) {
    const summary = summarizeCandidateHistory(
      randomHistory(random, referenceDate, 8),
      referenceDate,
      timeZone
    );
    return {
      ...person,
      frequency: summary.frequency,
      serviceHistory: summary.serviceHistory,
    };
  }
  if (kind < 0.8) {
    return {
      ...person,
      frequency: randomFrequency(random, referenceDate),
      serviceHistory: chance(random, 0.5)
        ? randomHistory(random, referenceDate, 6)
        : undefined,
    };
  }
  return person;
};

interface ScoringSlotJson {
  planId?: string;
  slotTimePreferenceOptionId?: string | null;
}

interface ScoreInput {
  people: CandidatePersonJson[];
  referenceDate: Date;
  timeZone: string;
  slot: ScoringSlotJson;
}

const FEB_22 = new Date("2026-02-22T00:00:00Z");
const RANKING_FREQUENCY = frequency({
  recentServedDays: 3,
  last60Days: 3,
  last90Days: 4,
  lastServedDate: new Date("2026-09-20T17:00:00Z"),
  totalServed: 6,
  recentRehearsalOnlyDays: 2,
  rehearsalLast60Days: 2,
  rehearsalLast90Days: 2,
  totalRehearsals: 2,
  upcomingServices: 1,
  nextUpcomingDate: new Date("2026-10-04T17:00:00Z"),
  upcomingRehearsals: 1,
  nextRehearsalDate: new Date("2026-10-01T02:00:00Z"),
});
const MONTHLY_SERVED = new Date("2026-09-13T17:00:00.000Z");
const MONTHLY_PERSON_HISTORY: ServiceHistoryItem[] = [
  {
    id: "pp-sep13",
    sourceScheduleId: "pp-sep13",
    planId: "plan-sep13",
    date: MONTHLY_SERVED,
    teamPositionName: "Electric Guitar",
    status: "C",
    timeType: "service",
  },
];

/** Every list `candidate-scoring.test.ts` and `ranking-reasons.test.ts` score. */
const SCORE_SEEDS: readonly ScoreInput[] = [
  {
    people: [
      basePerson("rehearsal", "rehearsal Test", {
        isBlockedForDate: false,
        frequency: frequency({
          totalServed: 3,
          lastServedDate: new Date("2026-01-01T00:00:00Z"),
          upcomingRehearsals: 1,
          nextRehearsalDate: new Date("2026-02-25T00:00:00Z"),
          recentRehearsalOnlyDays: 1,
          totalRehearsals: 1,
        }),
      }),
      basePerson("service", "service Test", {
        isBlockedForDate: false,
        frequency: frequency({
          totalServed: 3,
          lastServedDate: new Date("2026-01-01T00:00:00Z"),
          upcomingServices: 1,
          nextUpcomingDate: new Date("2026-02-25T00:00:00Z"),
        }),
      }),
    ],
    referenceDate: FEB_22,
    timeZone: "UTC",
    slot: {},
  },
  {
    people: [
      basePerson("missing", "missing Test", { isBlockedForDate: false }),
      basePerson("clean", "clean Test", {
        isBlockedForDate: false,
        frequency: frequency({}),
      }),
    ],
    referenceDate: FEB_22,
    timeZone: "UTC",
    slot: {},
  },
  {
    people: [
      basePerson("busy", "busy Test", {
        isBlockedForDate: false,
        frequency: frequency({
          recentServedDays: 3,
          totalServed: 5,
          lastServedDate: new Date("2026-02-01T00:00:00Z"),
        }),
      }),
    ],
    referenceDate: FEB_22,
    timeZone: "UTC",
    slot: {},
  },
  {
    people: [
      basePerson("evening", "evening Test", {
        isBlockedForDate: false,
        frequency: frequency({
          totalServed: 1,
          upcomingServices: 1,
          upcomingRehearsals: 1,
          lastServedDate: new Date("2026-09-26T02:00:00.000Z"),
          nextUpcomingDate: new Date("2026-10-03T02:30:00.000Z"),
          nextRehearsalDate: new Date("2026-10-01T03:00:00.000Z"),
        }),
      }),
    ],
    referenceDate: SEPT_27,
    timeZone: "America/Los_Angeles",
    slot: {},
  },
  {
    people: [
      basePerson("monthly", "monthly Test", {
        isBlockedForDate: false,
        frequency: frequency({
          recentServedDays: 1,
          totalServed: 1,
          lastServedDate: MONTHLY_SERVED,
        }),
        serviceHistory: MONTHLY_PERSON_HISTORY,
        schedulingPreferences: preferences({
          schedulePreference: "Once a month",
        }),
      }),
      basePerson("anytime", "anytime Test", {
        isBlockedForDate: false,
        frequency: frequency({
          recentServedDays: 1,
          totalServed: 1,
          lastServedDate: MONTHLY_SERVED,
        }),
        serviceHistory: MONTHLY_PERSON_HISTORY,
      }),
    ],
    referenceDate: SEPT_27,
    timeZone: "America/Los_Angeles",
    slot: { planId: PLAN_SEL },
  },
  {
    people: [
      basePerson("1", "Avery Collins", { frequency: RANKING_FREQUENCY }),
    ],
    referenceDate: SEPT_27,
    timeZone: "America/Los_Angeles",
    slot: {},
  },
  {
    people: [basePerson("1", "Avery Collins")],
    referenceDate: SEPT_27,
    timeZone: "America/Los_Angeles",
    slot: {},
  },
];

const scoreInputs = (seed: number, count: number): ScoreInput[] => {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => {
    const referenceDate = pick(random, REFERENCE_DATES);
    const timeZone = pick(random, ZONES);
    return {
      people: repeat(random, 1, 5, (index) =>
        randomCandidatePerson(random, index, referenceDate, timeZone)
      ),
      referenceDate,
      timeZone,
      slot: {
        planId: pick(random, [undefined, PLAN_SEL, "plan-1"]),
        slotTimePreferenceOptionId: pick(random, [
          undefined,
          null,
          "tpo-9am",
          "tpo-11am",
        ]),
      },
    };
  });
};

const runScoring = ({
  people,
  referenceDate,
  timeZone,
  slot,
}: ScoreInput): CandidatePersonJson[] => {
  const scored = people.map(toPerson);
  scoreAndNormalizePeople(scored, referenceDate, timeZone, slot);
  return scored.map(toPersonJson);
};

const scoreCases = [...SCORE_SEEDS, ...scoreInputs(404, 45)];

const scoreAndNormalizeSuite = defineParitySuite<
  ScoreInput,
  CandidatePersonJson[]
>({
  name: "scheduling.scoreAndNormalize",
  cases: scoreCases,
  run: runScoring,
});

/** What the selection sort and the recommendation strip read; Swift fills in the rest. */
interface RankedPersonJson {
  id: string;
  fullName: string;
  isBlockedForDate?: boolean;
  isScheduledForSelectedPlanPosition: boolean;
  isConfirmedForSelectedPlanPosition: boolean;
  isDeclinedForSelectedPlanPosition: boolean;
  recommendationScore?: number;
}

const ranked = (
  id: string,
  fullName: string,
  partial: Partial<RankedPersonJson> = {}
): RankedPersonJson => ({
  id,
  fullName,
  isScheduledForSelectedPlanPosition: false,
  isConfirmedForSelectedPlanPosition: false,
  isDeclinedForSelectedPlanPosition: false,
  ...partial,
});

const rankedPerson = (json: RankedPersonJson): PersonWithAvailability =>
  toPerson(basePerson(json.id, json.fullName, json));

interface PeopleInput {
  people: RankedPersonJson[];
}

const SCORES = [undefined, 0, 0, 50, 50, 33.33, 100, 100, 66.67, 12.5];

const randomRankedPerson = (random: Random, index: number): RankedPersonJson =>
  ranked(`p-${index}`, pick(random, NAMES), {
    isBlockedForDate: pick(random, [undefined, false, false, true]),
    isScheduledForSelectedPlanPosition: chance(random, 0.2),
    isConfirmedForSelectedPlanPosition: chance(random, 0.12),
    isDeclinedForSelectedPlanPosition: chance(random, 0.12),
    recommendationScore: pick(random, SCORES),
  });

const peopleInputs = (seed: number, count: number): PeopleInput[] => {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => ({
    people: repeat(random, 0, 11, (index) => randomRankedPerson(random, index)),
  }));
};

const sortForSelectionSuite = defineParitySuite<PeopleInput, string[]>({
  name: "scheduling.sortForSelection",
  cases: [
    {
      people: [
        ranked("b", "Zoe Lee", { recommendationScore: 50 }),
        ranked("a", `Zoe${COMBINING_DIAERESIS} Lee`, {
          recommendationScore: 50,
        }),
        ranked("c", "Zoë Lee", { recommendationScore: 50 }),
      ],
    },
    ...peopleInputs(505, 120),
  ],
  run: ({ people }) => {
    const sorted = people.map(rankedPerson);
    sortPeopleForSelection(sorted);
    return sorted.map(({ id }) => id);
  },
});

interface LocaleCompareInput {
  a: string;
  b: string;
}

const COLLATION_SAMPLE = [
  ...NAMES,
  "a",
  "A",
  "b",
  "B",
  "e",
  "é",
  "ß",
  "ss",
  "Ａ",
  "ﬁ",
  "fi",
  "あ",
  "ア",
  "Ann1",
  "Ann¹",
  "Ann ",
  `Ann${IDEOGRAPHIC_SPACE}`,
  `a${char(0)}`,
  "Ⅱ",
  "II",
] as const;

const localeCompareSuite = defineParitySuite<LocaleCompareInput, number>({
  name: "scheduling.localeCompare",
  cases: COLLATION_SAMPLE.flatMap((a) =>
    COLLATION_SAMPLE.map((b) => ({ a, b }))
  ),
  run: ({ a, b }) => Math.sign(a.localeCompare(b)),
});

// Plan-window history

const MILLISECONDS_SUFFIX = /\.\d{3}Z$/u;
const SECONDS_SUFFIX = /:\d\d\.\d{3}Z$/u;

/** The ISO shapes `new Date` reads: offsets, minutes only, long fractions, and plain dates. */
const WINDOW_INSTANT_FORMATS: readonly ((date: Date) => string)[] = [
  (date) => date.toISOString(),
  (date) => date.toISOString().replace(MILLISECONDS_SUFFIX, "Z"),
  (date) => date.toISOString().replace(SECONDS_SUFFIX, "Z"),
  (date) => date.toISOString().replace(MILLISECONDS_SUFFIX, ".5Z"),
  (date) => date.toISOString().replace(MILLISECONDS_SUFFIX, ".123456Z"),
  (date) => date.toISOString().replace(MILLISECONDS_SUFFIX, "+05:30"),
  (date) => date.toISOString().replace(MILLISECONDS_SUFFIX, "-08:00"),
  (date) => date.toISOString().slice(0, 10),
];

const windowInstant = (random: Random, date: Date): string =>
  pick(random, WINDOW_INSTANT_FORMATS)(date);

const TEAM_POSITION_NAMES = [
  "Band - Vocals",
  "Vocals",
  "Band - Electric Guitar",
  "Electric Guitar",
  "A - B - C",
  " - Keys",
  "Band - ",
  "Band -Keys",
  "",
  "Band  -  Keys",
  "Band - Bass - Left",
] as const;

const WINDOW_TIME_TYPES = [
  "service",
  "service",
  "rehearsal",
  "rehearsal",
  "other",
  null,
  "Rehearsal",
] as const;

interface WindowScenario {
  calls: PlanWindowHistoryBatch[];
  selectedPlanId: string;
}

const windowCall = (
  partial: Partial<PlanWindowHistoryBatch>
): PlanWindowHistoryBatch => ({
  generatedAt: "2026-09-20T00:00:00.000Z",
  loadedPlanCount: 1,
  plans: [],
  planTimes: [],
  people: [],
  deferredPlans: [],
  deferredServiceTypeIds: [],
  requestBudget: {
    limit: 36,
    planningCenterRequests: 3,
    planRangeRequests: 1,
    rosterRequests: 1,
  },
  ...partial,
});

const randomWindowCall = (
  random: Random,
  referenceDate: Date,
  callIndex: number
): PlanWindowHistoryBatch => {
  const plans: WindowPlanSummary[] = repeat(random, 0, 4, (index) => {
    const date = shift(
      referenceDate,
      integer(random, -35, 35) * DAY_MS + integer(random, -10, 10) * HOUR_MS
    );
    return {
      id: `plan-${integer(random, 1, 6)}`,
      title: chance(random, 0.8) ? `Plan ${callIndex}.${index}` : null,
      sortDate: pick(random, [
        windowInstant(random, date),
        windowInstant(random, date),
        null,
        "",
      ]),
      serviceTypeName: chance(random, 0.8)
        ? pick(random, ["Sunday", "Youth"])
        : null,
    };
  });
  const planTimes: WindowPlanTime[] = repeat(random, 0, 5, () => {
    const date = shift(
      referenceDate,
      integer(random, -35, 35) * DAY_MS + integer(random, -10, 10) * HOUR_MS
    );
    return {
      id: `t-${integer(random, 1, 8)}`,
      startsAt: pick(random, [
        windowInstant(random, date),
        windowInstant(random, date),
        null,
        "",
      ]),
      timeType: pick(random, WINDOW_TIME_TYPES),
    };
  });
  const timeIds = [
    "t-1",
    "t-2",
    "t-3",
    "t-4",
    "t-5",
    "t-6",
    "t-7",
    "t-8",
    "t-9",
  ];
  const people = repeat(random, 0, 4, () => ({
    personId: `person-${integer(random, 1, 5)}`,
    rows: repeat(random, 0, 3, (): WindowRosterRow => {
      const assigned = subset(random, timeIds);
      return {
        id: `pp-${callIndex}-${integer(random, 1, 40)}`,
        planId: pick(random, [
          `plan-${integer(random, 1, 7)}`,
          PLAN_SEL,
          null,
          "",
        ]),
        teamId: pick(random, ["team-band", "team-vox", null]),
        teamPositionName: pick(random, TEAM_POSITION_NAMES),
        status: pick(random, STATUSES),
        createdAt: windowInstant(
          random,
          shift(referenceDate, integer(random, -90, -20) * DAY_MS)
        ),
        timeIds: chance(random, 0.2) ? [...assigned, ...assigned] : assigned,
        serviceTimeIds: chance(random, 0.5)
          ? subset(random, assigned)
          : subset(random, timeIds),
        declineReason: pick(random, [null, "Out of town", "  Busy  "]),
      };
    }),
  }));
  return planWindowHistoryBatchSchema.parse(
    windowCall({
      loadedPlanCount: integer(random, 0, 3),
      plans,
      planTimes,
      people,
    })
  );
};

const randomWindowScenario = (random: Random): WindowScenario => {
  const referenceDate = pick(random, REFERENCE_DATES);
  return {
    calls: repeat(random, 1, 3, (index) =>
      randomWindowCall(random, referenceDate, index)
    ),
    selectedPlanId: pick(random, [PLAN_SEL, "plan-1", "plan-2"]),
  };
};

const windowTestRow = (partial: Partial<WindowRosterRow>): WindowRosterRow => ({
  id: "pp-1",
  planId: "plan-ok",
  teamId: "team-1",
  teamPositionName: "Band - Vocals",
  status: "C",
  createdAt: "2026-02-01T00:00:00Z",
  timeIds: [],
  serviceTimeIds: [],
  declineReason: null,
  ...partial,
});

const windowTestCall = (rows: WindowRosterRow[]): PlanWindowHistoryBatch =>
  windowCall({
    plans: [
      {
        id: "plan-ok",
        title: "Ok",
        sortDate: "2026-02-12T00:00:00Z",
        serviceTypeName: "Sunday",
      },
      {
        id: "plan-no",
        title: "Declined plan",
        sortDate: "2026-02-10T00:00:00Z",
        serviceTypeName: "Sunday",
      },
    ],
    planTimes: [
      {
        id: "t-service",
        startsAt: "2026-02-12T17:00:00Z",
        timeType: "service",
      },
      {
        id: "t-rehearsal",
        startsAt: "2026-02-11T02:00:00Z",
        timeType: "rehearsal",
      },
    ],
    people: [{ personId: "p1", rows }],
  });

/** `plan-window-history.test.ts`. */
const WINDOW_SEEDS: readonly WindowScenario[] = [
  {
    calls: [
      windowTestCall([
        windowTestRow({ id: "pp-d", planId: "plan-no", status: "D" }),
        windowTestRow({ id: "pp-c" }),
      ]),
    ],
    selectedPlanId: "plan-no",
  },
  {
    calls: [
      windowTestCall([
        windowTestRow({
          timeIds: ["t-service", "t-rehearsal"],
          serviceTimeIds: ["t-service"],
        }),
      ]),
    ],
    selectedPlanId: "plan-x",
  },
];

const windowScenarios = (seed: number, count: number): WindowScenario[] => {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => randomWindowScenario(random));
};

const expandPlanWindowHistorySuite = defineParitySuite<
  WindowScenario,
  Entry<CandidateHistory>[]
>({
  name: "scheduling.expandPlanWindowHistory",
  cases: [...WINDOW_SEEDS, ...windowScenarios(606, 30)],
  run: ({ calls, selectedPlanId }) =>
    entriesOf(expandPlanWindowHistory(calls, selectedPlanId)),
});

// Selected plan matching and labels

const ASSIGNMENT_POSITION_NAMES = [
  "Electric Guitar",
  "Band - Electric Guitar",
  "  Band - Electric Guitar ",
  "Band - Electric Guitar - Left",
  "Vocals - Harmony",
  "Harmony",
  " - Electric Guitar",
  "Band - ",
  "",
  "   ",
  "Band -  Electric Guitar",
  "Bänd - Electric Guitar",
  `Band - Electric Guitar${NBSP}`,
  `${BOM}Band - Electric Guitar`,
  "band - electric guitar",
  `Band - Electric Guita${char(0x72)}${COMBINING_ACUTE}`,
] as const;

const randomAssignment = (
  random: Random,
  index: number
): SelectedPlanAssignment => {
  const source = pick(random, ["planPerson", "schedule"] as const);
  return {
    source,
    id: `a-${index}`,
    planId: pick(random, [PLAN_SEL, PLAN_SEL, "plan-x", null, ""]),
    teamId: pick(random, ["team-band", "team-vox", null, ""]),
    teamName: pick(random, [null, null, "Band", " Band ", "", "Vocals", "   "]),
    teamPositionName: pick(random, ASSIGNMENT_POSITION_NAMES),
    status: pick(random, STATUSES),
    planPersonId: pick(random, [null, `pp-${index}`]),
    declineReason: pick(random, [null, "Out of town"]),
  };
};

const randomMatch = (random: Random): SelectedPlanMatch => ({
  planId: pick(random, [PLAN_SEL, PLAN_SEL, PLAN_SEL, undefined, "", "plan-x"]),
  teamId: pick(random, [undefined, "", "team-band", "team-band", "team-vox"]),
  selectedPositionName: pick(random, [
    "Electric Guitar",
    "Electric Guitar",
    "Harmony",
    "Electric Guitar - Left",
    undefined,
    "",
  ]),
  selectedTeamName: pick(random, [undefined, "", "Band", "Band", "Vocals"]),
});

interface MatchInput {
  assignments: SelectedPlanAssignment[];
  match: SelectedPlanMatch;
}

const matchInputs = (seed: number, count: number): MatchInput[] => {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => ({
    assignments: z
      .array(selectedPlanAssignmentSchema)
      .parse(repeat(random, 0, 5, (index) => randomAssignment(random, index))),
    match: selectedPlanMatchSchema.parse(randomMatch(random)),
  }));
};

const matchCases = matchInputs(707, 200);

const findSelectedSlotAssignmentSuite = defineParitySuite<
  MatchInput,
  SelectedPlanAssignment | null
>({
  name: "scheduling.findSelectedSlotAssignment",
  cases: matchCases,
  run: ({ assignments, match }) =>
    findSelectedSlotAssignment(assignments, match) ?? null,
});

const selectedPlanAssignmentLabelsSuite = defineParitySuite<
  MatchInput,
  string[]
>({
  name: "scheduling.selectedPlanAssignmentLabels",
  cases: matchCases,
  run: ({ assignments, match }) =>
    getSelectedPlanAssignmentLabels(assignments, match),
});

const LABELS = [
  "Band - Keys",
  "band - keys",
  "BAND - KEYS",
  " Band - Keys ",
  "Keys",
  "keys",
  "",
  "  ",
  "Band - Bass Guitar",
  "Bass Guitar",
  `ΟΔΟ${CAPITAL_SIGMA}`,
  "οδος",
  "οδοσ",
  `${KELVIN}eys`,
  "keys",
  `${DOTTED_CAPITAL_I}stanbul`,
  "i̇stanbul",
  "istanbul",
  `Caf${char(0xe9)}`,
  `Cafe${COMBINING_ACUTE}`,
  "STRASSE",
  "straße",
] as const;

const mergeAssignmentLabelsSuite = defineParitySuite<string[][], string[]>({
  name: "scheduling.mergeAssignmentLabels",
  cases: [
    [["Band - Bass Guitar"], ["Bass Guitar", "Band - Bass Guitar"]],
    [],
    [[]],
    ...Array.from({ length: 80 }, (_, index) => {
      const random = createRandom(808 + index);
      return repeat(random, 0, 3, () =>
        repeat(random, 0, 4, () => pick(random, LABELS))
      );
    }),
  ],
  run: (groups) => mergeAssignmentLabels(...groups),
});

// Candidate list assembly

const SLOT_MATCH: SelectedPlanMatch = {
  planId: PLAN_SEL,
  teamId: "team-band",
  selectedPositionName: "Electric Guitar",
  selectedTeamName: "Band",
};

const randomSlot = (random: Random): PositionCandidate["selectedPlanSlot"] =>
  chance(random, 0.6)
    ? null
    : {
        planPersonId: `pp-slot-${integer(random, 1, 9)}`,
        status: pick(random, ["confirmed", "pending", "declined"] as const),
        declineReason: pick(random, [null, "Out of town"]),
      };

const randomPositionCandidate = (
  random: Random,
  index: number
): PositionCandidate => {
  const fullName = pick(random, NAMES);
  return {
    id: `p-${index}`,
    firstName: fullName.split(" ")[0] ?? "",
    lastName: fullName.split(" ").slice(1).join(" "),
    fullName,
    photoUrl: chance(random, 0.5)
      ? `https://example.test/p-${index}.jpg`
      : null,
    photoThumbnailUrl: null,
    archived: chance(random, 0.1),
    selectedPlanRosterLabels: subset(random, [
      "Band - Electric Guitar",
      "Vocals - Harmony",
      "Keys",
    ]),
    selectedPlanSlot: randomSlot(random),
    schedulingPreferences: chance(random, 0.7)
      ? randomPreferences(random)
      : null,
  };
};

const randomCandidateHistory = (
  random: Random,
  referenceDate: Date
): CandidateHistory =>
  candidateHistorySchema.parse({
    serviceHistory: randomHistory(random, referenceDate, 6),
    selectedPlanAssignments: repeat(random, 0, 3, (index) =>
      randomAssignment(random, index)
    ),
  });

interface AssembleInput {
  candidates: PositionCandidate[];
  match: SelectedPlanMatch;
  referenceDate: Date;
  timeZone: string;
  slotTimePreferenceOptionId?: string | null;
  /** People without an entry are still loading. */
  histories: Entry<CandidateHistory>[];
  blocked: Entry<boolean>[];
}

interface AssembledJson {
  people: CandidatePersonJson[];
  complete: boolean;
}

const assembleInputs = (seed: number, count: number): AssembleInput[] => {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => {
    const referenceDate = pick(random, REFERENCE_DATES);
    const candidates = z
      .array(positionCandidateSchema)
      .parse(
        repeat(random, 0, 6, (index) => randomPositionCandidate(random, index))
      );
    const everyPart = chance(random, 0.6);
    return {
      candidates,
      match: chance(random, 0.7)
        ? SLOT_MATCH
        : selectedPlanMatchSchema.parse(randomMatch(random)),
      referenceDate,
      timeZone: pick(random, ZONES),
      slotTimePreferenceOptionId: pick(random, [undefined, null, "tpo-9am"]),
      histories: candidates.flatMap(({ id }) =>
        everyPart || chance(random, 0.7)
          ? [{ key: id, value: randomCandidateHistory(random, referenceDate) }]
          : []
      ),
      blocked: candidates.flatMap(({ id }) =>
        everyPart || chance(random, 0.7)
          ? [{ key: id, value: chance(random, 0.25) }]
          : []
      ),
    };
  });
};

const assemblePositionCandidatesSuite = defineParitySuite<
  AssembleInput,
  AssembledJson
>({
  name: "scheduling.assemblePositionCandidates",
  cases: assembleInputs(909, 35),
  run: ({
    candidates,
    match,
    referenceDate,
    timeZone,
    slotTimePreferenceOptionId,
    histories,
    blocked,
  }) => {
    const historyById = mapOf(histories);
    const blockedById = mapOf(blocked);
    const { people, complete } = assemblePositionCandidates({
      candidates,
      match,
      referenceDate,
      timeZone,
      slotTimePreferenceOptionId,
      historyFor: (personId) => historyById.get(personId),
      blockedFor: (personId) => blockedById.get(personId),
    });
    return { people: people.map(toPersonJson), complete };
  },
});

interface CandidateListInput {
  candidates: PositionCandidates;
  windowHistory: Entry<CandidateHistory>[] | null;
  scheduleHistory: boolean;
  details: CandidateDetail[];
  date: string;
  slotTimePreferenceOptionId?: string | null;
}

interface CandidateListJson {
  people: CandidatePersonJson[];
  complete: boolean;
  progress: {
    candidateCount: number;
    detailedCount: number;
    historyLoaded: boolean;
  };
}

const LIST_DATE = "2026-09-27T17:00:00.000Z";

const listCandidate = (id: string, fullName: string): PositionCandidate => ({
  id,
  firstName: fullName.split(" ")[0] ?? fullName,
  lastName: fullName.split(" ")[1] ?? "",
  fullName,
  photoUrl: null,
  photoThumbnailUrl: null,
  archived: false,
  selectedPlanRosterLabels: [],
  selectedPlanSlot: null,
  schedulingPreferences: null,
});

const LIST_CANDIDATES: PositionCandidates = {
  generatedAt: LIST_DATE,
  timeZone: "America/Los_Angeles",
  match: { planId: "plan-1", teamId: "team-1", selectedPositionName: "Keys" },
  candidates: [
    listCandidate("p-busy", "Zed Busy"),
    listCandidate("p-free", "Amy Free"),
  ],
};

const listWindowCall = (loadedPlanCount: number): PlanWindowHistoryBatch =>
  windowCall({
    generatedAt: LIST_DATE,
    loadedPlanCount,
    plans: [
      {
        id: "plan-0",
        title: "Two weeks ago",
        sortDate: "2026-09-13T17:00:00.000Z",
        serviceTypeName: "Sunday",
      },
    ],
    people: [
      {
        personId: "p-busy",
        rows: [
          {
            id: "pp-0",
            planId: "plan-0",
            teamId: "team-1",
            teamPositionName: "Keys",
            status: "C",
            createdAt: LIST_DATE,
            timeIds: [],
            serviceTimeIds: [],
            declineReason: null,
          },
        ],
      },
    ],
  });

const availability = (personId: string, blocked: boolean): CandidateDetail => ({
  personId,
  isBlockedForDate: blocked,
});

const expandedEntries = (
  calls: readonly PlanWindowHistoryBatch[],
  planId: string
): Entry<CandidateHistory>[] | null => {
  const expanded = expandWindowHistory(calls, planId);
  return expanded === undefined ? null : entriesOf(expanded);
};

/** `apps/web/src/lib/position-candidates.test.ts`. */
const CANDIDATE_LIST_SEEDS: readonly CandidateListInput[] = [
  {
    candidates: LIST_CANDIDATES,
    windowHistory: null,
    scheduleHistory: false,
    details: [availability("p-busy", false)],
    date: LIST_DATE,
  },
  {
    candidates: LIST_CANDIDATES,
    windowHistory: expandedEntries([listWindowCall(1)], "plan-1"),
    scheduleHistory: false,
    details: [availability("p-busy", false), availability("p-free", false)],
    date: LIST_DATE,
  },
];

const randomDetail = (
  random: Random,
  personId: string,
  referenceDate: Date,
  withHistory: boolean
): CandidateDetail =>
  candidateDetailSchema.parse({
    personId,
    isBlockedForDate: chance(random, 0.25),
    history: withHistory
      ? randomCandidateHistory(random, referenceDate)
      : undefined,
  });

const candidateListInputs = (
  seed: number,
  count: number
): CandidateListInput[] => {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => {
    const referenceDate = pick(random, REFERENCE_DATES);
    const candidates = positionCandidatesSchema.parse({
      generatedAt: referenceDate.toISOString(),
      timeZone: pick(random, ZONES),
      match: chance(random, 0.7) ? SLOT_MATCH : randomMatch(random),
      candidates: repeat(random, 0, 6, (index) =>
        randomPositionCandidate(random, index)
      ),
    });
    const scheduleHistory = chance(random, 0.35);
    const people = candidates.candidates.map(({ id }) => id);
    const windowHistory =
      scheduleHistory || chance(random, 0.2)
        ? null
        : people.flatMap((id) =>
            chance(random, 0.8)
              ? [
                  {
                    key: id,
                    value: randomCandidateHistory(random, referenceDate),
                  },
                ]
              : []
          );
    const detailed = people.filter(() => chance(random, 0.8));
    return {
      candidates,
      windowHistory: chance(random, 0.15) ? [] : windowHistory,
      scheduleHistory,
      details: [
        ...detailed.map((id) =>
          randomDetail(
            random,
            id,
            referenceDate,
            scheduleHistory ? chance(random, 0.85) : chance(random, 0.1)
          )
        ),
        ...(chance(random, 0.2) && detailed.length > 0
          ? [availability(pick(random, detailed), true)]
          : []),
      ],
      date: referenceDate.toISOString(),
      slotTimePreferenceOptionId: pick(random, [undefined, null, "tpo-11am"]),
    };
  });
};

const runCandidateList = ({
  candidates,
  windowHistory,
  scheduleHistory,
  details,
  date,
  slotTimePreferenceOptionId,
}: CandidateListInput): CandidateListJson => {
  const list = assembleCandidateList({
    candidates,
    windowHistory: windowHistory === null ? undefined : mapOf(windowHistory),
    scheduleHistory,
    details: new Map(details.map((detail) => [detail.personId, detail])),
    date,
    slotTimePreferenceOptionId,
  });
  return {
    people: list.people.map(toPersonJson),
    complete: list.complete,
    progress: list.progress,
  };
};

const assembleCandidateListSuite = defineParitySuite<
  CandidateListInput,
  CandidateListJson
>({
  name: "scheduling.assembleCandidateList",
  cases: [...CANDIDATE_LIST_SEEDS, ...candidateListInputs(1010, 35)],
  run: runCandidateList,
});

// The golden scenario

interface GoldenInput {
  candidates: PositionCandidates;
  planId: string;
  windowCalls: PlanWindowHistoryBatch[];
  /** Candidate detail batches as each settled. */
  detailBatches: CandidateDetail[][];
}

const GOLDEN_PATH = path.join(
  import.meta.dirname,
  "../../packages/api/src/modules/planning-center/position-candidates-equivalence.golden.json"
);
const golden = z
  .object({ window: z.array(z.json()), emptyWindow: z.array(z.json()) })
  .parse(JSON.parse(readFileSync(GOLDEN_PATH, "utf-8")));

const NO_PREFERENCES = preferences({});
const GOLDEN_PLAN_DATE = "2026-09-27T17:00:00.000Z";

const goldenCandidate = (
  id: string,
  firstName: string,
  lastName: string,
  partial: Partial<PositionCandidate> = {}
): PositionCandidate => ({
  id,
  firstName,
  lastName,
  fullName: `${firstName} ${lastName}`,
  photoUrl: `https://example.test/${id}.jpg`,
  photoThumbnailUrl: `https://example.test/${id}-thumb.jpg`,
  archived: false,
  selectedPlanRosterLabels: [],
  selectedPlanSlot: null,
  schedulingPreferences: NO_PREFERENCES,
  ...partial,
});

/**
 * `people.positionCandidates` for the scenario in `position-candidates-equivalence.test.ts`:
 * the position's assigned people (Fay is archived), plus Hal, who is on the slot without the
 * assignment, and the fresh selected-plan roster.
 */
const GOLDEN_CANDIDATES: PositionCandidates = positionCandidatesSchema.parse({
  generatedAt: GOLDEN_PLAN_DATE,
  timeZone: "America/Los_Angeles",
  match: {
    planId: PLAN_SEL,
    teamId: "team-band",
    selectedPositionName: "Electric Guitar",
    selectedTeamName: "Band",
  },
  candidates: [
    goldenCandidate("p-ana", "Ana", "Alvarez", {
      selectedPlanRosterLabels: ["Band - Electric Guitar"],
      selectedPlanSlot: {
        planPersonId: "pp-ana-sel",
        status: "confirmed",
        declineReason: null,
      },
    }),
    goldenCandidate("p-ben", "Ben", "Brooks", {
      selectedPlanRosterLabels: ["Band - Electric Guitar"],
      selectedPlanSlot: {
        planPersonId: "pp-ben-sel",
        status: "pending",
        declineReason: null,
      },
    }),
    goldenCandidate("p-cy", "Cy", "Chen", {
      selectedPlanSlot: {
        planPersonId: "pp-cy-sel",
        status: "declined",
        declineReason: "Out of town",
      },
    }),
    goldenCandidate("p-dee", "Dee", "Diaz", {
      selectedPlanRosterLabels: ["Vocals - Harmony"],
    }),
    goldenCandidate("p-eve", "Eve", "Evans"),
    goldenCandidate("p-gus", "Gus", "Gray"),
    goldenCandidate("p-hal", "Hal", "Hill", {
      selectedPlanRosterLabels: ["Band - Electric Guitar"],
      selectedPlanSlot: {
        planPersonId: "pp-hal-sel",
        status: "pending",
        declineReason: null,
      },
      schedulingPreferences: null,
    }),
  ],
});

const goldenPlan = (
  id: string,
  sortDate: string,
  serviceTypeName: string
): WindowPlanSummary => ({
  id,
  title: `Plan ${id}`,
  sortDate,
  serviceTypeName,
});

const goldenRow = (
  id: string,
  planId: string,
  teamPositionName: string,
  status: string,
  times: { timeIds?: string[]; serviceTimeIds?: string[]; teamId?: string } = {}
): WindowRosterRow => ({
  id,
  planId,
  teamId: times.teamId ?? "team-band",
  teamPositionName,
  status,
  createdAt: "2026-01-01T00:00:00Z",
  timeIds: times.timeIds ?? [],
  serviceTimeIds: times.serviceTimeIds ?? [],
  declineReason: null,
});

const GOLDEN_SELECTED_ROSTER: readonly [string, WindowRosterRow][] = [
  [
    "p-ana",
    goldenRow("pp-ana-sel", PLAN_SEL, "Electric Guitar", "C", {
      timeIds: ["t-sel", "t-sel-reh"],
      serviceTimeIds: ["t-sel"],
    }),
  ],
  ["p-ben", goldenRow("pp-ben-sel", PLAN_SEL, "Electric Guitar", "U")],
  [
    "p-cy",
    {
      ...goldenRow("pp-cy-sel", PLAN_SEL, "Band - Electric Guitar", "D"),
      declineReason: "Out of town",
    },
  ],
  [
    "p-dee",
    goldenRow("pp-dee-sel", PLAN_SEL, "Harmony", "U", { teamId: "team-vox" }),
  ],
  ["p-eve", goldenRow("pp-eve-sel", PLAN_SEL, "Keys", "Declined")],
  ["p-hal", goldenRow("pp-hal-sel", PLAN_SEL, "Electric Guitar", "U")],
  ["p-gus", goldenRow("pp-gus-sel", PLAN_SEL, "Band - Electric Guitar", "U")],
];

const GOLDEN_WINDOW_ROWS: readonly [string, WindowRosterRow][] = [
  [
    "p-ana",
    goldenRow("pp-ana-aug30", "plan-aug30", "Electric Guitar", "C", {
      timeIds: ["t-aug30"],
      serviceTimeIds: ["t-aug30"],
    }),
  ],
  ["p-ben", goldenRow("pp-ben-aug30", "plan-aug30", "Electric Guitar", "D")],
  ["p-gus", goldenRow("pp-gus-aug30", "plan-aug30", "Electric Guitar", "U")],
  [
    "p-ana",
    goldenRow("pp-ana-sep13", "plan-sep13", "Electric Guitar", "C", {
      timeIds: ["t-sep13", "t-sep10-reh"],
      serviceTimeIds: ["t-sep13"],
    }),
  ],
  [
    "p-dee",
    goldenRow("pp-dee-sep13", "plan-sep13", "Harmony", "C", {
      timeIds: ["t-sep10-reh"],
      teamId: "team-vox",
    }),
  ],
  ...GOLDEN_SELECTED_ROSTER,
  ["p-gus", goldenRow("pp-gus-oct11", "plan-oct11", "Electric Guitar", "C")],
  [
    "p-cy",
    goldenRow("pp-cy-oct11", "plan-oct11", "Electric Guitar", "U", {
      timeIds: ["t-oct11"],
      serviceTimeIds: ["t-oct11"],
    }),
  ],
  ["p-ben", goldenRow("pp-ben-ysep25", "plan-y-sep25", "Band - Bass", "C")],
  ["p-eve", goldenRow("pp-eve-ysep25", "plan-y-sep25", "Keys", "U")],
  [
    "p-ana",
    goldenRow("pp-ana-yoct2", "plan-y-oct2", "Electric Guitar", "U", {
      timeIds: ["t-y-oct2-other"],
    }),
  ],
  [
    "p-ivy",
    goldenRow("pp-ivy-yoct2", "plan-y-oct2", "Electric Guitar", "C", {
      timeIds: ["t-y-oct2"],
      serviceTimeIds: ["t-y-oct2"],
    }),
  ],
];

const groupRows = (
  rows: readonly [string, WindowRosterRow][]
): PlanWindowHistoryBatch["people"] => {
  const byPerson = new Map<string, WindowRosterRow[]>();
  for (const [personId, row] of rows) {
    byPerson.set(personId, [...(byPerson.get(personId) ?? []), row]);
  }
  return [...byPerson.entries()].map(([personId, personRows]) => ({
    personId,
    rows: personRows,
  }));
};

/** The window in two calls, Sunday's plans then Youth's, as a budget-limited load returns it. */
const GOLDEN_WINDOW_CALLS: PlanWindowHistoryBatch[] = z
  .array(planWindowHistoryBatchSchema)
  .parse([
    windowCall({
      generatedAt: GOLDEN_PLAN_DATE,
      loadedPlanCount: 5,
      plans: [
        goldenPlan("plan-aug30", "2026-08-30T17:00:00Z", "Sunday"),
        goldenPlan("plan-sep13", "2026-09-13T17:00:00Z", "Sunday"),
        goldenPlan(PLAN_SEL, GOLDEN_PLAN_DATE, "Sunday"),
        goldenPlan("plan-oct11", "2026-10-11T17:00:00Z", "Sunday"),
        goldenPlan("plan-oct18-empty", "2026-10-18T17:00:00Z", "Sunday"),
      ],
      planTimes: [
        {
          id: "t-aug30",
          startsAt: "2026-08-30T17:00:00Z",
          timeType: "service",
        },
        {
          id: "t-sep13",
          startsAt: "2026-09-13T17:00:00Z",
          timeType: "service",
        },
        {
          id: "t-sep10-reh",
          startsAt: "2026-09-11T02:00:00Z",
          timeType: "rehearsal",
        },
        { id: "t-sel", startsAt: GOLDEN_PLAN_DATE, timeType: "service" },
        {
          id: "t-sel-reh",
          startsAt: "2026-09-26T01:00:00Z",
          timeType: "rehearsal",
        },
        {
          id: "t-oct11",
          startsAt: "2026-10-11T17:00:00Z",
          timeType: "service",
        },
      ],
      people: groupRows(
        GOLDEN_WINDOW_ROWS.filter(
          ([, row]) => row.planId?.startsWith("plan-y-") !== true
        )
      ),
      deferredServiceTypeIds: ["st-youth"],
    }),
    windowCall({
      generatedAt: GOLDEN_PLAN_DATE,
      loadedPlanCount: 2,
      plans: [
        goldenPlan("plan-y-sep25", "2026-09-26T02:00:00Z", "Youth"),
        goldenPlan("plan-y-oct2", "2026-10-03T02:30:00Z", "Youth"),
      ],
      planTimes: [
        {
          id: "t-y-sep25",
          startsAt: "2026-09-26T02:00:00Z",
          timeType: "service",
        },
        {
          id: "t-y-oct2",
          startsAt: "2026-10-03T02:30:00Z",
          timeType: "service",
        },
        {
          id: "t-y-oct2-other",
          startsAt: "2026-10-03T01:00:00Z",
          timeType: "other",
        },
      ],
      people: groupRows(
        GOLDEN_WINDOW_ROWS.filter(
          ([, row]) => row.planId?.startsWith("plan-y-") === true
        )
      ),
    }),
  ]);

/** Availability from blockouts: Dee's weekly blockout, Gus's Sunday, Hal's Tokyo Monday. */
const GOLDEN_BLOCKED = new Set(["p-dee", "p-gus", "p-hal"]);

const goldenScheduleItem = (
  id: string,
  planId: string,
  iso: string,
  partial: Partial<ServiceHistoryItem> = {}
): ServiceHistoryItem => ({
  id,
  sourceScheduleId: id.split(":")[0] ?? id,
  planId,
  date: new Date(iso),
  teamPositionName: "Electric Guitar",
  serviceTypeName: "Sunday",
  planTitle: `Plan ${planId}`,
  status: "C",
  ...partial,
});

const goldenScheduleAssignment = (
  id: string,
  partial: Partial<SelectedPlanAssignment>
): SelectedPlanAssignment => ({
  source: "schedule",
  id,
  planId: PLAN_SEL,
  teamId: "team-band",
  teamName: "Band",
  teamPositionName: "Electric Guitar",
  status: "C",
  planPersonId: null,
  declineReason: null,
  ...partial,
});

/** Each person's own schedules, which history falls back to when the window is empty. */
const GOLDEN_SCHEDULE_HISTORY = new Map<string, CandidateHistory>([
  [
    "p-ana",
    {
      serviceHistory: [
        goldenScheduleItem(
          "s-ana-sep13:t-sep10-reh",
          "plan-sep13",
          "2026-09-11T02:00:00Z",
          { teamName: "Band", timeType: "rehearsal" }
        ),
        goldenScheduleItem(
          "s-ana-sep13:t-sep13",
          "plan-sep13",
          "2026-09-13T17:00:00Z",
          { teamName: "Band", timeType: "service" }
        ),
        goldenScheduleItem("s-ana-sel:t-sel", PLAN_SEL, GOLDEN_PLAN_DATE, {
          teamName: "Band",
          timeType: "service",
        }),
      ],
      selectedPlanAssignments: [
        goldenScheduleAssignment("s-ana-sel", { planPersonId: "pp-ana-sel" }),
      ],
    },
  ],
  [
    "p-gus",
    {
      serviceHistory: [
        goldenScheduleItem("s-gus-sel", PLAN_SEL, GOLDEN_PLAN_DATE, {
          teamName: "Band",
          status: "U",
        }),
      ],
      selectedPlanAssignments: [
        goldenScheduleAssignment("s-gus-sel", {
          status: "U",
          planPersonId: "pp-gus-sel",
        }),
      ],
    },
  ],
  [
    "p-cy",
    {
      serviceHistory: [
        goldenScheduleItem("s-cy-oct11", "plan-oct11", "2026-10-11T17:00:00Z", {
          status: "U",
        }),
      ],
      selectedPlanAssignments: [
        goldenScheduleAssignment("s-cy-sel", {
          teamName: null,
          teamPositionName: "Band - Electric Guitar",
          status: "D",
          planPersonId: "pp-cy-sel",
          declineReason: "Out of town",
        }),
      ],
    },
  ],
  [
    "p-dee",
    {
      serviceHistory: [
        goldenScheduleItem(
          "s-dee-sep13:t-sep10-reh",
          "plan-sep13",
          "2026-09-11T02:00:00Z",
          {
            teamName: "Vocals",
            teamPositionName: "Harmony",
            timeType: "rehearsal",
          }
        ),
      ],
      selectedPlanAssignments: [],
    },
  ],
]);

const goldenDetails = (scheduleHistory: boolean): CandidateDetail[][] => {
  const ids = GOLDEN_CANDIDATES.candidates.map(({ id }) => id);
  const details = ids.map((personId) =>
    candidateDetailSchema.parse({
      personId,
      isBlockedForDate: GOLDEN_BLOCKED.has(personId),
      history: scheduleHistory
        ? (GOLDEN_SCHEDULE_HISTORY.get(personId) ?? {
            serviceHistory: [],
            selectedPlanAssignments: [],
          })
        : undefined,
    })
  );
  // A budget-limited call answers some people now and defers the rest.
  return [details.slice(0, 3), details.slice(3)];
};

const GOLDEN_INPUTS: Record<"window" | "emptyWindow", GoldenInput> = {
  window: {
    candidates: GOLDEN_CANDIDATES,
    planId: PLAN_SEL,
    windowCalls: GOLDEN_WINDOW_CALLS,
    detailBatches: goldenDetails(false),
  },
  emptyWindow: {
    candidates: GOLDEN_CANDIDATES,
    planId: PLAN_SEL,
    windowCalls: [
      windowCall({ generatedAt: GOLDEN_PLAN_DATE, loadedPlanCount: 0 }),
    ],
    detailBatches: goldenDetails(true),
  },
};

/** How `usePositionCandidates` composes the parts. */
const loadGoldenList = ({
  candidates,
  planId,
  windowCalls,
  detailBatches,
}: GoldenInput) =>
  assembleCandidateList({
    candidates,
    windowHistory: expandWindowHistory(windowCalls, planId),
    scheduleHistory: needsScheduleHistory(windowCalls),
    details: collectCandidateDetails(detailBatches),
    date: GOLDEN_PLAN_DATE,
  });

for (const scenario of ["window", "emptyWindow"] as const) {
  const assembled = loadGoldenList(GOLDEN_INPUTS[scenario]);
  // What the browser received: JSON, so dates are strings and undefined fields are gone.
  const wireText = JSON.stringify(assembled.people);
  const wire: unknown = JSON.parse(wireText);
  if (!isDeepStrictEqual(wire, golden[scenario])) {
    throw new Error(
      `The ${scenario} parts no longer assemble into position-candidates-equivalence.golden.json`
    );
  }
}

const candidateListGoldenSuite = defineParitySuite<
  GoldenInput,
  CandidateListJson
>({
  name: "scheduling.candidateListGolden",
  cases: [GOLDEN_INPUTS.window, GOLDEN_INPUTS.emptyWindow],
  run: (input) => {
    const list = loadGoldenList(input);
    return {
      people: list.people.map(toPersonJson),
      complete: list.complete,
      progress: list.progress,
    };
  },
});

// Progressive loading

const batchCandidates = (count: number): PositionCandidates => ({
  ...LIST_CANDIDATES,
  candidates: Array.from({ length: count }, (_, index) =>
    listCandidate(`p-${index}`, `Person ${index}`)
  ),
});

interface BatchPlanInput {
  candidates: PositionCandidates | null;
  batchSize: number;
}

const planCandidateDetailsBatchesSuite = defineParitySuite<
  BatchPlanInput,
  string[][]
>({
  name: "scheduling.planCandidateDetailsBatches",
  cases: [
    { candidates: LIST_CANDIDATES, batchSize: 1 },
    { candidates: null, batchSize: 16 },
    ...[0, 1, 2, 16, 17, 33].flatMap((count) =>
      [1, 3, 16, 50].map((batchSize) => ({
        candidates: batchCandidates(count),
        batchSize,
      }))
    ),
  ],
  run: ({ candidates, batchSize }) =>
    planCandidateDetailsBatches(candidates ?? undefined, batchSize),
});

const needsScheduleHistorySuite = defineParitySuite<
  PlanWindowHistoryBatch[] | null,
  boolean
>({
  name: "scheduling.needsScheduleHistory",
  cases: [
    null,
    [],
    [listWindowCall(0)],
    [listWindowCall(0), listWindowCall(2)],
    [listWindowCall(0), listWindowCall(0)],
    [listWindowCall(3)],
    [listWindowCall(0.5)],
  ],
  run: (calls) => needsScheduleHistory(calls ?? undefined),
});

interface ContinuationJson {
  plans: WindowPlanRef[];
  serviceTypeIds: string[];
}

interface AdvanceInput {
  continuation: ContinuationJson;
  batch: PlanWindowHistoryBatch;
}

const planRef = (planId: string, serviceTypeId = "st-1"): WindowPlanRef => ({
  serviceTypeId,
  planId,
  rosterRequests: 1,
});

const SEED_CONTINUATION: ContinuationJson = {
  plans: [planRef("plan-1"), planRef("plan-2")],
  serviceTypeIds: ["st-2"],
};

const ADVANCE_SEEDS: readonly AdvanceInput[] = [
  { continuation: SEED_CONTINUATION, batch: listWindowCall(1) },
  {
    continuation: SEED_CONTINUATION,
    batch: {
      ...listWindowCall(0),
      deferredPlans: [planRef("plan-2")],
      deferredServiceTypeIds: ["st-2"],
    },
  },
  {
    continuation: SEED_CONTINUATION,
    batch: {
      ...listWindowCall(0),
      deferredPlans: [...SEED_CONTINUATION.plans, planRef("plan-3", "st-2")],
      deferredServiceTypeIds: [],
    },
  },
  {
    continuation: SEED_CONTINUATION,
    batch: {
      ...listWindowCall(0),
      deferredPlans: SEED_CONTINUATION.plans,
      deferredServiceTypeIds: SEED_CONTINUATION.serviceTypeIds,
    },
  },
];

const advanceInputs = (seed: number, count: number): AdvanceInput[] => {
  const random = createRandom(seed);
  const planIds = ["plan-1", "plan-2", "plan-3", "plan-4"];
  const serviceTypeIds = ["st-1", "st-2", "st-3"];
  return Array.from({ length: count }, () => ({
    continuation: {
      plans: subset(random, planIds).map((planId) => planRef(planId)),
      serviceTypeIds: subset(random, serviceTypeIds),
    },
    batch: {
      ...listWindowCall(pick(random, [0, 0, 0, 1, 2])),
      deferredPlans: subset(random, planIds).map((planId) =>
        planRef(planId, pick(random, serviceTypeIds))
      ),
      deferredServiceTypeIds: subset(random, serviceTypeIds),
    },
  }));
};

const windowHistoryAdvancedSuite = defineParitySuite<AdvanceInput, boolean>({
  name: "scheduling.windowHistoryAdvanced",
  cases: [...ADVANCE_SEEDS, ...advanceInputs(1111, 60)],
  run: ({ continuation, batch }) => windowHistoryAdvanced(continuation, batch),
});

interface BlockoutProgressInput {
  before: BlockoutProgress[];
  after: BlockoutProgress[];
}

const SEED_PROGRESS: BlockoutProgress[] = [
  { personId: "p-1", checkedBlockoutIds: ["b-1"], blocked: false },
];

const blockoutProgressInputs = (
  seed: number,
  count: number
): BlockoutProgressInput[] => {
  const random = createRandom(seed);
  const progressList = () =>
    z.array(blockoutProgressSchema).parse(
      repeat(random, 0, 3, () => ({
        personId: `p-${integer(random, 1, 3)}`,
        checkedBlockoutIds: subset(random, ["b-1", "b-2", "b-3", "b-4"]),
        blocked: chance(random, 0.25),
      }))
    );
  return Array.from({ length: count }, () => {
    const before = progressList();
    return { before, after: chance(random, 0.3) ? before : progressList() };
  });
};

const advancedBlockoutChecksSuite = defineParitySuite<
  BlockoutProgressInput,
  boolean
>({
  name: "scheduling.advancedBlockoutChecks",
  cases: [
    {
      before: SEED_PROGRESS,
      after: [
        { personId: "p-1", checkedBlockoutIds: ["b-1", "b-2"], blocked: false },
      ],
    },
    {
      before: SEED_PROGRESS,
      after: [{ personId: "p-1", checkedBlockoutIds: ["b-1"], blocked: true }],
    },
    {
      before: [],
      after: [{ personId: "p-2", checkedBlockoutIds: ["b-9"], blocked: false }],
    },
    { before: SEED_PROGRESS, after: SEED_PROGRESS },
    { before: [], after: [] },
    ...blockoutProgressInputs(1212, 60),
  ],
  run: ({ before, after }) => advancedBlockoutChecks(before, after),
});

interface ExpandWindowInput {
  windowCalls: PlanWindowHistoryBatch[] | null;
  planId: string;
}

const expandWindowHistorySuite = defineParitySuite<
  ExpandWindowInput,
  Entry<CandidateHistory>[] | null
>({
  name: "scheduling.expandWindowHistory",
  cases: [
    { windowCalls: null, planId: "plan-1" },
    { windowCalls: [listWindowCall(0)], planId: "plan-1" },
    { windowCalls: [listWindowCall(1)], planId: "plan-1" },
    { windowCalls: [listWindowCall(0), listWindowCall(1)], planId: "plan-0" },
    ...windowScenarios(1313, 8).map(({ calls, selectedPlanId }) => ({
      windowCalls: calls,
      planId: selectedPlanId,
    })),
  ],
  run: ({ windowCalls, planId }) => {
    const expanded = expandWindowHistory(windowCalls ?? undefined, planId);
    return expanded === undefined ? null : entriesOf(expanded);
  },
});

const collectCandidateDetailsSuite = defineParitySuite<
  (CandidateDetail[] | null)[],
  Entry<CandidateDetail>[]
>({
  name: "scheduling.collectCandidateDetails",
  cases: [
    [],
    [null],
    ...Array.from({ length: 24 }, (_, index) => {
      const random = createRandom(1414 + index);
      const referenceDate = pick(random, REFERENCE_DATES);
      return repeat(random, 0, 4, () =>
        chance(random, 0.25)
          ? null
          : repeat(random, 0, 4, () =>
              randomDetail(
                random,
                `p-${integer(random, 1, 6)}`,
                referenceDate,
                chance(random, 0.3)
              )
            )
      );
    }),
  ],
  run: (batches) =>
    entriesOf(
      collectCandidateDetails(batches.map((batch) => batch ?? undefined))
    ),
});

// Ranking reasons

/** Lines the scoring never writes, aimed at the prefix and suffix matching. */
const ADVERSARIAL_REASONS = [
  ["Ranked lower: first line"],
  ["Something", "Ranked slightly lower: y"],
  ["Something", "Minor penalty: x"],
  ["Something", "Light penalty: x"],
  ["Something", "Slight rehearsal penalty: x"],
  ["Something", "Minor rehearsal penalty: x"],
  ["Something", "Big_1 penalty: x"],
  ["Something", "Ünder penalty: x"],
  ["Something", "penalty: x"],
  ["Something", "Two words penalty: x"],
  ["Something", "Ranked lower:"],
  ["Something", "Ranked  lower: x"],
  ["Something", "ranked lower: x"],
  ["x before this plan"],
  ["Upcoming: 1 day after", "Ranked lower: rehearsed before this plan"],
  ["No past services"],
  ["No service history"],
  ["No services"],
  ["Rehearsal upcoming: soon"],
  ["Rehearsals upcoming: 2"],
  ["Prefers to serve monthly", "Ranked lower: x", "Ranked lower: y"],
  ["Prefers"],
  ["At most 2 plans a day"],
  ["Marked Unavailable for this position in Planning Center"],
  ["Marked Unavailable for this position in Planning Center!"],
  ["Prefers to serve x in Planning Center", "Ranked lower: z"],
  ["Prefers to serve Prefers to serve x", "Ranked lower: z"],
  ["Upcoming:"],
  ["Upcoming :"],
  ["Last served"],
  ["last served"],
  [""],
  [],
  ["Something new"],
  [
    "Last served 7 days before on Sun, Sep 20, 2026",
    "Prefers to serve every other week",
    "Ranked lower: served 7 days before",
    "At most 2 plans a month; this plan fits",
    "Marked Unavailable for this position in Planning Center",
    "Ranked lower: asked not to be scheduled here",
  ],
] as const;

/** Everything the scoring suites wrote, so grouping sees the exact scoring copy. */
const scoredReasons = (): string[][] => {
  const lists = [
    ...scoreCases.flatMap((input) =>
      runScoring(input).map(
        ({ recommendationReasoning }) => recommendationReasoning
      )
    ),
    ...preferenceCases.map((input) => runPreferences(input).reasoning),
  ];
  const unique = new Map(lists.map((list) => [JSON.stringify(list), list]));
  return [...unique.values()];
};

const reasonCases = [
  ...ADVERSARIAL_REASONS.map((reasons) => [...reasons]),
  ...scoredReasons(),
];

const groupRankingReasonsSuite = defineParitySuite<string[], RankingFact[]>({
  name: "scheduling.groupRankingReasons",
  cases: reasonCases,
  run: groupRankingReasons,
});

const preferenceConflictsSuite = defineParitySuite<string[], string[]>({
  name: "scheduling.preferenceConflicts",
  cases: reasonCases,
  run: preferenceConflicts,
});

// Recommendation strip

interface StripInput {
  people: RankedPersonJson[];
  settled: boolean;
}

const ids = (list: readonly PersonWithAvailability[]) =>
  list.map(({ id }) => id);

interface StripJson {
  onSlot: string[];
  candidates: string[];
  exceptions: string[];
}

/** `recommendation-strip-order.test.ts`. */
const STRIP_SEEDS: readonly StripInput[] = [
  {
    people: [
      ranked("1", "A High", { recommendationScore: 90 }),
      ranked("2", "B Low", { recommendationScore: 10 }),
      ranked("3", "C Blocked", {
        isBlockedForDate: true,
        recommendationScore: 99,
      }),
      ranked("4", "D Mid", { recommendationScore: 50 }),
    ],
    settled: true,
  },
  {
    people: [
      ranked("1", "Scheduled", {
        isScheduledForSelectedPlanPosition: true,
        recommendationScore: 100,
      }),
      ranked("2", "Open", { recommendationScore: 5 }),
      ranked("3", "Confirmed", {
        isConfirmedForSelectedPlanPosition: true,
        recommendationScore: 0,
      }),
    ],
    settled: true,
  },
  {
    people: [
      ranked("1", "Blocked On Slot", {
        isScheduledForSelectedPlanPosition: true,
        isBlockedForDate: true,
      }),
      ranked("2", "Blocked", { isBlockedForDate: true }),
    ],
    settled: true,
  },
  {
    people: [
      ranked("b", "Blocked", {
        isBlockedForDate: true,
        recommendationScore: 100,
      }),
      ranked("d", "Declined", {
        isDeclinedForSelectedPlanPosition: true,
        recommendationScore: 100,
      }),
      ranked("o", "Open", { recommendationScore: 50 }),
    ],
    settled: true,
  },
  {
    people: [
      ranked("1", "Cara Blocked", {
        isBlockedForDate: true,
      }),
      ranked("2", "Ben Pending"),
      ranked("3", "Ann Declined", {
        isScheduledForSelectedPlanPosition: true,
        isDeclinedForSelectedPlanPosition: true,
      }),
      ranked("4", "Dee Scheduled", {
        isScheduledForSelectedPlanPosition: true,
      }),
    ],
    settled: false,
  },
];

const partitionForRecommendationStripSuite = defineParitySuite<
  StripInput,
  StripJson
>({
  name: "scheduling.partitionForRecommendationStrip",
  cases: [
    ...STRIP_SEEDS,
    ...peopleInputs(1515, 100).map(({ people }, index) => ({
      people,
      settled: index % 3 !== 0,
    })),
  ],
  run: ({ people, settled }) => {
    const { onSlot, candidates, exceptions } =
      partitionPeopleForRecommendationStrip(people.map(rankedPerson), {
        settled,
      });
    return {
      onSlot: ids(onSlot),
      candidates: ids(candidates),
      exceptions: ids(exceptions),
    };
  },
});

// Schedule days and candidate summaries

interface ScheduleDaysInput {
  history: ServiceHistoryItem[];
  referenceDate: Date;
  timeZone: string;
  halfRangeDays?: number;
}

/** 7 PM on Fri, Oct 23 in Los Angeles; already Oct 24 in UTC. */
const OCT_23_EVENING = new Date("2026-10-24T02:00:00.000Z");

const dayItem = (
  id: string,
  iso: string,
  partial: Partial<ServiceHistoryItem> = {}
): ServiceHistoryItem => ({
  id,
  sourceScheduleId: id,
  date: new Date(iso),
  teamPositionName: "Keys",
  status: "C",
  timeType: "service",
  ...partial,
});

/** `schedule-days.test.ts`. */
const SCHEDULE_DAY_SEEDS: readonly ScheduleDaysInput[] = [
  {
    history: [],
    referenceDate: OCT_23_EVENING,
    timeZone: "America/Los_Angeles",
    halfRangeDays: 2,
  },
  {
    history: [
      dayItem("r", "2026-10-23T02:00:00.000Z", { timeType: "rehearsal" }),
      dayItem("plan", "2026-10-24T02:00:00.000Z", { status: "U" }),
      dayItem("sun", "2026-10-25T17:00:00.000Z"),
    ],
    referenceDate: OCT_23_EVENING,
    timeZone: "America/Los_Angeles",
    halfRangeDays: 7,
  },
  {
    history: [
      dayItem("r", "2026-10-18T15:00:00.000Z", { timeType: "rehearsal" }),
      dayItem("s", "2026-10-18T17:00:00.000Z"),
    ],
    referenceDate: OCT_23_EVENING,
    timeZone: "America/Los_Angeles",
    halfRangeDays: 7,
  },
  {
    history: [
      dayItem("d", "2026-10-20T17:00:00.000Z", { status: "D" }),
      dayItem("far", "2026-11-20T17:00:00.000Z"),
    ],
    referenceDate: OCT_23_EVENING,
    timeZone: "America/Los_Angeles",
    halfRangeDays: 7,
  },
];

const scheduleDaysInputs = (
  seed: number,
  count: number
): ScheduleDaysInput[] => {
  const random = createRandom(seed);
  return Array.from({ length: count }, (_, index) => {
    const referenceDate = pick(random, REFERENCE_DATES);
    return {
      history: randomHistory(random, referenceDate, 12).map((item) => ({
        ...item,
        status: pick(random, [...STATUSES, "c", " confirmed ", "CONFIRMED"]),
      })),
      referenceDate,
      timeZone: pick(random, ZONES),
      halfRangeDays:
        index % 4 === 0 ? undefined : pick(random, [0, 1, 3, 7, 10]),
    };
  });
};

const buildScheduleDaysSuite = defineParitySuite<
  ScheduleDaysInput,
  ScheduleDay[]
>({
  name: "scheduling.buildScheduleDays",
  cases: [...SCHEDULE_DAY_SEEDS, ...scheduleDaysInputs(1616, 40)],
  run: ({ history, referenceDate, timeZone, halfRangeDays }) =>
    buildScheduleDays(history, referenceDate, timeZone, halfRangeDays),
});

interface CandidateSummaryInput {
  frequency: ScheduleFrequency | null;
  referenceDate: Date | null;
  timeZone: string;
  onThisPlan: boolean;
}

/** `candidate-summary.test.ts`. */
const SUMMARY_SEEDS: readonly CandidateSummaryInput[] = [
  {
    frequency: null,
    referenceDate: OCT_23_EVENING,
    timeZone: "America/Los_Angeles",
    onThisPlan: false,
  },
  {
    frequency: frequency({}),
    referenceDate: OCT_23_EVENING,
    timeZone: "America/Los_Angeles",
    onThisPlan: false,
  },
  {
    frequency: frequency({
      lastServedDate: new Date("2026-10-05T03:30:00.000Z"),
      recentServedDays: 1,
    }),
    referenceDate: OCT_23_EVENING,
    timeZone: "America/Los_Angeles",
    onThisPlan: false,
  },
  {
    frequency: frequency({
      lastServedDate: new Date("2026-10-11T17:00:00.000Z"),
      recentServedDays: 3,
      nextUpcomingDate: new Date("2026-10-25T17:00:00.000Z"),
      upcomingServices: 1,
    }),
    referenceDate: OCT_23_EVENING,
    timeZone: "America/Los_Angeles",
    onThisPlan: false,
  },
  ...[false, true].map((onThisPlan) => ({
    frequency: frequency({
      lastServedDate: new Date("2026-10-23T17:00:00.000Z"),
      recentServedDays: 1,
    }),
    referenceDate: OCT_23_EVENING,
    timeZone: "America/Los_Angeles",
    onThisPlan,
  })),
];

const summaryInputs = (
  seed: number,
  count: number
): CandidateSummaryInput[] => {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => {
    const referenceDate = pick(random, REFERENCE_DATES);
    const servedThatDay = chance(random, 0.25);
    const base = chance(random, 0.15)
      ? null
      : randomFrequency(random, referenceDate);
    return {
      frequency:
        base !== null && servedThatDay
          ? {
              ...base,
              lastServedDate: shift(
                referenceDate,
                integer(random, -6, 6) * HOUR_MS
              ),
            }
          : base,
      referenceDate: chance(random, 0.1) ? null : referenceDate,
      timeZone: pick(random, ZONES),
      onThisPlan: chance(random, 0.4),
    };
  });
};

const summarizeCandidateScheduleSuite = defineParitySuite<
  CandidateSummaryInput,
  string[]
>({
  name: "scheduling.summarizeCandidateSchedule",
  cases: [...SUMMARY_SEEDS, ...summaryInputs(1717, 120)],
  run: ({ frequency: facts, referenceDate, timeZone, onThisPlan }) =>
    summarizeCandidateSchedule(facts ?? undefined, referenceDate, timeZone, {
      onThisPlan,
    }),
});

// Assignment labels

const SLOT_LABELS = [
  "Band - Keys",
  "Keys",
  "band - keys",
  " Keys ",
  "Vocals - Keys",
  "Band - Electric Guitar",
  "Electric Guitar",
  "Band - Bass - Left",
  "Bass - Left",
  "Left",
  "",
  " - Keys",
  "Band -Keys",
  "Band - Keys - Band - Keys",
  `Band - ${KELVIN}eys`,
  `${DOTTED_CAPITAL_I} - Keys`,
] as const;

const positionFromLabelSuite = defineParitySuite<string, string>({
  name: "scheduling.positionFromLabel",
  cases: [
    ...SLOT_LABELS,
    "Band  - Keys",
    "Band - ",
    " - ",
    "-",
    "Band-Keys",
    `Band${NBSP}- Keys`,
  ],
  run: positionFromLabel,
});

interface OtherLabelsInput {
  labels: string[];
  teamName: string | null;
  positionName: string | null;
}

const otherPlanAssignmentLabelsSuite = defineParitySuite<
  OtherLabelsInput,
  string[]
>({
  name: "scheduling.otherPlanAssignmentLabels",
  cases: Array.from({ length: 140 }, (_, index) => {
    const random = createRandom(1818 + index);
    return {
      labels: repeat(random, 0, 6, () => pick(random, SLOT_LABELS)),
      teamName: pick(random, [null, "Band", "band", "", "Vocals", " Band"]),
      positionName: pick(random, [
        null,
        "Keys",
        "",
        "keys",
        "Bass - Left",
        "Left",
      ]),
    };
  }),
  run: ({ labels, teamName, positionName }) =>
    otherPlanAssignmentLabels(labels, teamName, positionName),
});

// Team roster

// The plan person helpers import a type from a `.tsx` component, which the root project
// (without JSX) cannot type-check, so they are loaded at runtime and checked with zod.
const planAssignmentSchema = z.object({
  teamId: z.string(),
  positionId: z.string(),
  positionName: z.string(),
  status: z.enum(["confirmed", "scheduled"]),
});
type PlanAssignment = z.output<typeof planAssignmentSchema>;
const planAssignmentsSchema = z.map(z.string(), z.array(planAssignmentSchema));
const slotKeySchema = z.object({ teamId: z.string(), positionId: z.string() });

const webModulePath = (relativePath: string): string =>
  path.join(import.meta.dirname, "../../apps/web/src", relativePath);

const { collectPlanAssignments, otherPlanAssignments } = z
  .object({
    collectPlanAssignments: z.function({
      input: [z.array(teamPositionGroupSchema)],
      output: planAssignmentsSchema,
    }),
    otherPlanAssignments: z.function({
      input: [planAssignmentsSchema, filledPositionPersonSchema, slotKeySchema],
      output: z.array(planAssignmentSchema),
    }),
  })
  .parse(
    await import(webModulePath("components/schedule/plan-assignments.ts"))
  );

const { getPlanPersonStatusValue } = z
  .object({
    getPlanPersonStatusValue: z.function({
      input: [
        filledPositionPersonSchema.pick({ status: true, rawStatus: true }),
      ],
      output: z.enum(["confirmed", "scheduled", "declined"]),
    }),
  })
  .parse(
    await import(webModulePath("components/schedule/plan-person-status.ts"))
  );

const UNSENT: PlanPersonNotification = {
  prepared: true,
  sentAt: null,
  senderName: null,
};
const SENT: PlanPersonNotification = {
  prepared: false,
  sentAt: "2026-09-20T15:00:00Z",
  senderName: "Sam",
};
const UNRECORDED: PlanPersonNotification = {
  prepared: false,
  sentAt: null,
  senderName: null,
};

const RAW_STATUSES = [
  "C",
  "U",
  "D",
  "c",
  " C ",
  "Confirmed",
  "CONFIRMED",
  "d",
  "Declined",
  "declined_by_x",
  "Removed",
  "was removed",
  "Pending",
  "",
  "Decline",
  "u",
] as const;

const SENT_AT_VALUES = [
  "2026-09-20T15:00:00Z",
  "2026-09-20T15:00:00.000Z",
  "2026-09-21T03:30:00Z",
  "2026-09-20T23:30:00-07:00",
  "2026-09-20T15:00:00+02:00",
  "2026-09-20",
  "2026-09-20T24:00:00Z",
  "2026-02-31T12:00:00Z",
  "2026-09-20T15:00:00.123456Z",
  "",
  "not a date",
  "2026-13-01T00:00:00Z",
  "2026-09-20T15:00:60Z",
] as const;

const randomNotification = (random: Random): PlanPersonNotification | null =>
  pick(random, [
    null,
    UNSENT,
    UNSENT,
    SENT,
    UNRECORDED,
    {
      prepared: chance(random, 0.3),
      sentAt: pick(random, [null, ...SENT_AT_VALUES]),
      senderName: pick(random, [null, "Sam", "Jordan Lee"]),
    },
  ]);

const randomFilledPerson = (
  random: Random,
  index: number
): FilledPositionPerson => ({
  id: `person-${integer(random, 1, 8)}`,
  planPersonId: `pp-${index}`,
  personId: pick(random, [
    `person-${integer(random, 1, 8)}`,
    `person-${integer(random, 1, 8)}`,
    null,
    undefined,
  ]),
  name: pick(random, NAMES),
  status: pick(random, ["pending", "confirmed"] as const),
  rawStatus: pick(random, RAW_STATUSES),
  photoThumbnailUrl: pick(random, [
    undefined,
    null,
    `https://example.test/${index}.jpg`,
  ]),
  notification: randomNotification(random),
});

const SOURCES = [
  undefined,
  "team_position",
  "needed_position",
  "plan_member",
  "custom",
] as const;

const randomTeamPosition = (
  random: Random,
  teamId: string,
  index: number,
  firstFilled: { value: number }
): TeamPosition => {
  const filledPeople = chance(random, 0.2)
    ? undefined
    : repeat(random, 0, 3, () => {
        firstFilled.value += 1;
        return randomFilledPerson(random, firstFilled.value);
      });
  return {
    id: `pos-${index}`,
    name: pick(random, POSITION_NAMES),
    teamId,
    teamName: chance(random, 0.5) ? pick(random, TEAM_NAMES) : undefined,
    source: pick(random, SOURCES),
    neededCount: pick(random, [undefined, 0, 0, 1, 2, 0.5]),
    filledPendingCount: chance(random, 0.5) ? integer(random, 0, 2) : undefined,
    filledConfirmedCount: chance(random, 0.5)
      ? integer(random, 0, 2)
      : undefined,
    filledPeople,
  };
};

const randomGroups = (random: Random): TeamPositionGroup[] => {
  const firstFilled = { value: 0 };
  return z.array(teamPositionGroupSchema).parse(
    repeat(random, 0, 3, (teamIndex) => {
      const teamId = `team-${teamIndex}`;
      return {
        teamId,
        teamName: pick(random, TEAM_NAMES),
        positions: repeat(random, 0, 3, (index) =>
          randomTeamPosition(
            random,
            teamId,
            teamIndex * 10 + index,
            firstFilled
          )
        ),
      };
    })
  );
};

const OPEN_GROUPS: TeamPositionGroup[] = [
  {
    teamId: "av",
    teamName: "Audio/Visual",
    positions: [
      { id: "cam1", name: "Camera 1", teamId: "av", neededCount: 1 },
      { id: "sound", name: "Sound", teamId: "av", neededCount: 0 },
    ],
  },
  {
    teamId: "band",
    teamName: "Band",
    positions: [
      { id: "keys", name: "Keys", teamId: "band" },
      { id: "drums", name: "Drums", teamId: "band", neededCount: 2 },
    ],
  },
];

const SINGLE_GROUP: TeamPositionGroup[] = [
  {
    teamId: "av",
    teamName: "Audio/Visual",
    positions: [{ id: "cam1", name: "Camera 1", teamId: "av", neededCount: 1 }],
  },
];

const groupInputs = (seed: number, count: number): TeamPositionGroup[][] => {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => randomGroups(random));
};

const rosterGroups = groupInputs(1919, 40);

const openSlotCountSuite = defineParitySuite<TeamPosition, number>({
  name: "scheduling.openSlotCount",
  cases: [
    ...OPEN_GROUPS.flatMap(({ positions }) => positions),
    ...rosterGroups.flatMap((groups) =>
      groups.flatMap(({ positions }) =>
        positions.map(
          ({ filledPeople: _filledPeople, ...position }) => position
        )
      )
    ),
  ],
  run: openSlotCount,
});

const findFirstPositionSuite = defineParitySuite<
  TeamPositionGroup[],
  OpenPositionRef | null
>({
  name: "scheduling.findFirstPosition",
  cases: [
    [
      { teamId: "empty", teamName: "Empty", positions: [] },
      {
        teamId: "av",
        teamName: "Audio/Visual",
        positions: [{ id: "sound", name: "Sound", teamId: "av" }],
      },
    ],
    [],
    OPEN_GROUPS,
    ...rosterGroups,
  ],
  run: findFirstPosition,
});

interface NextOpenInput {
  groups: TeamPositionGroup[];
  current: { teamId: string; positionId: string } | null;
}

const nextOpenInputs = (): NextOpenInput[] => {
  const random = createRandom(2020);
  return rosterGroups.flatMap((groups) => {
    const slots = groups.flatMap(({ teamId, positions }) =>
      positions.map(({ id }) => ({ teamId, positionId: id }))
    );
    return [
      { groups, current: null },
      ...(slots.length > 0 ? [{ groups, current: pick(random, slots) }] : []),
    ];
  });
};

const findNextOpenPositionSuite = defineParitySuite<
  NextOpenInput,
  OpenPositionRef | null
>({
  name: "scheduling.findNextOpenPosition",
  cases: [
    { groups: OPEN_GROUPS, current: null },
    { groups: OPEN_GROUPS, current: { teamId: "av", positionId: "cam1" } },
    { groups: OPEN_GROUPS, current: { teamId: "band", positionId: "drums" } },
    { groups: SINGLE_GROUP, current: { teamId: "av", positionId: "cam1" } },
    { groups: OPEN_GROUPS, current: { teamId: "band", positionId: "cam1" } },
    { groups: OPEN_GROUPS, current: { teamId: "missing", positionId: "x" } },
    { groups: [], current: null },
    ...nextOpenInputs(),
  ],
  run: ({ groups, current }) => findNextOpenPosition(groups, current),
});

interface StatusValueInput {
  status: FilledPositionPerson["status"];
  rawStatus: string;
}

const planPersonStatusValueSuite = defineParitySuite<StatusValueInput, string>({
  name: "scheduling.planPersonStatusValue",
  cases: RAW_STATUSES.flatMap((rawStatus) =>
    (["pending", "confirmed"] as const).map((status) => ({ status, rawStatus }))
  ),
  run: getPlanPersonStatusValue,
});

const assignmentPerson = (
  personId: string,
  planPersonId: string,
  rawStatus: string
): FilledPositionPerson => ({
  id: personId,
  planPersonId,
  personId,
  name: personId,
  status: rawStatus === "C" ? "confirmed" : "pending",
  rawStatus,
  notification: null,
});

const ASSIGNMENT_GROUPS: TeamPositionGroup[] = [
  {
    teamId: "band",
    teamName: "Band",
    positions: [
      {
        id: "keys",
        name: "Keys",
        teamId: "band",
        filledPeople: [assignmentPerson("brandon", "pp-1", "C")],
      },
    ],
  },
  {
    teamId: "vocals",
    teamName: "Vocals",
    positions: [
      {
        id: "leader",
        name: "Worship Leader",
        teamId: "vocals",
        filledPeople: [
          assignmentPerson("brandon", "pp-2", "U"),
          assignmentPerson("jasmine", "pp-3", "D"),
        ],
      },
    ],
  },
];

const collectPlanAssignmentsSuite = defineParitySuite<
  TeamPositionGroup[],
  Entry<PlanAssignment[]>[]
>({
  name: "scheduling.collectPlanAssignments",
  cases: [ASSIGNMENT_GROUPS, [], ...rosterGroups],
  run: (groups) => entriesOf(collectPlanAssignments(groups)),
});

interface OtherAssignmentsInput {
  groups: TeamPositionGroup[];
  person: FilledPositionPerson;
  slot: { teamId: string; positionId: string };
}

const otherAssignmentsInputs = (): OtherAssignmentsInput[] => {
  const random = createRandom(2121);
  return rosterGroups.flatMap((groups) => {
    const filled = groups.flatMap(({ teamId, positions }) =>
      positions.flatMap((position) =>
        (position.filledPeople ?? []).map((person) => ({
          person,
          slot: { teamId, positionId: position.id },
        }))
      )
    );
    return filled.length === 0
      ? []
      : repeat(random, 1, 2, () => {
          const choice = pick(random, filled);
          return {
            groups,
            person: choice.person,
            slot: chance(random, 0.7) ? choice.slot : pick(random, filled).slot,
          };
        });
  });
};

const otherPlanAssignmentsSuite = defineParitySuite<
  OtherAssignmentsInput,
  PlanAssignment[]
>({
  name: "scheduling.otherPlanAssignments",
  cases: [
    {
      groups: ASSIGNMENT_GROUPS,
      person: assignmentPerson("brandon", "pp-1", "C"),
      slot: { teamId: "band", positionId: "keys" },
    },
    {
      groups: ASSIGNMENT_GROUPS,
      person: assignmentPerson("jasmine", "pp-3", "D"),
      slot: { teamId: "band", positionId: "keys" },
    },
    ...otherAssignmentsInputs(),
  ],
  run: ({ groups, person, slot }) =>
    otherPlanAssignments(collectPlanAssignments(groups), person, slot),
});

// Scheduling notifications

const notifiedPerson = (
  personId: string,
  notification: PlanPersonNotification | null
): FilledPositionPerson => ({
  id: personId,
  planPersonId: `pp-${personId}`,
  personId,
  name: `Person ${personId}`,
  status: "pending",
  rawStatus: "U",
  photoThumbnailUrl: null,
  notification,
});

const NOTIFICATION_GROUPS: TeamPositionGroup[] = [
  {
    teamId: "band",
    teamName: "Band",
    positions: [
      {
        id: "keys",
        name: "Keys",
        teamId: "band",
        filledPeople: [notifiedPerson("a", UNSENT), notifiedPerson("b", SENT)],
      },
      {
        id: "vocals",
        name: "Vocals",
        teamId: "band",
        filledPeople: [notifiedPerson("a", UNSENT), notifiedPerson("c", null)],
      },
    ],
  },
  {
    teamId: "tech",
    teamName: "Tech",
    positions: [
      {
        id: "sound",
        name: "Sound",
        teamId: "tech",
        filledPeople: [notifiedPerson("d", UNSENT)],
      },
    ],
  },
];

const notificationStateSuite = defineParitySuite<
  PlanPersonNotification | null,
  SchedulingNotificationState
>({
  name: "scheduling.notificationState",
  cases: [
    UNSENT,
    SENT,
    UNRECORDED,
    null,
    { ...SENT, prepared: true },
    { prepared: false, sentAt: "", senderName: null },
    { prepared: false, sentAt: "garbage", senderName: "Sam" },
  ],
  run: getSchedulingNotificationState,
});

const collectUnnotifiedPeopleSuite = defineParitySuite<
  TeamPositionGroup[],
  UnnotifiedPerson[]
>({
  name: "scheduling.collectUnnotifiedPeople",
  cases: [
    NOTIFICATION_GROUPS,
    [
      { teamId: "tech", teamName: "Tech", positions: [] },
      {
        teamId: "x",
        teamName: "X",
        positions: [
          {
            id: "p",
            name: "P",
            teamId: "x",
            filledPeople: [notifiedPerson("e", SENT)],
          },
        ],
      },
    ],
    [],
    ...rosterGroups,
  ],
  run: collectUnnotifiedPeople,
});

interface PositionStatesInput {
  groups: TeamPositionGroup[] | null;
  teamId: string | null;
  positionId: string | null;
}

const positionNotificationStatesSuite = defineParitySuite<
  PositionStatesInput,
  Entry<SchedulingNotificationState>[]
>({
  name: "scheduling.positionNotificationStates",
  cases: [
    { groups: NOTIFICATION_GROUPS, teamId: "band", positionId: "vocals" },
    { groups: NOTIFICATION_GROUPS, teamId: "band", positionId: "missing" },
    { groups: null, teamId: "band", positionId: "keys" },
    { groups: NOTIFICATION_GROUPS, teamId: null, positionId: "keys" },
    ...rosterGroups.flatMap((groups) =>
      groups.flatMap(({ teamId, positions }) =>
        positions
          .slice(0, 1)
          .map(({ id }) => ({ groups, teamId, positionId: id }))
      )
    ),
  ],
  run: ({ groups, teamId, positionId }) =>
    entriesOf(
      getPositionNotificationStates(groups ?? undefined, teamId, positionId)
    ),
});

interface DescribeNotificationInput {
  notification: PlanPersonNotification | null;
  timeZone: string;
}

const describeSchedulingNotificationSuite = defineParitySuite<
  DescribeNotificationInput,
  string | null
>({
  name: "scheduling.describeSchedulingNotification",
  cases: [
    { notification: null, timeZone: "America/Los_Angeles" },
    { notification: UNSENT, timeZone: "America/Los_Angeles" },
    { notification: UNRECORDED, timeZone: "America/Los_Angeles" },
    ...SENT_AT_VALUES.flatMap((sentAt) =>
      ["America/Los_Angeles", "UTC", "Pacific/Auckland"].flatMap((timeZone) =>
        [null, "Sam"].map((senderName) => ({
          notification: { prepared: false, sentAt, senderName },
          timeZone,
        }))
      )
    ),
    {
      notification: { prepared: true, sentAt: SENT.sentAt, senderName: "Sam" },
      timeZone: "UTC",
    },
  ],
  run: ({ notification, timeZone }) =>
    describeSchedulingNotification(notification, timeZone),
});

// Optimistic schedule cache transforms

type StatusCode = "C" | "U" | "D";

type OptimismOperation =
  | {
      kind: "schedule";
      teamId: string;
      positionId: string;
      person: OptimisticSchedulePerson;
      planPersonId: string;
    }
  | { kind: "reconcile"; optimisticPlanPersonId: string; planPersonId: string }
  | { kind: "updateStatus"; planPersonId: string; status: StatusCode }
  | { kind: "unschedule"; planPersonId: string; personId: string | null };

interface OptimismCaches {
  candidates: PositionCandidates | null;
  windowHistory: PlanWindowHistoryBatch[] | null;
  teamPositions: TeamPositionGroup[] | null;
}

interface OptimismInput extends OptimismCaches {
  operation: OptimismOperation;
}

type OptimismClient = Parameters<typeof optimisticallySchedulePerson>[0];

// TanStack Query is the web app's dependency, so it is loaded from there; the cache transforms
// are only reachable through a query client, which stores and returns data synchronously.
const reactQuery: unknown = await import(
  createRequire(
    path.join(import.meta.dirname, "../../apps/web/package.json")
  ).resolve("@tanstack/react-query")
);
// The class is taken on trust (a constructor has no schema); `new QueryClient()` below fails
// at once if the import ever stops providing it.
const { QueryClient } = z
  .object({ QueryClient: z.custom<new () => OptimismClient>() })
  .parse(reactQuery);

const OPTIMISM_SERVICE_TYPE = "st-1";
const OPTIMISM_PLAN = "plan-1";
const OPTIMISM_DATE_KEY = "2026-09-27T17:00:00.000Z";
const DEFAULT_SLOT = { teamId: "team-1", positionId: "position-1" };

const slotOf = (operation: OptimismOperation) =>
  operation.kind === "schedule"
    ? { teamId: operation.teamId, positionId: operation.positionId }
    : DEFAULT_SLOT;

const runOptimism = ({
  operation,
  candidates,
  windowHistory,
  teamPositions,
}: OptimismInput): OptimismCaches => {
  const client = new QueryClient();
  const slot = slotOf(operation);
  const candidatesKey = queryKeys.positionCandidates(
    OPTIMISM_SERVICE_TYPE,
    slot.teamId,
    slot.positionId,
    OPTIMISM_PLAN
  );
  const windowKey = queryKeys.planWindowHistory(OPTIMISM_DATE_KEY);
  const teamPositionsKey = queryKeys.teamPositions(
    OPTIMISM_SERVICE_TYPE,
    OPTIMISM_PLAN,
    null
  );
  if (candidates !== null) {
    client.setQueryData(candidatesKey, structuredClone(candidates));
  }
  if (windowHistory !== null) {
    client.setQueryData(windowKey, structuredClone(windowHistory));
  }
  if (teamPositions !== null) {
    client.setQueryData(teamPositionsKey, structuredClone(teamPositions));
  }
  switch (operation.kind) {
    case "schedule": {
      optimisticallySchedulePerson(
        client,
        {
          serviceTypeId: OPTIMISM_SERVICE_TYPE,
          planId: OPTIMISM_PLAN,
          teamId: operation.teamId,
          positionId: operation.positionId,
        },
        operation.person,
        operation.planPersonId
      );
      break;
    }
    case "reconcile": {
      reconcileOptimisticPlanPersonId(
        client,
        operation.optimisticPlanPersonId,
        operation.planPersonId
      );
      break;
    }
    case "updateStatus": {
      optimisticallyUpdatePlanPersonStatus(
        client,
        operation.planPersonId,
        operation.status
      );
      break;
    }
    case "unschedule": {
      optimisticallyUnschedulePlanPerson(
        client,
        operation.planPersonId,
        operation.personId
      );
      break;
    }
    default: {
      break;
    }
  }
  return {
    candidates: positionCandidatesSchema
      .nullable()
      .parse(client.getQueryData(candidatesKey) ?? null),
    windowHistory: z
      .array(planWindowHistoryBatchSchema)
      .nullable()
      .parse(client.getQueryData(windowKey) ?? null),
    teamPositions: z
      .array(teamPositionGroupSchema)
      .nullable()
      .parse(client.getQueryData(teamPositionsKey) ?? null),
  };
};

const optimismCandidate = (
  partial: Partial<PositionCandidate> = {}
): PositionCandidate => ({
  id: "person-1",
  firstName: "Andrew",
  lastName: "Hinea",
  fullName: "Andrew Hinea",
  photoUrl: null,
  photoThumbnailUrl: null,
  archived: false,
  selectedPlanRosterLabels: [],
  selectedPlanSlot: null,
  schedulingPreferences: null,
  ...partial,
});

const optimismCandidates = (
  people: PositionCandidate[]
): PositionCandidates => ({
  generatedAt: "2026-05-20T00:00:00.000Z",
  timeZone: "America/Los_Angeles",
  match: { planId: OPTIMISM_PLAN, teamId: "team-1" },
  candidates: people,
});

const optimismWindowRow = (id: string, planId: string): WindowRosterRow => ({
  id,
  planId,
  teamId: "team-1",
  teamPositionName: "Acoustic Guitar",
  status: "C",
  createdAt: "2026-05-01T00:00:00.000Z",
  timeIds: [],
  serviceTimeIds: [],
  declineReason: null,
});

const optimismWindow = (): PlanWindowHistoryBatch[] => [
  windowCall({
    generatedAt: "2026-05-20T00:00:00.000Z",
    loadedPlanCount: 2,
    people: [
      {
        personId: "person-1",
        rows: [
          optimismWindowRow("plan-person-earlier", "plan-0"),
          optimismWindowRow("plan-person-1", OPTIMISM_PLAN),
        ],
      },
    ],
  }),
];

const optimismGroups = (
  filledPeople?: FilledPositionPerson[]
): TeamPositionGroup[] => [
  {
    teamId: "team-1",
    teamName: "Band",
    positions: [
      {
        id: "position-1",
        name: "Acoustic Guitar",
        teamId: "team-1",
        teamName: "Band",
        neededCount: 1,
        filledPendingCount: 0,
        filledConfirmedCount: 0,
        filledPeople,
      },
    ],
  },
];

const ANDREW: OptimisticSchedulePerson = {
  id: "person-1",
  firstName: "Andrew",
  lastName: "Hinea",
  fullName: "Andrew Hinea",
  photoUrl: null,
  photoThumbnailUrl: null,
};

const filledAndrew = (
  planPersonId: string,
  rawStatus: StatusCode
): FilledPositionPerson => ({
  id: "person-1",
  planPersonId,
  name: "Andrew Hinea",
  status: rawStatus === "C" ? "confirmed" : "pending",
  rawStatus,
  photoThumbnailUrl: null,
  notification: UNSENT,
});

/** The operations `use-schedule-cache-optimism.test.ts` drives. */
const OPTIMISM_SEEDS: readonly OptimismInput[] = [
  {
    operation: {
      kind: "schedule",
      ...DEFAULT_SLOT,
      person: ANDREW,
      planPersonId: "optimistic-1",
    },
    candidates: optimismCandidates([optimismCandidate()]),
    windowHistory: optimismWindow(),
    teamPositions: optimismGroups(),
  },
  {
    operation: {
      kind: "schedule",
      ...DEFAULT_SLOT,
      person: { id: "person-new", fullName: "  New   Person Here " },
      planPersonId: "optimistic-2",
    },
    candidates: optimismCandidates([optimismCandidate()]),
    windowHistory: null,
    teamPositions: optimismGroups([filledAndrew("plan-person-1", "C")]),
  },
  {
    operation: {
      kind: "reconcile",
      optimisticPlanPersonId: "optimistic-1",
      planPersonId: "plan-person-9",
    },
    candidates: optimismCandidates([
      optimismCandidate({
        selectedPlanSlot: {
          planPersonId: "optimistic-1",
          status: "pending",
          declineReason: null,
        },
      }),
    ]),
    windowHistory: optimismWindow(),
    teamPositions: optimismGroups([filledAndrew("optimistic-1", "U")]),
  },
  ...(["C", "U", "D"] as const).map((status): OptimismInput => ({
    operation: { kind: "updateStatus", planPersonId: "plan-person-1", status },
    candidates: optimismCandidates([
      optimismCandidate({
        selectedPlanSlot: {
          planPersonId: "plan-person-1",
          status: "declined",
          declineReason: "Busy",
        },
      }),
    ]),
    windowHistory: optimismWindow(),
    teamPositions: optimismGroups([filledAndrew("plan-person-1", "U")]),
  })),
  {
    operation: {
      kind: "unschedule",
      planPersonId: "plan-person-1",
      personId: "person-1",
    },
    candidates: optimismCandidates([
      optimismCandidate({
        selectedPlanSlot: {
          planPersonId: "plan-person-1",
          status: "confirmed",
          declineReason: null,
        },
      }),
    ]),
    windowHistory: optimismWindow(),
    teamPositions: optimismGroups([filledAndrew("plan-person-1", "C")]),
  },
];

const randomOptimisticPerson = (
  random: Random,
  index: number
): OptimisticSchedulePerson => ({
  id: `person-${integer(random, 1, 8)}`,
  firstName: pick(random, [undefined, null, "Andrew", ""]),
  lastName: pick(random, [undefined, null, "Hinea"]),
  fullName: pick(random, [
    ...NAMES,
    "  Mary  Ann   Smith ",
    `${NBSP}Ana${NBSP}Lucia`,
  ]),
  photoUrl: pick(random, [
    undefined,
    null,
    `https://example.test/${index}.jpg`,
  ]),
  photoThumbnailUrl: pick(random, [
    undefined,
    null,
    `https://example.test/${index}-t.jpg`,
  ]),
});

const randomOperation = (
  random: Random,
  planPersonIds: readonly string[],
  slots: readonly { teamId: string; positionId: string }[],
  index: number
): OptimismOperation => {
  const planPersonId = pick(random, [...planPersonIds, `pp-new-${index}`]);
  const kind = pick(random, [
    "schedule",
    "reconcile",
    "updateStatus",
    "unschedule",
  ] as const);
  if (kind === "schedule") {
    return {
      kind,
      ...pick(random, [...slots, DEFAULT_SLOT]),
      person: randomOptimisticPerson(random, index),
      planPersonId,
    };
  }
  if (kind === "reconcile") {
    return {
      kind,
      optimisticPlanPersonId: planPersonId,
      planPersonId: pick(random, [planPersonId, `pp-real-${index}`]),
    };
  }
  if (kind === "updateStatus") {
    return {
      kind,
      planPersonId,
      status: pick(random, ["C", "U", "D"] as const),
    };
  }
  return {
    kind,
    planPersonId,
    personId: pick(random, [null, `person-${integer(random, 1, 8)}`, ""]),
  };
};

const optimismInputs = (seed: number, count: number): OptimismInput[] => {
  const random = createRandom(seed);
  return Array.from({ length: count }, (_, index) => {
    const groups = randomGroups(random);
    const planPersonIds = groups.flatMap(({ positions }) =>
      positions.flatMap(({ filledPeople }) =>
        (filledPeople ?? []).map(({ planPersonId }) => planPersonId)
      )
    );
    const slots = groups.flatMap(({ teamId, positions }) =>
      positions.map(({ id }) => ({ teamId, positionId: id }))
    );
    const people = repeat(random, 0, 4, (candidateIndex) => ({
      ...randomPositionCandidate(random, candidateIndex),
      id: `person-${integer(random, 1, 8)}`,
      selectedPlanSlot: chance(random, 0.5)
        ? {
            planPersonId: pick(random, [...planPersonIds, "pp-other"]),
            status: pick(random, ["confirmed", "pending", "declined"] as const),
            declineReason: pick(random, [null, "Busy"]),
          }
        : null,
    }));
    const windowHistory = chance(random, 0.7)
      ? [
          windowCall({
            people: repeat(random, 0, 3, () => ({
              personId: `person-${integer(random, 1, 8)}`,
              rows: repeat(random, 0, 3, () =>
                optimismWindowRow(
                  pick(random, [...planPersonIds, "pp-window"]),
                  pick(random, [OPTIMISM_PLAN, "plan-0"])
                )
              ),
            })),
          }),
        ]
      : null;
    return {
      operation: randomOperation(random, planPersonIds, slots, index),
      candidates: chance(random, 0.85)
        ? positionCandidatesSchema.parse(optimismCandidates(people))
        : null,
      windowHistory,
      teamPositions: chance(random, 0.9) ? groups : null,
    };
  });
};

const optimismSuite = defineParitySuite<OptimismInput, OptimismCaches>({
  name: "scheduling.optimism",
  cases: [...OPTIMISM_SEEDS, ...optimismInputs(2222, 40)],
  run: runOptimism,
});

const constantsSuite = defineParitySuite<
  null,
  { detailsBatchSize: number; detailsBatchConcurrency: number }
>({
  name: "scheduling.constants",
  cases: [null],
  run: () => ({
    detailsBatchSize: PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE,
    detailsBatchConcurrency: CANDIDATE_DETAILS_BATCH_CONCURRENCY,
  }),
});

export const schedulingParitySuites: readonly ParitySuite[] = [
  constantsSuite,
  isDeclinedAssignmentStatusSuite,
  buildFrequencySuite,
  summarizeCandidateHistorySuite,
  scoreSchedulingPreferencesSuite,
  scoreAndNormalizeSuite,
  sortForSelectionSuite,
  localeCompareSuite,
  expandPlanWindowHistorySuite,
  findSelectedSlotAssignmentSuite,
  selectedPlanAssignmentLabelsSuite,
  mergeAssignmentLabelsSuite,
  assemblePositionCandidatesSuite,
  assembleCandidateListSuite,
  candidateListGoldenSuite,
  planCandidateDetailsBatchesSuite,
  needsScheduleHistorySuite,
  windowHistoryAdvancedSuite,
  advancedBlockoutChecksSuite,
  expandWindowHistorySuite,
  collectCandidateDetailsSuite,
  groupRankingReasonsSuite,
  preferenceConflictsSuite,
  partitionForRecommendationStripSuite,
  buildScheduleDaysSuite,
  summarizeCandidateScheduleSuite,
  positionFromLabelSuite,
  otherPlanAssignmentLabelsSuite,
  openSlotCountSuite,
  findFirstPositionSuite,
  findNextOpenPositionSuite,
  planPersonStatusValueSuite,
  collectPlanAssignmentsSuite,
  otherPlanAssignmentsSuite,
  notificationStateSuite,
  collectUnnotifiedPeopleSuite,
  positionNotificationStatesSuite,
  describeSchedulingNotificationSuite,
  optimismSuite,
];

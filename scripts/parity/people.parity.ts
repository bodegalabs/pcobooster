/**
 * Parity suites for the iOS port of the People dashboard and team health:
 * `apps/web/src/lib/people-dashboard.ts`, `apps/web/src/lib/team-health.ts`,
 * `apps/web/src/components/people/calendar.ts`, and
 * `apps/web/src/lib/people-dashboard-person-placeholder.ts`. Swift replays them in
 * `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Logic/People/`.
 *
 * API-shaped inputs (rosters, activities, members, rhythms, month days) are typed with the
 * contract and parsed by its zod schemas, so every case is something the API can send and
 * decodes as the generated Swift models. Seeded generators add hundreds of rhythms and teams
 * around every threshold, and every case from the TypeScript tests is a seed. Names mix
 * scripts, accents (composed and decomposed), case, punctuation, and look-alike spaces,
 * since the Swift port must order them as `localeCompare` does.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

import {
  assemblePeopleDashboard,
  buildMonthDays,
  chunkPersonIds,
  defaultPeopleDashboardScope,
  describeCoverage,
  initialScopeLoadCount,
  MATRIX_DAY_COUNT,
  matchesPeopleQuery,
  matrixPageStart,
  normalizePeopleQuery,
  orderActivityBatches,
  parsePeopleDashboardScope,
  parsePeopleDashboardView,
  PEOPLE_DASHBOARD_BATCH_CONCURRENCY,
  PEOPLE_DASHBOARD_SAMPLE_SIZE,
  PEOPLE_DASHBOARD_TEAM_SCOPE_LIMIT,
  planPeopleDashboardBatches,
  resolveScopePersonIds,
  scopeTeamIds,
  serviceDays,
  teamScope,
  unrequestedMatchIds,
} from "@/lib/people-dashboard";
import type {
  PeopleDashboardCoverage,
  PeopleDashboardData,
  PeopleDashboardDay,
  PeopleDashboardScope,
} from "@/lib/people-dashboard";
import { getCachedPeopleDashboardPersonDetail } from "@/lib/people-dashboard-person-placeholder";
import {
  checkInReasons,
  computeMemberPaces,
  computeTeamHealth,
  computeTeamPace,
  describeDue,
  describePersonSignal,
  DUE_FLOOR_DAYS,
  dueSlot,
  dueThresholdDays,
  heavyThirtyDayLoad,
  isRosterSignal,
  personSignals,
  WAITING_WINDOW_DAYS,
  waitingReply,
} from "@/lib/team-health";
import type { PersonSignal } from "@/lib/team-health";

import { PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE } from "../../packages/contracts/src/people";
import {
  peopleDashboardActivitySchema,
  peopleDashboardDayKindSchema,
  peopleDashboardMonthDaySchema,
  peopleDashboardPersonSchema,
  peopleDashboardRosterSchema,
  servingRhythmSchema,
} from "../../packages/contracts/src/people-schemas";
import type {
  PeopleDashboardActivity,
  PeopleDashboardDayKind,
  PeopleDashboardMonthDay,
  PeopleDashboardPerson,
  PeopleDashboardRoster,
  PeopleDashboardRosterPerson,
  PeopleDashboardTeam,
  ServingRhythm,
} from "../../packages/contracts/src/people-schemas";
import { defineParitySuite } from "./parity";
import type { ParitySuite } from "./parity";

// `components/people/calendar.ts` takes a type from a `.tsx` component, which the root `tsc`
// (no `jsx`) cannot read, so the module is loaded by path and each export parsed here; the
// parsed functions check their arguments and results against the contract on every call.
const statusFunction = z.function({
  input: [peopleDashboardDayKindSchema, z.string().optional()],
  output: z.string(),
});
const monthDayLabelFunction = z.function({
  input: [z.object({ year: z.number(), monthIndex: z.number() }), z.number()],
  output: z.string(),
});

const calendarModuleSchema = z.object({
  buildCalendarCells: z.function({
    input: [z.number(), z.number()],
    output: z.array(z.object({ day: z.number().nullable(), key: z.string() })),
  }),
  commitmentCellTone: statusFunction,
  commitmentDot: statusFunction,
  commitmentStatusLabel: z.function({
    input: [z.string().optional()],
    output: z.string(),
  }),
  engagementLabel: statusFunction,
  formatMonthDay: monthDayLabelFunction,
  formatWeekday: monthDayLabelFunction,
  formatWeekdayMonthDay: monthDayLabelFunction,
  heatLevelTone: z.function({
    input: [z.number(), z.number().optional()],
    output: z.string(),
  }),
  isConfirmedStatus: z.function({
    input: [z.string().optional()],
    output: z.boolean(),
  }),
  pickCalendarMarker: z.function({
    input: [z.array(peopleDashboardMonthDaySchema)],
    output: peopleDashboardMonthDaySchema.nullable(),
  }),
  weekDayNames: z.array(z.string()),
});

const loadedCalendar: unknown = await import(
  pathToFileURL(
    path.join(
      import.meta.dirname,
      "../../apps/web/src/components/people/calendar.ts"
    )
  ).href
);
const {
  buildCalendarCells,
  commitmentCellTone,
  commitmentDot,
  commitmentStatusLabel,
  engagementLabel,
  formatMonthDay,
  formatWeekday,
  formatWeekdayMonthDay,
  heatLevelTone,
  isConfirmedStatus,
  pickCalendarMarker,
  weekDayNames,
} = calendarModuleSchema.parse(loadedCalendar);

// Characters JavaScript and Swift treat differently, built from code points so the source
// stays visible ASCII (the formatter also rewrites escaped dashes into real ones).
const char = (codePoint: number) => String.fromCodePoint(codePoint);
const NBSP = char(0xa0);
const SOFT_HYPHEN = char(0xad);
const ZWJ = char(0x20_0d);
const COMBINING_ACUTE = char(0x3_01);
const COMBINING_DOT = char(0x3_07);
const IDEOGRAPHIC_SPACE = char(0x30_00);
const LIGATURE_FI = char(0xfb_01);
const MIDDLE_DOT = char(0xb7);
const EN_DASH = char(0x20_13);

// Seeded generation

/** Park and Miller's minimal standard generator, so fixtures stay reproducible. */
const createRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
};

type Random = () => number;

const pick = <T>(random: Random, items: readonly T[]): T => {
  const item = items.at(Math.floor(random() * items.length));
  if (item === undefined) {
    throw new Error("Cannot pick from an empty list");
  }
  return item;
};

const intBetween = (random: Random, low: number, high: number) =>
  low + Math.floor(random() * (high - low + 1));

/** Like `pick`, for lists whose entries include `undefined`. */
const pickMaybe = <T>(random: Random, items: readonly T[]): T | undefined =>
  items.at(Math.floor(random() * items.length));

const DAY_MS = 86_400_000;

/** An org day key `delta` calendar days from `dayKey`. */
const shiftDayKey = (dayKey: string, delta: number) =>
  new Date(Date.parse(`${dayKey}T12:00:00Z`) + delta * DAY_MS)
    .toISOString()
    .slice(0, 10);

const TODAY_KEYS: readonly string[] = [
  "2026-09-25",
  "2026-01-01",
  "2026-03-08",
  "2026-11-01",
  "2028-02-29",
  "2026-12-31",
  "2027-06-15",
];

/** Names that sort differently under naive comparisons: case, accents, spaces, scripts. */
const NAMES: readonly string[] = [
  "Ana Lopez",
  "ana lopez",
  "ANA LOPEZ",
  "Ána López",
  `A${COMBINING_ACUTE}na Lo${COMBINING_ACUTE}pez`,
  "Anna Lopez",
  "Ben Ortiz",
  "Zoë Adams",
  "Zoe Adams",
  "zoe adams",
  "O'Brien Kelly",
  "OBrien Kelly",
  "O Brien Kelly",
  "Mary-Jane Fox",
  "Mary Jane Fox",
  "MaryJane Fox",
  `Lee${NBSP}Chan`,
  "Lee Chan",
  "张伟",
  `张${IDEOGRAPHIC_SPACE}伟`,
  "张 伟",
  "王芳",
  "김민준",
  "이서연",
  "Иван Петров",
  "иван петров",
  "Οδυσσέας Σ",
  "Ærø Hansen",
  "Aero Hansen",
  "Łukasz Nowak",
  "Lukasz Nowak",
  "José Díaz",
  "Jose Diaz",
  `Jose${COMBINING_ACUTE} Diaz`,
  "Straße Ute",
  "Strasse Ute",
  "İlker Kaya",
  "Ilker Kaya",
  `${LIGATURE_FI}ona Ray`,
  "fiona Ray",
  "Fiona Ray",
  `Sam${SOFT_HYPHEN}`,
  "Sam",
  "Sam",
  "SAM",
  `S${ZWJ}am`,
  "Ed",
  "Edd",
  "Éd",
  "",
  " ",
  "1st Choir",
  "10th Choir",
  "2nd Choir",
  "#hash",
  "(paren)",
  "🙏 Grace",
  "Grace 🙏",
];

const ROLES: readonly string[] = [
  "Vocals",
  "Keys",
  "Bass",
  "Drums",
  "Electric Guitar",
  "Sound",
  "Lyrics",
  "Camera 1",
  "Worship Leader",
  "ΟΔΥΣΣΕΥΣ",
];

const TEAM_NAMES: readonly string[] = [
  "Band",
  "Vocals",
  "Tech",
  "Production",
  "Greeters",
  "Kids",
  "ΧΟΡΩΔΊΑ",
  "Équipe",
];

const SERVICE_TYPES: readonly (string | null)[] = [
  "Sunday",
  "sunday",
  "Saturday Night",
  "Youth",
  "Évènements",
  "",
  null,
  "Other teams",
  "Zion",
  "alpha",
];

const GAPS: readonly (number | null)[] = [
  null,
  null,
  0,
  1,
  3.5,
  7,
  7,
  10.5,
  14,
  14,
  21,
  27.5,
  28,
  29,
  30,
  35,
  41.9,
  42,
  56,
  90,
];

const TEAM_PACES: readonly (number | null)[] = [
  null,
  1,
  2.5,
  3,
  4,
  4.5,
  6,
  7,
  9,
  12,
  13.5,
  20,
];

const rhythmOf = (random: Random, todayKey: string): ServingRhythm => {
  const servedDays30 = intBetween(random, 0, 8);
  const servedDays90 =
    Math.max(servedDays30, intBetween(random, 0, 20)) +
    (random() < 0.04 ? 0.5 : 0);
  const requests180 = intBetween(random, 0, 30);
  const pendingUpcoming = random() < 0.4 ? intBetween(random, 1, 5) : 0;
  const hasPending = pendingUpcoming > 0 || random() < 0.05;
  return servingRhythmSchema.parse({
    lastServedOn:
      random() < 0.15
        ? null
        : shiftDayKey(todayKey, -intBetween(random, -3, 200)),
    nextServingOn:
      random() < 0.5 ? null : shiftDayKey(todayKey, intBetween(random, 0, 60)),
    servedDays30,
    servedDays90,
    servedDays180: Math.max(servedDays90, intBetween(random, 0, 40)),
    upcomingDays30: intBetween(random, 0, 8),
    typicalGapDays: pick(random, GAPS),
    requests180,
    declined180:
      random() < 0.35
        ? intBetween(random, 0, Math.max(requests180, 3))
        : intBetween(random, 0, 1),
    pendingUpcoming,
    nextPendingOn:
      hasPending && random() < 0.92
        ? shiftDayKey(todayKey, intBetween(random, -3, 20))
        : null,
  });
};

const memberOf = (
  random: Random,
  id: string,
  todayKey: string
): PeopleDashboardPerson =>
  peopleDashboardPersonSchema.parse({
    id,
    name: pick(random, NAMES),
    initials: "",
    photoThumbnailUrl: null,
    teams: random() < 0.15 ? [] : [pick(random, TEAM_NAMES)],
    rhythm: rhythmOf(random, todayKey),
    roles: random() < 0.3 ? [] : [pick(random, ROLES)],
    monthDays: [],
  });

const teamsOf = (
  random: Random,
  personIds: readonly string[]
): PeopleDashboardTeam[] =>
  Array.from({ length: intBetween(random, 0, 4) }, (_, index) => ({
    id: `team-${index}`,
    name: pick(random, TEAM_NAMES),
    serviceTypeName: pick(random, SERVICE_TYPES),
    personIds: [
      ...personIds.filter(() => random() < 0.6),
      ...(random() < 0.2 ? ["missing-person"] : []),
      ...(random() < 0.1 && personIds[0] !== undefined ? [personIds[0]] : []),
    ],
  }));

// The TypeScript tests' builders

const testRoster = (
  count: number,
  ledTeamIds: string[] = []
): PeopleDashboardRoster => ({
  generatedAt: "2026-05-23T12:00:00.000Z",
  month: {
    year: 2026,
    monthIndex: 4,
    label: "May 2026",
    daysInMonth: 31,
    startsOnWeekday: 5,
  },
  people: Array.from({ length: count }, (_, index) => ({
    id: `person-${index}`,
    name: `Person ${index}`,
    initials: "P",
    photoThumbnailUrl: null,
    teams: index % 2 === 0 ? ["Vocals", "Band"] : ["Band"],
  })),
  teams: [
    {
      id: "band",
      name: "Band",
      serviceTypeName: "Sunday",
      personIds: Array.from({ length: count }, (_, index) => `person-${index}`),
    },
    {
      id: "vocals",
      name: "Vocals",
      serviceTypeName: "Sunday",
      personIds: Array.from({ length: count }, (_, index) => index)
        .filter((index) => index % 2 === 0)
        .map((index) => `person-${index}`),
    },
  ],
  ledTeamIds,
});

const testActivity = (
  id: string,
  overrides: Partial<PeopleDashboardActivity> = {}
): PeopleDashboardActivity => ({
  id,
  rhythm: {
    lastServedOn: "2026-05-10",
    nextServingOn: "2026-05-31",
    servedDays30: 1,
    servedDays90: 2,
    servedDays180: 4,
    upcomingDays30: 1,
    typicalGapDays: 21,
    requests180: 4,
    declined180: 0,
    pendingUpcoming: 0,
    nextPendingOn: null,
  },
  roles: ["Keys"],
  monthDays: [{ day: 31, kind: "service", status: "C" }],
  ...overrides,
});

const TEST_TODAY = "2026-09-25";

const testRhythm = (overrides: Partial<ServingRhythm> = {}): ServingRhythm => ({
  lastServedOn: "2026-09-20",
  nextServingOn: "2026-10-11",
  servedDays30: 1,
  servedDays90: 4,
  servedDays180: 8,
  upcomingDays30: 1,
  typicalGapDays: 21,
  requests180: 9,
  declined180: 0,
  pendingUpcoming: 0,
  nextPendingOn: null,
  ...overrides,
});

const testMember = (
  name: string,
  overrides: Partial<ServingRhythm> = {}
): PeopleDashboardPerson => ({
  id: name.toLowerCase(),
  name,
  initials: name.slice(0, 2).toUpperCase(),
  photoThumbnailUrl: null,
  teams: ["Band"],
  roles: ["Vocals"],
  monthDays: [],
  rhythm: testRhythm(overrides),
});

const NOT_SERVING = {
  lastServedOn: null,
  nextServingOn: null,
  servedDays30: 0,
  servedDays90: 0,
  servedDays180: 0,
  upcomingDays30: 0,
  typicalGapDays: null,
  requests180: 0,
} satisfies Partial<ServingRhythm>;

/** A team of the test members, whole: the shape `computeTeamHealth` reads. */
const teamOf = (
  members: readonly PeopleDashboardPerson[],
  id = "team"
): PeopleDashboardTeam => ({
  id,
  name: "Band",
  serviceTypeName: null,
  personIds: members.map((member) => member.id),
});

// Constants

interface PeopleConstants {
  sampleSize: number;
  teamScopeLimit: number;
  batchConcurrency: number;
  activityBatchSize: number;
  matrixDayCount: number;
  dueFloorDays: number;
  waitingWindowDays: number;
  weekDayNames: string[];
}

const constantsSuite = defineParitySuite<null, PeopleConstants>({
  name: "people.constants",
  cases: [null],
  run: () => ({
    sampleSize: PEOPLE_DASHBOARD_SAMPLE_SIZE,
    teamScopeLimit: PEOPLE_DASHBOARD_TEAM_SCOPE_LIMIT,
    batchConcurrency: PEOPLE_DASHBOARD_BATCH_CONCURRENCY,
    activityBatchSize: PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE,
    matrixDayCount: MATRIX_DAY_COUNT,
    dueFloorDays: DUE_FLOOR_DAYS,
    waitingWindowDays: WAITING_WINDOW_DAYS,
    weekDayNames,
  }),
});

// Scopes

const SCOPE_VALUES: readonly (string | undefined)[] = [
  "mine",
  "all",
  "team:42",
  "team:band",
  "team:",
  "team",
  "team:team:1",
  "team: spaced",
  "team:🙏",
  `team:${COMBINING_ACUTE}x`,
  "Team:1",
  "MINE",
  " mine",
  "mine ",
  "All",
  "elsewhere",
  "",
  undefined,
];

const scopeParseSuite = defineParitySuite<
  { value?: string },
  PeopleDashboardScope | null
>({
  name: "people.scope.parse",
  cases: SCOPE_VALUES.map((value) => (value === undefined ? {} : { value })),
  run: ({ value }) => parsePeopleDashboardScope(value),
});

const scopeTeamSuite = defineParitySuite<
  string,
  { scope: string; parsed: string | null }
>({
  name: "people.scope.teamScope",
  cases: ["42", "band", "", "team:x", " ", "🙏", `${COMBINING_ACUTE}a`],
  run: (teamId) => {
    const scope = teamScope(teamId);
    return { scope, parsed: parsePeopleDashboardScope(scope) };
  },
});

const scopeViewSuite = defineParitySuite<{ value?: string }, string>({
  name: "people.scope.view",
  cases: [
    { value: "month" },
    { value: "health" },
    { value: "calendar" },
    { value: "Month" },
    { value: " month" },
    { value: "" },
    {},
  ],
  run: ({ value }) => parsePeopleDashboardView(value),
});

const generatedRosters = (): PeopleDashboardRoster[] => {
  const random = createRandom(5101);
  return Array.from({ length: 24 }, (_, rosterIndex) => {
    const people: PeopleDashboardRosterPerson[] = Array.from(
      { length: intBetween(random, 0, 12) },
      (_unused, index) => ({
        id: `p${rosterIndex}-${index}`,
        name: pick(random, NAMES),
        initials: "",
        photoThumbnailUrl: random() < 0.5 ? null : "https://example.com/p.jpg",
        teams: random() < 0.2 ? [] : [pick(random, TEAM_NAMES)],
      })
    );
    const teams = teamsOf(
      random,
      people.map(({ id }) => id)
    );
    const ledTeamIds = [
      ...teams.filter(() => random() < 0.4).map(({ id }) => id),
      ...(random() < 0.1 ? ["gone"] : []),
    ];
    return peopleDashboardRosterSchema.parse({
      generatedAt: "2026-05-23T12:00:00.000Z",
      month: {
        year: 2026,
        monthIndex: 4,
        label: "May 2026",
        daysInMonth: 31,
        startsOnWeekday: 5,
      },
      people,
      teams,
      ledTeamIds,
    });
  });
};

const ROSTERS: readonly PeopleDashboardRoster[] = [
  testRoster(2, ["vocals"]),
  testRoster(2),
  testRoster(5, ["vocals"]),
  testRoster(0),
  ...generatedRosters(),
];

const scopesFor = (roster: PeopleDashboardRoster): PeopleDashboardScope[] => [
  "mine",
  "all",
  ...roster.teams.map(({ id }) => teamScope(id)),
  teamScope("gone"),
];

const scopeDefaultSuite = defineParitySuite<
  PeopleDashboardRoster,
  PeopleDashboardScope
>({
  name: "people.scope.default",
  cases: ROSTERS,
  run: defaultPeopleDashboardScope,
});

const scopeTeamIdsSuite = defineParitySuite<
  { scope: PeopleDashboardScope; ledTeamIds: string[] },
  readonly string[] | null
>({
  name: "people.scope.teamIds",
  cases: [
    { scope: "all", ledTeamIds: ["a"] },
    { scope: "mine", ledTeamIds: [] },
    { scope: "mine", ledTeamIds: ["a", "b", "a"] },
    { scope: "team:x", ledTeamIds: ["a"] },
    { scope: "team:team:x", ledTeamIds: [] },
  ],
  run: ({ scope, ledTeamIds }) => scopeTeamIds(scope, ledTeamIds),
});

/** Each roster once, with every scope it can take; the output follows `scopes`. */
const resolveScopeSuite = defineParitySuite<
  { roster: PeopleDashboardRoster; scopes: PeopleDashboardScope[] },
  string[][]
>({
  name: "people.scope.resolveScopePersonIds",
  cases: ROSTERS.map((roster) => ({ roster, scopes: scopesFor(roster) })),
  run: ({ roster, scopes }) =>
    scopes.map((scope) => resolveScopePersonIds(roster, scope)),
});

const initialLoadSuite = defineParitySuite<
  { scope: PeopleDashboardScope; scopePeopleCount: number },
  number
>({
  name: "people.scope.initialScopeLoadCount",
  cases: (["mine", "all", "team:band"] as const).flatMap((scope) =>
    [0, 1, 47, 48, 49, 70, 159, 160, 161, 500].map((scopePeopleCount) => ({
      scope,
      scopePeopleCount,
    }))
  ),
  run: ({ scope, scopePeopleCount }) =>
    initialScopeLoadCount(scope, scopePeopleCount),
});

// Batches

const ids = (count: number, prefix = "p") =>
  Array.from({ length: count }, (_, index) => `${prefix}${index}`);

const chunkSuite = defineParitySuite<
  { personIds: string[]; batchSize: number },
  string[][]
>({
  name: "people.batches.chunkPersonIds",
  cases: [0, 1, 15, 16, 17, 33, 48].flatMap((count) =>
    [1, 3, 16, 100].map((batchSize) => ({ personIds: ids(count), batchSize }))
  ),
  run: ({ personIds, batchSize }) => chunkPersonIds(personIds, batchSize),
});

const planBatchesSuite = defineParitySuite<
  { personIds: string[]; targetPeopleCount: number; batchSize: number },
  string[][]
>({
  name: "people.batches.planPeopleDashboardBatches",
  cases: [
    {
      personIds: ["a", "b", "c", "d", "e"],
      targetPeopleCount: 4,
      batchSize: 3,
    },
    { personIds: [], targetPeopleCount: 4, batchSize: 3 },
    ...[0, 10, 48, 70, 200].flatMap((count) =>
      [-3, 0, 1, 16, 17, 48, 96, 300].map((targetPeopleCount) => ({
        personIds: ids(count),
        targetPeopleCount,
        batchSize: PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE,
      }))
    ),
  ],
  run: ({ personIds, targetPeopleCount, batchSize }) =>
    planPeopleDashboardBatches(personIds, targetPeopleCount, batchSize),
});

interface OrderInput {
  sample: string[][];
  search: string[][];
  /** A batch has started when its first person is listed here. */
  started: string[];
}

const orderSuite = defineParitySuite<OrderInput, string[][]>({
  name: "people.batches.orderActivityBatches",
  cases: [
    { sample: [["a"], ["b"], ["c"]], search: [["s"]], started: ["a"] },
    { sample: [], search: [], started: [] },
    { sample: [["a"], ["b"]], search: [], started: ["b"] },
    { sample: [["a", "x"], ["b"], ["c"]], search: [["s"], ["t"]], started: [] },
    {
      sample: [["a"], ["b"], ["c"], ["d"]],
      search: [["s"]],
      started: ["a", "c", "d"],
    },
    { sample: [[], ["b"]], search: [["s"]], started: [""] },
  ],
  run: ({ sample, search, started }) =>
    orderActivityBatches(sample, search, ([first]) =>
      started.includes(first ?? "")
    ),
});

// Search

const QUERIES: readonly string[] = [
  "",
  "  VOCALS ",
  "vocals",
  "bass",
  "BASS",
  "ana",
  "ána",
  "lopez",
  `a${COMBINING_ACUTE}`,
  "a",
  "e",
  "zoe",
  "zoë",
  "o'brien",
  "lee chan",
  `lee${NBSP}chan`,
  "οδυσσευς",
  "οδυσσευσ",
  "οδυσσέας σ",
  "ς",
  "σ",
  `i${COMBINING_DOT}lker`,
  "ilker",
  "straße",
  "strasse",
  "fi",
  LIGATURE_FI,
  "band vocals",
  "kids",
  "张",
  "민준",
  "иван",
  "🙏",
  " ",
  "\t",
  `x${EN_DASH}y`,
  "sam",
];

const normalizeSuite = defineParitySuite<string, string>({
  name: "people.search.normalizePeopleQuery",
  cases: [
    ...QUERIES,
    "ΟΔΥΣΣΕΥΣ",
    "ΑΣ'Β",
    "ΣΑΣ ΚΑΙ",
    "İSTANBUL",
    `${NBSP}Keys${IDEOGRAPHIC_SPACE}`,
    "ǅ",
    "ẞ",
  ],
  run: normalizePeopleQuery,
});

interface SearchRow {
  person: PeopleDashboardRosterPerson;
  member: PeopleDashboardPerson | null;
}

const searchRows = (): SearchRow[] => {
  const random = createRandom(7331);
  const rows: SearchRow[] = NAMES.map((name, index) => {
    const person: PeopleDashboardRosterPerson = {
      id: `s${index}`,
      name,
      initials: "",
      photoThumbnailUrl: null,
      teams: [pick(random, TEAM_NAMES), pick(random, TEAM_NAMES)].slice(
        0,
        intBetween(random, 0, 2)
      ),
    };
    const loaded = random() < 0.6;
    return {
      person,
      member: loaded
        ? peopleDashboardPersonSchema.parse({
            ...person,
            ...testActivity(person.id, {
              roles: [pick(random, ROLES), pick(random, ROLES)].slice(
                0,
                intBetween(random, 0, 2)
              ),
            }),
            id: person.id,
          })
        : null,
    };
  });
  return [
    ...rows,
    {
      person: {
        id: "greek",
        name: "ΟΔΥΣΣΕΥΣ",
        initials: "",
        photoThumbnailUrl: null,
        teams: ["ΧΟΡΩΔΊΑ"],
      },
      member: null,
    },
  ];
};

const SEARCH_ROWS = searchRows();

const matchesSuite = defineParitySuite<
  { row: SearchRow; queries: readonly string[] },
  boolean[]
>({
  name: "people.search.matchesPeopleQuery",
  cases: SEARCH_ROWS.map((row) => ({
    row,
    queries: [...new Set([...QUERIES, ...QUERIES.map(normalizePeopleQuery)])],
  })),
  run: ({ row, queries }) =>
    queries.map((query) => matchesPeopleQuery(row, query)),
});

const testSearchDashboard = assemblePeopleDashboard(
  testRoster(5),
  [testActivity("person-0", { roles: ["Bass"] })],
  {
    scopePersonIds: testRoster(5).people.map(({ id }) => id),
    samplePeopleCount: 1,
    loadingPersonIds: new Set(["person-1"]),
  }
);

const searchRowsOf = (dashboard: PeopleDashboardData): SearchRow[] =>
  dashboard.scopeRows.map(({ person, member }) => ({ person, member }));

interface UnrequestedQuery {
  query: string;
  requestedIds: string[];
}

/** Each row list once, with the searches run over it; the output follows `searches`. */
const unrequestedSuite = defineParitySuite<
  { rows: SearchRow[]; searches: UnrequestedQuery[] },
  string[][]
>({
  name: "people.search.unrequestedMatchIds",
  cases: [
    {
      rows: searchRowsOf(testSearchDashboard),
      searches: [
        { query: "band", requestedIds: ["person-1"] },
        { query: "", requestedIds: [] },
      ],
    },
    {
      rows: SEARCH_ROWS,
      searches: [
        "a",
        "band",
        "vocals",
        "keys",
        "ana",
        "οδυσσευς",
        "zz",
        "",
      ].flatMap((query) =>
        [[], ["s0", "s2", "s4", "s9"]].map((requestedIds) => ({
          query,
          requestedIds,
        }))
      ),
    },
  ],
  run: ({ rows, searches }) =>
    searches.map(({ query, requestedIds }) =>
      unrequestedMatchIds(
        rows.map((row) => ({ ...row, loading: false })),
        query,
        new Set(requestedIds)
      )
    ),
});

// Assembly

interface AssembleInput {
  roster: PeopleDashboardRoster;
  activities: PeopleDashboardActivity[];
  scopePersonIds: string[];
  samplePeopleCount: number;
  loadingPersonIds: string[];
}

const assemble = ({
  roster,
  activities,
  scopePersonIds,
  samplePeopleCount,
  loadingPersonIds,
}: AssembleInput) =>
  assemblePeopleDashboard(roster, activities, {
    scopePersonIds,
    samplePeopleCount,
    loadingPersonIds: new Set(loadingPersonIds),
  });

const generatedAssembleInputs = (): AssembleInput[] => {
  const random = createRandom(9973);
  return generatedRosters()
    .slice(0, 16)
    .map((roster) => {
      const personIds = roster.people.map(({ id }) => id);
      const scope = pick(random, scopesFor(roster));
      const scopePersonIds = [
        ...resolveScopePersonIds(roster, scope),
        ...(random() < 0.2 ? ["not-on-roster"] : []),
      ];
      const activities = personIds
        .filter(() => random() < 0.6)
        .map((id) =>
          peopleDashboardActivitySchema.parse({
            id,
            rhythm: rhythmOf(random, "2026-05-23"),
            roles: random() < 0.5 ? [] : [pick(random, ROLES)],
            monthDays:
              random() < 0.5
                ? []
                : [
                    {
                      day: intBetween(random, 1, 31),
                      kind: "service",
                      status: "C",
                    },
                  ],
          })
        );
      return {
        roster,
        activities: [
          ...activities,
          ...(random() < 0.3 ? [testActivity("elsewhere")] : []),
        ],
        scopePersonIds,
        samplePeopleCount: pick(random, [-1, 0, 1, 3, 48, 500]),
        loadingPersonIds: personIds.filter(() => random() < 0.4),
      };
    });
};

const ASSEMBLE_INPUTS: readonly AssembleInput[] = [
  {
    roster: testRoster(3, ["band"]),
    activities: [],
    scopePersonIds: ["person-0", "person-1", "person-2"],
    samplePeopleCount: 3,
    loadingPersonIds: ["person-0", "person-1", "person-2"],
  },
  {
    roster: testRoster(4),
    activities: [
      testActivity("person-2", { roles: ["Drums"] }),
      testActivity("person-0"),
      testActivity("person-3"),
    ],
    scopePersonIds: ["person-0", "person-1", "person-2"],
    samplePeopleCount: 3,
    loadingPersonIds: ["person-1"],
  },
  {
    roster: testRoster(6),
    activities: [
      testActivity("person-0"),
      testActivity("person-1"),
      testActivity("person-5"),
    ],
    scopePersonIds: testRoster(6).people.map(({ id }) => id),
    samplePeopleCount: 2,
    loadingPersonIds: [],
  },
  // The same person twice in the activities and the scope: the last activity wins.
  {
    roster: testRoster(3),
    activities: [
      testActivity("person-1", { roles: ["First"] }),
      testActivity("person-1", { roles: ["Second"] }),
    ],
    scopePersonIds: ["person-1", "person-1", "person-2"],
    samplePeopleCount: 2,
    loadingPersonIds: ["person-1", "person-2"],
  },
  ...generatedAssembleInputs(),
];

const assembleSuite = defineParitySuite<AssembleInput, PeopleDashboardData>({
  name: "people.assemblePeopleDashboard",
  cases: ASSEMBLE_INPUTS,
  run: assemble,
});

const coverageSuite = defineParitySuite<
  { coverage: PeopleDashboardCoverage; isLoading: boolean },
  string | null
>({
  name: "people.describeCoverage",
  cases: [
    [16, 40, 40],
    [40, 40, 40],
    [48, 48, 230],
    [32, 48, 230],
    [0, 0, 0],
    [0, 0, 1],
    [0, 1, 1],
    [1, 1, 2],
    [1, 2, 2],
    [2, 2, 1],
    [47, 48, 48],
  ].flatMap(
    ([loadedPeopleCount = 0, samplePeopleCount = 0, scopePeopleCount = 0]) =>
      [true, false].map((isLoading) => ({
        coverage: { loadedPeopleCount, samplePeopleCount, scopePeopleCount },
        isLoading,
      }))
  ),
  run: ({ coverage, isLoading }) => describeCoverage(coverage, isLoading),
});

// Month days

const DAY_KINDS: readonly PeopleDashboardDayKind[] = ["service", "rehearsal"];
const STATUSES: readonly (string | undefined)[] = [
  "C",
  "U",
  "D",
  "confirmed",
  " Confirmed ",
  undefined,
  "",
];

const monthDayOf = (random: Random): PeopleDashboardMonthDay =>
  peopleDashboardMonthDaySchema.parse({
    day:
      random() < 0.03 ? pick(random, [0, 32, 4.5]) : intBetween(random, 1, 31),
    kind: pick(random, DAY_KINDS),
    positionName: random() < 0.3 ? undefined : pick(random, ROLES),
    serviceTypeName: random() < 0.4 ? undefined : pick(random, ["Sunday", ""]),
    status: pickMaybe(random, STATUSES),
    planUrl: random() < 0.5 ? undefined : "/services/1/plans/2/assign?teamId=3",
  });

const monthDayLists = (): { monthDays: PeopleDashboardMonthDay[] }[][] => {
  const random = createRandom(4243);
  return Array.from({ length: 12 }, () =>
    Array.from({ length: intBetween(random, 0, 9) }, () => ({
      monthDays: Array.from({ length: intBetween(random, 0, 6) }, () =>
        monthDayOf(random)
      ),
    }))
  );
};

const MONTH_DAY_INPUTS: readonly { monthDays: PeopleDashboardMonthDay[] }[][] =
  [
    [
      {
        monthDays: [
          { day: 3, kind: "rehearsal" },
          { day: 4, kind: "service", status: "U" },
        ],
      },
      {
        monthDays: [
          { day: 4, kind: "service", status: "C" },
          { day: 11, kind: "service", status: "C" },
          { day: 11, kind: "service", status: "C", positionName: "Keys" },
        ],
      },
    ],
    [],
    ...monthDayLists(),
  ];

const buildMonthDaysSuite = defineParitySuite<
  { monthDays: PeopleDashboardMonthDay[] }[],
  PeopleDashboardDay[]
>({
  name: "people.buildMonthDays",
  cases: MONTH_DAY_INPUTS,
  run: buildMonthDays,
});

const serviceDaysSuite = defineParitySuite<PeopleDashboardDay[], number[]>({
  name: "people.serviceDays",
  cases: MONTH_DAY_INPUTS.slice(0, 8).map((input) => buildMonthDays(input)),
  run: serviceDays,
});

const MATRIX_DAYS: readonly number[][] = [
  [1, 5, 8, 12, 15, 19, 22, 26, 29],
  [],
  [7],
  [3, 10, 17, 24, 31],
  [1, 2, 3, 4, 5, 6],
  [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
];

const matrixSuite = defineParitySuite<
  { days: number[]; selectedDay: number },
  number
>({
  name: "people.matrixPageStart",
  cases: MATRIX_DAYS.flatMap((days) =>
    [0, 1, 3, 5, 15, 19, 20, 25, 29, 31, 40].map((selectedDay) => ({
      days,
      selectedDay,
    }))
  ),
  run: ({ days, selectedDay }) => matrixPageStart(days, selectedDay),
});

// Team health

const dueThresholdSuite = defineParitySuite<number | null, number>({
  name: "people.teamHealth.dueThresholdDays",
  cases: [null, 0, 7, 27.9, 28, 28.3, 29, 41.9, 42, 42.3, 60, 0.5, 180],
  run: dueThresholdDays,
});

const heavyLoadSuite = defineParitySuite<number | null, number>({
  name: "people.teamHealth.heavyThirtyDayLoad",
  cases: [null, 0, 1, 2.5, 3, 4.5, 6, 6.1, 7, 7.5, 9, 9.1, 12, 20, 100],
  run: heavyThirtyDayLoad,
});

interface RhythmInput {
  rhythm: ServingRhythm;
  todayKey: string;
  teamPace: number | null;
}

const RHYTHM_SEEDS: readonly RhythmInput[] = [
  { rhythm: testRhythm(), teamPace: 4 },
  {
    rhythm: testRhythm({
      lastServedOn: "2026-08-02",
      nextServingOn: null,
      typicalGapDays: 28,
      servedDays180: 5,
    }),
    teamPace: null,
  },
  {
    rhythm: testRhythm({
      lastServedOn: "2026-07-25",
      nextServingOn: null,
      typicalGapDays: 28,
      servedDays180: 5,
    }),
    teamPace: null,
  },
  {
    rhythm: testRhythm({ lastServedOn: "2026-05-03", servedDays180: 5 }),
    teamPace: null,
  },
  {
    rhythm: testRhythm({ pendingUpcoming: 4, nextPendingOn: "2026-09-27" }),
    teamPace: null,
  },
  { rhythm: testRhythm(NOT_SERVING), teamPace: null },
  {
    rhythm: testRhythm({ declined180: 1, requests180: 2 }),
    teamPace: null,
  },
  {
    rhythm: testRhythm({ declined180: 3, requests180: 6 }),
    teamPace: null,
  },
  { rhythm: testRhythm({ servedDays30: 5 }), teamPace: 12 },
  { rhythm: testRhythm({ servedDays30: 5 }), teamPace: null },
  { rhythm: testRhythm({ servedDays30: 6 }), teamPace: null },
  { rhythm: testRhythm({ servedDays30: 4 }), teamPace: 3 },
  { rhythm: testRhythm({ servedDays90: 9 }), teamPace: 4 },
  { rhythm: testRhythm({ servedDays90: 9 }), teamPace: 5 },
  {
    rhythm: testRhythm({ pendingUpcoming: 1, nextPendingOn: "2026-09-25" }),
    teamPace: null,
  },
  {
    rhythm: testRhythm({ pendingUpcoming: 3, nextPendingOn: "2026-10-02" }),
    teamPace: null,
  },
  {
    rhythm: testRhythm({ pendingUpcoming: 5, nextPendingOn: "2026-10-03" }),
    teamPace: null,
  },
  {
    rhythm: testRhythm({
      lastServedOn: "2026-06-28",
      nextServingOn: null,
      typicalGapDays: 14,
      servedDays180: 6,
      declined180: 2,
      requests180: 4,
      pendingUpcoming: 1,
      nextPendingOn: "2026-09-27",
    }),
    teamPace: null,
  },
  // Thresholds to the day: due at 42, drifting at 56, waiting a week out.
  ...[41, 42, 55, 56, 57].map((daysAgo) => ({
    rhythm: testRhythm({
      lastServedOn: shiftDayKey(TEST_TODAY, -daysAgo),
      nextServingOn: null,
      typicalGapDays: null,
      servedDays180: 3,
    }),
    teamPace: null,
  })),
  ...[6, 7, 8].map((daysAhead) => ({
    rhythm: testRhythm({
      pendingUpcoming: 1,
      nextPendingOn: shiftDayKey(TEST_TODAY, daysAhead),
    }),
    teamPace: null,
  })),
  // A pending count without a day, and a day without a count.
  {
    rhythm: testRhythm({ pendingUpcoming: 2, nextPendingOn: null }),
    teamPace: null,
  },
  {
    rhythm: testRhythm({ pendingUpcoming: 0, nextPendingOn: "2026-09-26" }),
    teamPace: null,
  },
  // A day key past its month's end, which `Date.UTC` rolls into the next month.
  {
    rhythm: testRhythm({
      lastServedOn: "2026-02-30",
      nextServingOn: null,
      servedDays180: 4,
    }),
    teamPace: 2.5,
  },
].map((seed) => ({ ...seed, todayKey: TEST_TODAY }));

const generatedRhythms = (): RhythmInput[] => {
  const random = createRandom(31_337);
  return Array.from({ length: 300 }, () => {
    const todayKey = pick(random, TODAY_KEYS);
    return {
      rhythm: rhythmOf(random, todayKey),
      todayKey,
      teamPace: pick(random, TEAM_PACES),
    };
  });
};

const RHYTHM_INPUTS: readonly RhythmInput[] = [
  ...RHYTHM_SEEDS,
  ...generatedRhythms(),
];

const rhythmSignalsSuite = defineParitySuite<
  RhythmInput,
  {
    waitingReply: ReturnType<typeof waitingReply>;
    checkInReasons: ReturnType<typeof checkInReasons>;
    dueSlot: ReturnType<typeof dueSlot>;
    personSignals: PersonSignal[];
  }
>({
  name: "people.teamHealth.rhythmSignals",
  cases: RHYTHM_INPUTS,
  run: ({ rhythm, todayKey, teamPace }) => ({
    waitingReply: waitingReply(rhythm, todayKey),
    checkInReasons: checkInReasons(rhythm, todayKey, teamPace),
    dueSlot: dueSlot(rhythm, todayKey),
    personSignals: personSignals(rhythm, todayKey, teamPace),
  }),
});

interface HealthInput {
  members: PeopleDashboardPerson[];
  teams: PeopleDashboardTeam[];
  todayKey: string;
}

const healthSeed = (
  members: PeopleDashboardPerson[],
  teams: PeopleDashboardTeam[] = [teamOf(members)]
): HealthInput => ({ members, teams, todayKey: TEST_TODAY });

const HEALTH_SEEDS: readonly HealthInput[] = [
  healthSeed([
    testMember("Scheduled"),
    testMember("Recent", { lastServedOn: "2026-09-06", nextServingOn: null }),
    testMember("Weekly", {
      lastServedOn: "2026-08-02",
      nextServingOn: null,
      typicalGapDays: 7,
    }),
    testMember("Monthly", {
      lastServedOn: "2026-08-09",
      nextServingOn: null,
      typicalGapDays: 30,
    }),
    testMember("Never", NOT_SERVING),
  ]),
  healthSeed([
    testMember("Later", { pendingUpcoming: 1, nextPendingOn: "2026-10-01" }),
    testMember("Soon", { pendingUpcoming: 2, nextPendingOn: "2026-09-26" }),
    testMember("Far", { pendingUpcoming: 3, nextPendingOn: "2026-11-01" }),
  ]),
  healthSeed([
    testMember("Ana", { servedDays90: 12, servedDays30: 3 }),
    testMember("Ben", { servedDays90: 1, servedDays30: 0 }),
    testMember("Cam", { servedDays90: 1, servedDays30: 0 }),
    testMember("Dee", { servedDays90: 1, servedDays30: 0 }),
    testMember("Eve", { servedDays90: 1, servedDays30: 0 }),
  ]),
  healthSeed([
    testMember("Ana"),
    testMember("Ben", { servedDays90: 0, servedDays30: 0 }),
    testMember("Cam", { servedDays90: 0, servedDays30: 0 }),
  ]),
  // computeMemberPaces' test: each person judged by the busiest of their teams.
  (() => {
    const weekly = ["Ana", "Ben", "Cam"].map((name) =>
      testMember(name, { servedDays90: 12 })
    );
    const monthly = ["Dee", "Eve", "Fay"].map((name) =>
      testMember(name, { servedDays90: 3 })
    );
    const both = testMember("Gus", { servedDays90: 9 });
    return healthSeed(
      [...weekly, ...monthly, both],
      [
        teamOf([...weekly, both], "weekly"),
        teamOf([...monthly, both], "monthly"),
        { ...teamOf([], "small"), personIds: ["ana", "missing"] },
      ]
    );
  })(),
  healthSeed([]),
  // Same names in different case and accents: ties keep member order.
  healthSeed(
    ["Sam", "sam", "SAM", "Sam", "Sám", `Sa${COMBINING_ACUTE}m`].map(
      (name, index) => ({
        ...testMember(name, NOT_SERVING),
        id: `sam-${index}`,
      })
    )
  ),
  // One person listed twice: the dashboard keeps their last signals for both rows.
  healthSeed([
    { ...testMember("Twin", { servedDays30: 6 }), id: "twin" },
    { ...testMember("Twin", NOT_SERVING), id: "twin" },
    testMember("Other"),
  ]),
];

const withServing = (
  member: PeopleDashboardPerson,
  servedDays90: number
): PeopleDashboardPerson => ({
  ...member,
  rhythm: { ...member.rhythm, servedDays90 },
});

/** Every fourth team mostly idle, and every fourth carried by one person: thin and stretched. */
const varyServing = (
  random: Random,
  members: PeopleDashboardPerson[],
  caseIndex: number
): PeopleDashboardPerson[] => {
  if (caseIndex % 4 === 1) {
    return members.map((member) =>
      random() < 0.6 ? withServing(member, 0) : member
    );
  }
  if (caseIndex % 4 === 2) {
    return members.map((member, index) =>
      withServing(
        member,
        index === 0 ? intBetween(random, 8, 20) : intBetween(random, 0, 1)
      )
    );
  }
  return members;
};

const generatedHealthInputs = (): HealthInput[] => {
  const random = createRandom(65_537);
  return Array.from({ length: 64 }, (_, caseIndex) => {
    const todayKey = pick(random, TODAY_KEYS);
    const count = pick(random, [1, 2, 3, 4, 5, 6, 8, 10, 15, 20]);
    const members = varyServing(
      random,
      Array.from({ length: count }, (_unused, index) =>
        memberOf(random, `m${caseIndex}-${index}`, todayKey)
      ),
      caseIndex
    );
    return {
      members,
      teams: teamsOf(
        random,
        members.map(({ id }) => id)
      ),
      todayKey,
    };
  });
};

const healthView = ({ members, teams, todayKey }: HealthInput) => {
  const health = computeTeamHealth(members, teams, todayKey);
  return {
    memberCount: health.memberCount,
    activeCount: health.activeCount,
    scheduledAheadCount: health.scheduledAheadCount,
    declined: health.declined,
    requests: health.requests,
    pendingCount: health.pendingCount,
    topCount: health.topCount,
    topShare: health.topShare,
    teamPace: health.teamPace,
    status: health.status,
    waitingOnReply: health.waitingOnReply.map(
      ({ member, nextPendingOn, pending }) => ({
        memberId: member.id,
        nextPendingOn,
        pending,
      })
    ),
    checkIns: health.checkIns.map(({ member, reasons }) => ({
      memberId: member.id,
      reasons,
    })),
    dueForSlot: health.dueForSlot.map(
      ({ member, daysSinceServed, typicalGapDays }) => ({
        memberId: member.id,
        daysSinceServed,
        typicalGapDays,
      })
    ),
    signalsById: [...health.signalsById].map(([id, signals]) => ({
      id,
      signals,
    })),
    memberPaces: Object.fromEntries(computeMemberPaces(members, teams)),
    teamPaceOfMembers: computeTeamPace(members),
  };
};

const teamHealthSuite = defineParitySuite<
  HealthInput,
  ReturnType<typeof healthView>
>({
  name: "people.teamHealth.computeTeamHealth",
  cases: [...HEALTH_SEEDS, ...generatedHealthInputs()],
  run: healthView,
});

/** Signals of every kind, edge numbers included, and every signal the rhythms produced. */
const SIGNALS: readonly PersonSignal[] = [
  { kind: "drifting", lastServedOn: "2026-07-12", typicalGapDays: 14 },
  { kind: "drifting", lastServedOn: "2026-07-12", typicalGapDays: null },
  { kind: "drifting", lastServedOn: "2026-02-30", typicalGapDays: 27.5 },
  { kind: "waiting", nextPendingOn: "2026-09-27", pending: 2 },
  { kind: "waiting", nextPendingOn: "2026-09-27", pending: 1 },
  { kind: "waiting", nextPendingOn: "2028-02-29", pending: 1.5 },
  { kind: "declining", declined: 3, requests: 6 },
  { kind: "declining", declined: 2, requests: 0 },
  { kind: "declining", declined: 2.5, requests: 1e21 },
  { kind: "overloaded", basis: "recent", days: 6, teamPace: null },
  { kind: "overloaded", basis: "upcoming", days: 7, teamPace: 3 },
  { kind: "overloaded", basis: "team-pace", days: 9, teamPace: 4 },
  { kind: "overloaded", basis: "team-pace", days: 9, teamPace: 4.5 },
  { kind: "overloaded", basis: "team-pace", days: 9, teamPace: 2.4999 },
  { kind: "overloaded", basis: "team-pace", days: 9, teamPace: null },
  { kind: "overloaded", basis: "team-pace", days: 1e-6, teamPace: 1e-7 },
  { kind: "due", daysSinceServed: null, typicalGapDays: null },
  { kind: "due", daysSinceServed: null, typicalGapDays: 14 },
  { kind: "due", daysSinceServed: 50, typicalGapDays: 14 },
  { kind: "due", daysSinceServed: 0, typicalGapDays: null },
  { kind: "due", daysSinceServed: 1, typicalGapDays: 7 },
  { kind: "due", daysSinceServed: 13, typicalGapDays: 29 },
  { kind: "due", daysSinceServed: 59, typicalGapDays: 3.4 },
  { kind: "due", daysSinceServed: 200, typicalGapDays: 90 },
  ...RHYTHM_INPUTS.flatMap(({ rhythm, todayKey, teamPace }) =>
    personSignals(rhythm, todayKey, teamPace)
  ).filter((_, index) => index % 3 === 0),
];

const signalTextSuite = defineParitySuite<
  PersonSignal,
  {
    label: string;
    detail: string;
    isRosterSignal: boolean;
    describeDue?: string;
  }
>({
  name: "people.teamHealth.signalText",
  cases: SIGNALS,
  run: (signal) => {
    const text = {
      ...describePersonSignal(signal),
      isRosterSignal: isRosterSignal(signal),
    };
    return signal.kind === "due"
      ? { ...text, describeDue: describeDue(signal) }
      : text;
  },
});

// Calendar

const CALENDAR_STATUSES: readonly (string | undefined)[] = [
  undefined,
  "C",
  "U",
  "D",
  "c",
  "confirmed",
  "Confirmed",
  "CONFIRMED",
  " confirmed ",
  "\tC\n",
  "C ",
  `${NBSP}C`,
  `C${IDEOGRAPHIC_SPACE}`,
  "confirmed.",
  "Confirmed service",
  "",
  "  ",
  "unconfirmed",
  "Declined",
  "CONFİRMED",
  "ＣＯＮＦＩＲＭＥＤ",
  `confirm${SOFT_HYPHEN}ed`,
];

const calendarStatusSuite = defineParitySuite<
  { kind: PeopleDashboardDayKind; status?: string },
  {
    isConfirmedStatus: boolean;
    commitmentDot: string;
    commitmentCellTone: string;
    commitmentStatusLabel: string;
    engagementLabel: string;
  }
>({
  name: "people.calendar.status",
  cases: DAY_KINDS.flatMap((kind) =>
    CALENDAR_STATUSES.map((status) =>
      status === undefined ? { kind } : { kind, status }
    )
  ),
  run: ({ kind, status }) => ({
    isConfirmedStatus: isConfirmedStatus(status),
    commitmentDot: commitmentDot(kind, status),
    commitmentCellTone: commitmentCellTone(kind, status),
    commitmentStatusLabel: commitmentStatusLabel(status),
    engagementLabel: engagementLabel(kind, status),
  }),
});

const markerInputs = (): PeopleDashboardMonthDay[][] => {
  const random = createRandom(2029);
  return [
    [],
    [{ day: 4, kind: "rehearsal" }],
    [
      { day: 4, kind: "rehearsal" },
      { day: 4, kind: "service", status: "U", positionName: "Keys" },
      { day: 4, kind: "service", status: "C", positionName: "Bass" },
    ],
    [
      { day: 4, kind: "rehearsal", status: "C" },
      { day: 4, kind: "rehearsal" },
    ],
    ...Array.from({ length: 30 }, () =>
      Array.from({ length: intBetween(random, 1, 5) }, () => monthDayOf(random))
    ),
  ];
};

const markerSuite = defineParitySuite<
  PeopleDashboardMonthDay[],
  PeopleDashboardMonthDay | null
>({
  name: "people.calendar.pickCalendarMarker",
  cases: markerInputs(),
  run: pickCalendarMarker,
});

const cellsSuite = defineParitySuite<
  { startsOnWeekday: number; daysInMonth: number },
  ReturnType<typeof buildCalendarCells>
>({
  name: "people.calendar.buildCalendarCells",
  cases: [0, 1, 3, 6].flatMap((startsOnWeekday) =>
    [0, 1, 28, 29, 30, 31].map((daysInMonth) => ({
      startsOnWeekday,
      daysInMonth,
    }))
  ),
  run: ({ startsOnWeekday, daysInMonth }) =>
    buildCalendarCells(startsOnWeekday, daysInMonth),
});

interface MonthDayLabelInput {
  year: number;
  monthIndex: number;
  day: number;
}

const MONTH_DAY_LABEL_INPUTS: readonly MonthDayLabelInput[] = [
  { year: 2026, monthIndex: 9, day: 4 },
  ...Array.from({ length: 31 }, (_, index) => ({
    year: 2026,
    monthIndex: 4,
    day: index + 1,
  })),
  ...[2026, 2027, 2028, 2100, 2000, 1999, 99, 0, 1970].flatMap((year) =>
    [
      [1, 28],
      [1, 29],
      [1, 30],
      [0, 0],
      [0, 32],
      [11, 31],
      [11, 32],
      [-1, 15],
      [12, 1],
      [13, -1],
    ].map(([monthIndex = 0, day = 1]) => ({ year, monthIndex, day }))
  ),
];

const monthDayLabelSuite = defineParitySuite<
  MonthDayLabelInput,
  { monthDay: string; weekdayMonthDay: string; weekday: string }
>({
  name: "people.calendar.formatMonthDay",
  cases: MONTH_DAY_LABEL_INPUTS,
  run: ({ year, monthIndex, day }) => ({
    monthDay: formatMonthDay({ year, monthIndex }, day),
    weekdayMonthDay: formatWeekdayMonthDay({ year, monthIndex }, day),
    weekday: formatWeekday({ year, monthIndex }, day),
  }),
});

const heatSuite = defineParitySuite<
  { serviceCount: number; rehearsalCount?: number },
  string
>({
  name: "people.calendar.heatLevelTone",
  cases: [0, 1, 2, 3, 7, 8, 9, 30].flatMap((serviceCount) => [
    { serviceCount },
    ...[0, 1, 2, 5].map((rehearsalCount) => ({ serviceCount, rehearsalCount })),
  ]),
  run: ({ serviceCount, rehearsalCount }) =>
    heatLevelTone(serviceCount, rehearsalCount),
});

// Person detail placeholder

/** A dashboard input moved to another month. */
const withMonth = (
  input: AssembleInput,
  year: number,
  monthIndex: number,
  label: string
): AssembleInput => ({
  ...input,
  roster: {
    ...input.roster,
    month: { ...input.roster.month, year, monthIndex, label },
  },
});

const placeholderSuite = defineParitySuite<
  {
    dashboards: AssembleInput[];
    personId: string;
    month: string | null;
  },
  ReturnType<typeof getCachedPeopleDashboardPersonDetail> | null
>({
  name: "people.placeholder.cachedPersonDetail",
  cases: (() => {
    const alex: AssembleInput = {
      roster: {
        ...testRoster(0),
        people: [
          {
            id: "person-1",
            name: "Alex Adams",
            initials: "AA",
            photoThumbnailUrl: null,
            teams: ["Band"],
          },
        ],
        teams: [
          {
            id: "team-1",
            name: "Band",
            serviceTypeName: null,
            personIds: ["person-1"],
          },
        ],
      },
      activities: [
        {
          id: "person-1",
          rhythm: testRhythm({
            lastServedOn: "2026-05-10",
            nextServingOn: "2026-05-31",
            servedDays90: 2,
            servedDays180: 4,
            requests180: 5,
            pendingUpcoming: 1,
            nextPendingOn: "2026-05-31",
          }),
          roles: ["Vocals"],
          monthDays: [],
        },
      ],
      scopePersonIds: ["person-1"],
      samplePeopleCount: 1,
      loadingPersonIds: [],
    };
    const january = withMonth(alex, 2027, 0, "January 2027");
    const december = withMonth(alex, 2026, 11, "December 2026");
    const generated = ASSEMBLE_INPUTS.slice(4, 10);
    return [
      { dashboards: [alex], personId: "person-1", month: null },
      { dashboards: [alex], personId: "person-1", month: "2026-06" },
      { dashboards: [alex], personId: "person-1", month: "2026-05" },
      { dashboards: [alex], personId: "person-2", month: null },
      { dashboards: [], personId: "person-1", month: null },
      { dashboards: [january], personId: "person-1", month: null },
      { dashboards: [december], personId: "person-1", month: "2026-12" },
      {
        dashboards: [december, january],
        personId: "person-1",
        month: "2027-01",
      },
      ...generated.flatMap((input) =>
        input.roster.people.slice(0, 2).map(({ id }) => ({
          dashboards: [input, alex],
          personId: id,
          month: null,
        }))
      ),
    ];
  })(),
  run: ({ dashboards, personId, month }) =>
    getCachedPeopleDashboardPersonDetail(
      dashboards.map(assemble),
      personId,
      month
    ) ?? null,
});

// Ordering

/**
 * Strings whose order `localeCompare` decides beyond plain code points: case, accents
 * (composed and decomposed), punctuation and spaces, characters ICU ignores, compatibility
 * variants it ranks after their base, scripts, and day keys.
 */
const COLLATION_STRINGS: readonly string[] = [
  ...new Set([
    ...NAMES,
    "a",
    "A",
    "b",
    "B",
    "é",
    `e${COMBINING_ACUTE}`,
    "É",
    "e",
    "E",
    `a${SOFT_HYPHEN}b`,
    `ab${SOFT_HYPHEN}`,
    "ab",
    `a${ZWJ}b`,
    "a b",
    `a${NBSP}b`,
    `a${MIDDLE_DOT}b`,
    "a-b",
    `a${EN_DASH}b`,
    "a_b",
    "a\tb",
    LIGATURE_FI,
    "fi",
    "Ｆｕｌｌ",
    "Full",
    "x²y",
    "x2y",
    "ǆ",
    "dž",
    "Ǆ",
    "Œuvre",
    "Oeuvre",
    "Þór",
    "Thor",
    "2026-09-26",
    "2026-10-01",
    "2026-09-25",
    "2027-01-01",
  ]),
];

const collationSuite = defineParitySuite<string[], number[][]>({
  name: "people.localeCompare",
  cases: [[...COLLATION_STRINGS]],
  run: (strings) =>
    strings.map((a) => strings.map((b) => Math.sign(a.localeCompare(b)))),
});

export const peopleParitySuites: readonly ParitySuite[] = [
  constantsSuite,
  scopeParseSuite,
  scopeTeamSuite,
  scopeViewSuite,
  scopeDefaultSuite,
  scopeTeamIdsSuite,
  resolveScopeSuite,
  initialLoadSuite,
  chunkSuite,
  planBatchesSuite,
  orderSuite,
  normalizeSuite,
  matchesSuite,
  unrequestedSuite,
  assembleSuite,
  coverageSuite,
  buildMonthDaysSuite,
  serviceDaysSuite,
  matrixSuite,
  dueThresholdSuite,
  heavyLoadSuite,
  rhythmSignalsSuite,
  teamHealthSuite,
  signalTextSuite,
  calendarStatusSuite,
  markerSuite,
  cellsSuite,
  monthDayLabelSuite,
  heatSuite,
  placeholderSuite,
  collationSuite,
];

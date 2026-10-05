import {
  addCalendarDaysToDayKey,
  formatCalendarDateLabel,
  formatCalendarDayInTimeZone,
  formatWallTimeInTimeZone,
  orgCalendarDaysBetween,
  orgCalendarDaysRefMinusItem,
  zonedWallTimeToUtcIso,
} from "@pcobooster/planning-center-models/calendar";
import type {
  CalendarDateLabelStyle,
  ZonedWallTime,
} from "@pcobooster/planning-center-models/calendar";
import {
  formatPlanHistoryHalfRangeWeeksLabel,
  PLAN_HISTORY_HALF_RANGE_DAYS,
  PLAN_HISTORY_HALF_RANGE_WEEKS,
  REHEARSAL_WINDOW_MARGIN_DAYS,
} from "@pcobooster/planning-center-models/schedule-constants";
import { vi } from "vitest";

import { formatTimeOfDay } from "@/lib/plan-overview";
import {
  formatPlanDate,
  formatPlanDateTile,
  formatPlanMonthHeading,
  formatPlanRelativeDay,
  groupPlansByMonthAndDay,
  isInDateWindow,
} from "@/lib/service-plan-selection";
import type {
  DateRangeFilter,
  ServicePlanRow,
} from "@/lib/service-plan-selection";

import { defineParitySuite } from "./parity";
import type { ParitySuite } from "./parity";

/**
 * Parity suites for `OrgCalendar`, `ScheduleConstants`, and the plan list date helpers
 * (`apps/ios/PCOBoosterCore/Sources/PCOBoosterCore/Logic/Calendar`). Inputs sweep every
 * offset change in 2026 and 2027 for zones with DST (including half-hour and 45-minute
 * offsets), month and year boundaries, and late evenings whose UTC day differs from the
 * zone's, alongside the cases from the TypeScript tests.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const HALF_HOUR_MS = 30 * MINUTE_MS;

/** Zones whose offset changes, among them a half-hour (St. John's) and a 45-minute one (Chatham). */
const DST_ZONES = [
  "America/Los_Angeles",
  "America/New_York",
  "America/Denver",
  "Europe/London",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Pacific/Chatham",
  "America/St_Johns",
] as const;

/** Zones on one offset all year, from UTC-7 to UTC+14, and `""`, which the helpers read as UTC. */
const FIXED_ZONES = [
  "America/Phoenix",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Pacific/Kiritimati",
  "UTC",
  "",
] as const;

const ALL_ZONES: readonly string[] = [...DST_ZONES, ...FIXED_ZONES];

/** A smaller spread for the helpers built on the others: west, east, half-hour, and UTC. */
const PLAN_ZONES = [
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Pacific/Auckland",
  "Asia/Kolkata",
  "UTC",
] as const;

const SWEEP_START = Date.UTC(2026, 0, 1);
const SWEEP_END = Date.UTC(2028, 0, 1);

/**
 * Instants every zone is checked at: late Pacific evenings already on the next UTC day,
 * month, year, and leap-day boundaries, the TypeScript tests' instants, and a few far ones.
 */
const BOUNDARY_INSTANTS = [
  "2026-09-10T02:00:00.000Z",
  "2026-09-09T23:00:00.000Z",
  "2026-10-01T04:30:00.000Z",
  "2026-11-01T02:00:00.000Z",
  "2026-09-24T02:00:00.000Z",
  "2026-05-24T16:30:00.000Z",
  "2026-04-13T07:00:00.000Z",
  "2026-12-31T23:30:00.000Z",
  "2027-01-01T00:00:00.000Z",
  "2027-01-01T07:59:59.999Z",
  "2027-01-01T08:00:00.000Z",
  "2026-02-28T23:59:59.999Z",
  "2028-02-29T12:00:00.000Z",
  "2028-02-29T23:30:00.000Z",
  "2026-06-30T18:30:00.000Z",
  "2026-07-01T00:00:00.000Z",
  "2026-01-01T10:59:00.000Z",
  "2026-10-01T12:00:00.250Z",
  "1970-01-01T00:00:00.000Z",
  "2000-02-29T12:00:00.000Z",
  "2038-01-19T03:14:08.000Z",
  "2099-12-31T23:59:59.999Z",
].map((iso) => Date.parse(iso));

const toDate = (ms: number): Date => new Date(ms);

/** The zone's UTC offset in minutes at an instant, read off its wall clock. */
const offsetMinutes = (ms: number, timeZone: string): number => {
  const { dateKey, timeValue } = formatWallTimeInTimeZone(
    new Date(ms),
    timeZone
  );
  const wallClock = Date.parse(`${dateKey}T${timeValue}:00.000Z`);
  return (wallClock - (ms - (ms % MINUTE_MS))) / MINUTE_MS;
};

/** The first minute at or after `from` whose offset differs from `before`. */
const firstMinuteOffsetDiffers = (
  from: number,
  before: number,
  timeZone: string
): number => {
  let minute = from;
  while (offsetMinutes(minute, timeZone) === before) {
    minute += MINUTE_MS;
  }
  return minute;
};

/** Every instant in 2026 and 2027 when the zone's offset changes, to the minute. */
const offsetTransitions = (timeZone: string): number[] => {
  const transitions: number[] = [];
  let previous = offsetMinutes(SWEEP_START, timeZone);
  for (let hour = SWEEP_START + HOUR_MS; hour < SWEEP_END; hour += HOUR_MS) {
    const current = offsetMinutes(hour, timeZone);
    if (current !== previous) {
      transitions.push(
        firstMinuteOffsetDiffers(hour - HOUR_MS + MINUTE_MS, previous, timeZone)
      );
      previous = current;
    }
  }
  return transitions;
};

const transitionsByZone = new Map(
  ALL_ZONES.map((timeZone) => [timeZone, offsetTransitions(timeZone)])
);

const transitionsIn = (timeZone: string): readonly number[] =>
  transitionsByZone.get(timeZone) ?? [];

/** `YYYY-MM-DD` shifted by whole UTC days, independent of the code under test. */
const shiftDayKey = (dayKey: string, days: number): string =>
  new Date(Date.parse(`${dayKey}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

/** The day before, of, and after a transition, as day keys in its zone. */
const transitionDays = (transition: number, timeZone: string): string[] => {
  const day = formatCalendarDayInTimeZone(new Date(transition), timeZone);
  return [-1, 0, 1].map((offset) => shiftDayKey(day, offset));
};

/** The millisecond before, the moment of, and half an hour after each local midnight around a transition. */
const midnightsAround = (transition: number, timeZone: string): number[] =>
  transitionDays(transition, timeZone).flatMap((day) => {
    const midnight = Date.parse(zonedWallTimeToUtcIso(day, "00:00", timeZone));
    return [midnight - 1, midnight, midnight + HALF_HOUR_MS];
  });

const STEPS_EACH_SIDE = 6;

/** Every half hour for three hours either side of each transition, its last millisecond before, its first minute after, and the midnights around it. */
const denseInstants = (timeZone: string): number[] =>
  transitionsIn(timeZone).flatMap((transition) => [
    ...Array.from(
      { length: STEPS_EACH_SIDE * 2 + 1 },
      (_, step) => transition + (step - STEPS_EACH_SIDE) * HALF_HOUR_MS
    ),
    transition - 1,
    transition + MINUTE_MS,
    ...midnightsAround(transition, timeZone),
  ]);

/** Fewer points for the day-level labels: each transition's edges and the midnights around it. */
const sparseInstants = (timeZone: string): number[] =>
  transitionsIn(timeZone).flatMap((transition) => [
    transition - 1,
    transition,
    transition + HALF_HOUR_MS,
    ...midnightsAround(transition, timeZone),
  ]);

interface InstantInput {
  instant: Date;
  timeZone: string;
}

const instantInputs = (
  zones: readonly string[],
  sweep: (timeZone: string) => number[]
): InstantInput[] =>
  zones.flatMap((timeZone) =>
    [...new Set([...sweep(timeZone), ...BOUNDARY_INSTANTS])]
      .toSorted((a, b) => a - b)
      .map((ms) => ({ instant: toDate(ms), timeZone }))
  );

const denseInstantInputs = instantInputs(ALL_ZONES, denseInstants);
const sparseInstantInputs = instantInputs(ALL_ZONES, sparseInstants);

const dayKeySuite = defineParitySuite<InstantInput, string>({
  name: "calendar.dayKey",
  cases: denseInstantInputs,
  run: ({ instant, timeZone }) =>
    formatCalendarDayInTimeZone(instant, timeZone),
});

const wallTimeSuite = defineParitySuite<InstantInput, ZonedWallTime>({
  name: "calendar.wallTime",
  cases: denseInstantInputs,
  run: ({ instant, timeZone }) => formatWallTimeInTimeZone(instant, timeZone),
});

const timeOfDaySuite = defineParitySuite<InstantInput, string>({
  name: "calendar.timeOfDay",
  cases: denseInstantInputs,
  run: ({ instant, timeZone }) => formatTimeOfDay(instant, timeZone),
});

const labelSuite = defineParitySuite<
  InstantInput,
  Record<CalendarDateLabelStyle, string>
>({
  name: "calendar.label",
  cases: sparseInstantInputs,
  run: ({ instant, timeZone }) => ({
    dayOfMonth: formatCalendarDateLabel(instant, timeZone, "dayOfMonth"),
    monthDay: formatCalendarDateLabel(instant, timeZone, "monthDay"),
    monthDayYear: formatCalendarDateLabel(instant, timeZone, "monthDayYear"),
    monthShort: formatCalendarDateLabel(instant, timeZone, "monthShort"),
    monthYear: formatCalendarDateLabel(instant, timeZone, "monthYear"),
    weekday: formatCalendarDateLabel(instant, timeZone, "weekday"),
    weekdayMonthDay: formatCalendarDateLabel(
      instant,
      timeZone,
      "weekdayMonthDay"
    ),
    weekdayMonthDayYear: formatCalendarDateLabel(
      instant,
      timeZone,
      "weekdayMonthDayYear"
    ),
  }),
});

interface WallTimeInput {
  dateKey: string;
  timeValue: string;
  timeZone: string;
}

const QUARTER_HOURS_TO_FIVE_AM = Array.from({ length: 20 }, (_, quarter) => {
  const minutes = quarter * 15;
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  return `${hour}:${String(minutes % 60).padStart(2, "0")}`;
});

/** Every quarter hour from midnight to 4:45 AM on each transition day (the gaps and overlaps), plus noon and the last minute. */
const transitionWallTimes = (timeZone: string): WallTimeInput[] =>
  transitionsIn(timeZone).flatMap((transition) => {
    const dateKey = formatCalendarDayInTimeZone(new Date(transition), timeZone);
    return [...QUARTER_HOURS_TO_FIVE_AM, "12:00", "23:59"].map((timeValue) => ({
      dateKey,
      timeValue,
      timeZone,
    }));
  });

const PLAIN_WALL_DATES = [
  "2026-01-01",
  "2026-05-24",
  "2026-12-24",
  "2028-02-29",
] as const;

const PLAIN_WALL_TIMES = ["00:00", "09:30", "23:59"] as const;

/**
 * Inputs the TypeScript reads loosely: a day or month past its range rolls over, years 0 to
 * 99 mean 1900 to 1999, extra parts are ignored, an empty part is 0, and a missing or
 * non-numeric part makes it throw (the suite writes `null`).
 */
const LOOSE_WALL_TIMES: readonly WallTimeInput[] = [
  ["2026-02-30", "09:30"],
  ["2026-13-01", "09:30"],
  ["2026-05-24", "24:00"],
  ["2026-05-24", "09:75"],
  ["2026-05-24", "09:30:45"],
  ["2026-05-24-extra", "09:30"],
  ["0099-01-01", "12:00"],
  ["2026--24", "09:30"],
  ["2026-05-24", "9:5"],
  ["2026-05", "09:30"],
  ["2026-05-24", "09"],
  ["", ""],
  ["May 24 2026", "09:30"],
  ["2026-05-24", "9am"],
].flatMap(([dateKey, timeValue]) =>
  ["UTC", "America/Los_Angeles"].map((timeZone) => ({
    dateKey,
    timeValue,
    timeZone,
  }))
);

const utcInstantSuite = defineParitySuite<WallTimeInput, string | null>({
  name: "calendar.utcInstant",
  cases: [
    {
      dateKey: "2026-05-24",
      timeValue: "09:30",
      timeZone: "America/Los_Angeles",
    },
    {
      dateKey: "2026-12-24",
      timeValue: "09:30",
      timeZone: "America/Los_Angeles",
    },
    {
      dateKey: "2026-03-08",
      timeValue: "02:30",
      timeZone: "America/Los_Angeles",
    },
    {
      dateKey: "2026-11-01",
      timeValue: "01:30",
      timeZone: "America/Los_Angeles",
    },
    ...ALL_ZONES.flatMap((timeZone) => [
      ...transitionWallTimes(timeZone),
      ...PLAIN_WALL_DATES.flatMap((dateKey) =>
        PLAIN_WALL_TIMES.map((timeValue) => ({ dateKey, timeValue, timeZone }))
      ),
    ]),
    ...LOOSE_WALL_TIMES,
  ],
  run: ({ dateKey, timeValue, timeZone }) => {
    try {
      return zonedWallTimeToUtcIso(dateKey, timeValue, timeZone);
    } catch {
      return null;
    }
  },
});

interface AddDaysInput {
  dayKey: string;
  deltaDays: number;
}

const ADD_DAY_KEYS = [
  "2026-01-10",
  "2026-03-07",
  "2026-03-08",
  "2026-09-26",
  "2026-10-31",
  "2026-12-31",
  "2028-02-28",
] as const;

const ADD_DELTAS = [-366, -28, -1, 0, 1, 2, 7, 28] as const;

const addDaysSuite = defineParitySuite<AddDaysInput, string>({
  name: "calendar.addDays",
  cases: [
    ...ADD_DAY_KEYS.flatMap((dayKey) =>
      ADD_DELTAS.map((deltaDays) => ({ dayKey, deltaDays }))
    ),
    // Loose keys roll over like `Date.UTC`, and years 0 to 99 mean 1900 to 1999.
    { dayKey: "2026-02-30", deltaDays: 0 },
    { dayKey: "2026-13-01", deltaDays: 0 },
    { dayKey: "0099-01-01", deltaDays: 0 },
    { dayKey: "2026-05-24-extra", deltaDays: 1 },
    { dayKey: "2026-01-31", deltaDays: 400 },
  ],
  run: ({ dayKey, deltaDays }) => addCalendarDaysToDayKey(dayKey, deltaDays),
});

interface DayKeyPairInput {
  itemDayKey: string;
  refDayKey: string;
}

const daysRefMinusItemSuite = defineParitySuite<DayKeyPairInput, number>({
  name: "calendar.daysRefMinusItem",
  cases: [
    ["2026-09-25", "2026-09-25"],
    ["2026-09-24", "2026-09-25"],
    ["2026-09-25", "2026-09-24"],
    ["2026-03-07", "2026-03-09"],
    ["2026-10-31", "2026-11-02"],
    ["2026-12-31", "2027-01-01"],
    ["2027-01-01", "2026-12-31"],
    ["2028-02-28", "2028-03-01"],
    ["2027-02-28", "2027-03-01"],
    ["2000-02-28", "2000-03-01"],
    ["2100-02-28", "2100-03-01"],
    ["1970-01-01", "2026-10-01"],
    ["2026-10-01", "1970-01-01"],
    ["2026-01-01", "2027-01-01"],
    ["2028-01-01", "2029-01-01"],
    ["2026-08-28", "2026-09-25"],
    ["2026-09-25", "2026-10-23"],
    ["2026-02-30", "2026-03-02"],
    ["2026-13-01", "2027-01-01"],
    ["0099-01-01", "1999-01-01"],
    ["2026-05-24-extra", "2026-05-25"],
  ].map(([itemDayKey, refDayKey]) => ({ itemDayKey, refDayKey })),
  run: ({ itemDayKey, refDayKey }) =>
    orgCalendarDaysRefMinusItem(itemDayKey, refDayKey),
});

interface InstantPairInput {
  a: Date;
  b: Date;
  timeZone: string;
}

/** Pairs straddling local midnight, DST changes, and year ends, in both orders. */
const INSTANT_PAIRS = [
  ["2026-10-31T16:00:00.000Z", "2026-11-01T02:00:00.000Z"],
  ["2026-10-31T16:00:00.000Z", "2026-11-01T17:00:00.000Z"],
  ["2026-11-01T17:00:00.000Z", "2026-10-31T16:00:00.000Z"],
  ["2026-03-08T07:59:00.000Z", "2026-03-08T08:01:00.000Z"],
  ["2026-03-07T20:00:00.000Z", "2026-03-09T06:00:00.000Z"],
  ["2026-12-31T23:30:00.000Z", "2027-01-01T00:30:00.000Z"],
  ["2026-09-10T02:00:00.000Z", "2026-09-10T02:00:00.000Z"],
  ["2026-09-26T13:00:00.000Z", "2026-09-27T15:00:00.000Z"],
  ["2026-04-04T12:00:00.000Z", "2026-04-05T15:00:00.000Z"],
  ["2026-10-01T04:30:00.000Z", "2026-10-15T04:30:00.000Z"],
] as const;

const daysBetweenSuite = defineParitySuite<InstantPairInput, number>({
  name: "calendar.daysBetween",
  cases: ALL_ZONES.flatMap((timeZone) =>
    INSTANT_PAIRS.map(([a, b]) => ({
      a: new Date(a),
      b: new Date(b),
      timeZone,
    }))
  ),
  run: ({ a, b, timeZone }) => orgCalendarDaysBetween(a, b, timeZone),
});

const scheduleConstantsSuite = defineParitySuite<
  string,
  Record<string, number>
>({
  name: "calendar.scheduleConstants",
  cases: ["values"],
  run: () => ({
    planHistoryHalfRangeDays: PLAN_HISTORY_HALF_RANGE_DAYS,
    planHistoryHalfRangeWeeks: PLAN_HISTORY_HALF_RANGE_WEEKS,
    rehearsalWindowMarginDays: REHEARSAL_WINDOW_MARGIN_DAYS,
  }),
});

interface WeeksInput {
  /** Absent for the default. */
  weeks?: number;
}

const halfRangeWeeksLabelSuite = defineParitySuite<WeeksInput, string>({
  name: "calendar.planHistoryHalfRangeWeeksLabel",
  cases: [
    {},
    { weeks: 0 },
    { weeks: 1 },
    { weeks: 2 },
    { weeks: 4 },
    { weeks: 12 },
  ],
  run: ({ weeks }) => formatPlanHistoryHalfRangeWeeksLabel(weeks),
});

/** The plan list labels wrap `formatCalendarDateLabel`, so the boundary instants are enough. */
const planInstantInputs: InstantInput[] = PLAN_ZONES.flatMap((timeZone) =>
  BOUNDARY_INSTANTS.map((ms) => ({ instant: toDate(ms), timeZone }))
);

const formatPlanDateSuite = defineParitySuite<InstantInput, string>({
  name: "calendar.formatPlanDate",
  cases: planInstantInputs,
  run: ({ instant, timeZone }) => formatPlanDate(instant, timeZone),
});

const formatPlanMonthHeadingSuite = defineParitySuite<InstantInput, string>({
  name: "calendar.formatPlanMonthHeading",
  cases: planInstantInputs,
  run: ({ instant, timeZone }) => formatPlanMonthHeading(instant, timeZone),
});

const formatPlanDateTileSuite = defineParitySuite<
  InstantInput,
  ReturnType<typeof formatPlanDateTile>
>({
  name: "calendar.formatPlanDateTile",
  cases: planInstantInputs,
  run: ({ instant, timeZone }) => formatPlanDateTile(instant, timeZone),
});

/** "now" values: a Saturday morning in Los Angeles (the TypeScript test's), a late Pacific evening, and New Year's Eve. */
const SATURDAY_MORNING = Date.parse("2026-10-31T16:00:00.000Z");

const NOWS = [
  SATURDAY_MORNING,
  Date.parse("2026-09-10T05:30:00.000Z"),
  Date.parse("2026-12-31T22:00:00.000Z"),
];

/** How far after "now" each plan sits, in hours: past, today, tomorrow, and around the two-week edge. */
const RELATIVE_OFFSET_HOURS = [
  -25,
  -1,
  0,
  3,
  10,
  20,
  25,
  48,
  100,
  13 * 24,
  13 * 24 + 20,
  14 * 24,
  15 * 24,
] as const;

interface RelativeDayInput {
  date: Date;
  now: Date;
  timeZone: string;
}

const relativeDayInputs: RelativeDayInput[] = PLAN_ZONES.flatMap((timeZone) =>
  NOWS.flatMap((now) =>
    RELATIVE_OFFSET_HOURS.map((hours) => ({
      date: toDate(now + hours * HOUR_MS),
      now: toDate(now),
      timeZone,
    }))
  )
);

const formatPlanRelativeDaySuite = defineParitySuite<
  RelativeDayInput,
  string | null
>({
  name: "calendar.formatPlanRelativeDay",
  cases: [
    {
      date: new Date("2026-11-01T02:00:00.000Z"),
      now: new Date("2026-10-31T16:00:00.000Z"),
      timeZone: "America/Los_Angeles",
    },
    {
      date: new Date("2026-11-05T17:00:00.000Z"),
      now: new Date("2026-10-31T16:00:00.000Z"),
      timeZone: "America/Los_Angeles",
    },
    ...relativeDayInputs,
  ],
  run: ({ date, now, timeZone }) => formatPlanRelativeDay(date, now, timeZone),
});

interface DateWindowInput {
  date: Date;
  now: Date;
  range: DateRangeFilter;
  timeZone: string;
}

/** "all" skips the clock entirely, so one "now" covers it. */
const DATE_RANGES = ["14", "30", "60"] as const;

/** How far after "now" each plan sits, in hours: past, and around each window's end. */
const WINDOW_OFFSET_HOURS = [
  -30,
  -2,
  0,
  14 * 24,
  14 * 24 + 20,
  15 * 24,
  30 * 24 + 20,
  31 * 24 + 6,
  60 * 24 + 20,
  61 * 24 + 6,
] as const;

/** `isInDateWindow` reads the clock, so each case runs with the clock set to its `now`. */
const withSystemTime = <Output>(now: Date, run: () => Output): Output => {
  vi.useFakeTimers({ now, toFake: ["Date"] });
  try {
    return run();
  } finally {
    vi.useRealTimers();
  }
};

const isInDateWindowSuite = defineParitySuite<DateWindowInput, boolean>({
  name: "calendar.isInDateWindow",
  cases: [
    ...WINDOW_OFFSET_HOURS.map((hours) => ({
      date: toDate(SATURDAY_MORNING + hours * HOUR_MS),
      now: toDate(SATURDAY_MORNING),
      range: "all" as const,
      timeZone: "America/Los_Angeles",
    })),
    ...PLAN_ZONES.flatMap((timeZone) =>
      NOWS.slice(0, 2).flatMap((now) =>
        DATE_RANGES.flatMap((range) =>
          WINDOW_OFFSET_HOURS.map((hours) => ({
            date: toDate(now + hours * HOUR_MS),
            now: toDate(now),
            range,
            timeZone,
          }))
        )
      )
    ),
  ],
  run: ({ date, now, range, timeZone }) =>
    withSystemTime(now, () => isInDateWindow(date, range, timeZone)),
});

interface GroupRowInput {
  planId: string;
  sortDate: Date;
}

interface GroupPlansInput {
  rows: GroupRowInput[];
  timeZone: string;
}

interface GroupedDay {
  date: Date;
  dayKey: string;
  planIds: string[];
}

interface GroupedMonth {
  days: GroupedDay[];
  heading: string;
}

const groupRows = (sortDates: readonly string[]): GroupRowInput[] =>
  sortDates.map((sortDate, index) => ({
    planId: `plan-${index + 1}`,
    sortDate: new Date(sortDate),
  }));

/** Date-sorted plans across late evenings, a month end, a DST change, and a year end. */
const GROUP_SORT_DATES = [
  "2026-10-25T00:30:00.000Z",
  "2026-10-25T17:00:00.000Z",
  "2026-10-31T16:00:00.000Z",
  "2026-11-01T02:00:00.000Z",
  "2026-11-01T09:30:00.000Z",
  "2026-11-01T17:00:00.000Z",
  "2026-11-08T17:00:00.000Z",
  "2026-12-31T22:00:00.000Z",
  "2027-01-01T06:00:00.000Z",
  "2027-01-01T11:00:00.000Z",
] as const;

const toServicePlanRow = ({
  planId,
  sortDate,
}: GroupRowInput): ServicePlanRow => ({
  planId,
  planTitle: "",
  seriesId: null,
  seriesTitle: null,
  serviceTypeId: "service-type",
  serviceTypeName: "Sunday Worship",
  serviceTypeSequence: 0,
  sortDate,
});

const groupPlansSuite = defineParitySuite<GroupPlansInput, GroupedMonth[]>({
  name: "calendar.groupPlansByMonthAndDay",
  cases: [
    {
      rows: groupRows([
        "2026-10-31T16:00:00.000Z",
        "2026-11-01T02:00:00.000Z",
        "2026-11-01T17:00:00.000Z",
      ]),
      timeZone: "America/Los_Angeles",
    },
    { rows: [], timeZone: "America/Los_Angeles" },
    ...PLAN_ZONES.map((timeZone) => ({
      rows: groupRows(GROUP_SORT_DATES),
      timeZone,
    })),
    // Out of order: a heading or day only merges with the one just before it.
    {
      rows: groupRows([
        "2026-11-01T17:00:00.000Z",
        "2026-10-31T16:00:00.000Z",
        "2026-11-01T18:00:00.000Z",
      ]),
      timeZone: "America/Los_Angeles",
    },
  ],
  run: ({ rows, timeZone }) =>
    groupPlansByMonthAndDay(rows.map(toServicePlanRow), timeZone).map(
      (month) => ({
        days: month.days.map((day) => ({
          date: day.date,
          dayKey: day.dayKey,
          planIds: day.rows.map((row) => row.planId),
        })),
        heading: month.heading,
      })
    ),
});

export const calendarParitySuites: readonly ParitySuite[] = [
  dayKeySuite,
  wallTimeSuite,
  timeOfDaySuite,
  labelSuite,
  utcInstantSuite,
  addDaysSuite,
  daysRefMinusItemSuite,
  daysBetweenSuite,
  scheduleConstantsSuite,
  halfRangeWeeksLabelSuite,
  formatPlanDateSuite,
  formatPlanMonthHeadingSuite,
  formatPlanDateTileSuite,
  formatPlanRelativeDaySuite,
  isInDateWindowSuite,
  groupPlansSuite,
];

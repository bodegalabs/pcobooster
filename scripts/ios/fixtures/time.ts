import {
  addCalendarDaysToDayKey,
  formatCalendarDayInTimeZone,
  orgCalendarDaysRefMinusItem,
  zonedWallTimeToUtcIso,
} from "@pcobooster/planning-center-models/calendar";

/**
 * The calendar every fixture is written on. Dates are fixed around one showcase Sunday;
 * `MockTransport` moves them by whole weeks so that Sunday lands on the coming Sunday.
 */
export const ORG_TIME_ZONE = "America/Los_Angeles";

/** The showcase Sunday, in the org zone. */
export const ANCHOR_SUNDAY = "2026-10-04";

/**
 * When the fixtures were "read": Thursday 10:00 AM in the org zone, three days before the
 * anchor Sunday. Upcoming plans, serving rhythms, and recent songs are relative to it.
 */
export const ANCHOR_NOW = new Date("2026-10-01T17:00:00.000Z");

export const ANCHOR_TODAY = formatCalendarDayInTimeZone(
  ANCHOR_NOW,
  ORG_TIME_ZONE
);

const DAY_MS = 86_400_000;
const DAYS_PER_WEEK = 7;

/** A wall time on an org calendar day, as an instant. */
export const at = (dayKey: string, time: string): Date =>
  new Date(zonedWallTimeToUtcIso(dayKey, time, ORG_TIME_ZONE));

export const addDays = (dayKey: string, days: number): string =>
  addCalendarDaysToDayKey(dayKey, days, ORG_TIME_ZONE);

export const dayOf = (instant: Date): string =>
  formatCalendarDayInTimeZone(instant, ORG_TIME_ZONE);

/** Calendar days from `from` to `to` (positive when `to` is later). */
export const daysBetween = (from: string, to: string): number =>
  orgCalendarDaysRefMinusItem(from, to);

/** Whole weeks from the anchor Sunday to a day (negative before it). */
export const weeksFromAnchor = (dayKey: string): number =>
  Math.round(daysBetween(ANCHOR_SUNDAY, dayKey) / DAYS_PER_WEEK);

export const addHours = (instant: Date, hours: number): Date =>
  new Date(instant.getTime() + hours * (DAY_MS / 24));

export const minusDays = (instant: Date, days: number): Date =>
  new Date(instant.getTime() - days * DAY_MS);

/** Every day key from `first` through `last` that is `step` days apart. */
export const daysEvery = (
  first: string,
  last: string,
  step: number
): string[] => {
  const days: string[] = [];
  for (let day = first; day <= last; day = addDays(day, step)) {
    days.push(day);
  }
  return days;
};

/** `YYMMDD`, used to give plans readable ids. */
export const compactDay = (dayKey: string): string =>
  dayKey.slice(2).replaceAll("-", "");

/** The Park and Miller generator: a prime modulus, and products that stay exact in a double. */
const HASH_MODULUS = 2_147_483_647;
const HASH_MULTIPLIER = 48_271;
/** Extra rounds after the last character, so seeds one character apart land far apart. */
const MIXING_ROUNDS = 4;

/** A stable number in [0, 1) for a seed, so generated data never changes between runs. */
export const unit = (seed: string): number => {
  let hash = 1;
  for (const character of seed) {
    hash =
      (hash * HASH_MULTIPLIER + (character.codePointAt(0) ?? 0)) % HASH_MODULUS;
  }
  for (let round = 0; round < MIXING_ROUNDS; round += 1) {
    hash = (hash * HASH_MULTIPLIER) % HASH_MODULUS;
  }
  return hash / HASH_MODULUS;
};

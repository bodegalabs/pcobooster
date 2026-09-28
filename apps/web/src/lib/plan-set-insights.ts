import type { PlanItem } from "@pcobooster/planning-center-models/types";

const KEY_PATTERN =
  /^\s*(?<letter>[A-G])(?<accidental>[#♯b♭]?)(?<minor>m(?!aj))?/u;
const NATURAL_PITCHES = new Map([
  ["C", 0],
  ["D", 2],
  ["E", 4],
  ["F", 5],
  ["G", 7],
  ["A", 9],
  ["B", 11],
]);
const SEMITONES_IN_OCTAVE = 12;
const RELATIVE_MAJOR_OFFSET = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Songs played within this many days before the plan count as a repeat. */
export const RECENT_REPEAT_DAYS = 28;

export interface ParsedKey {
  label: string;
  /** Pitch class of the key's major (or relative major) tonic, 0 = C. */
  majorPitch: number;
}

/** Reads "Eb", "F#m", or "Bb" from a Planning Center key field; null for anything else. */
export const parseKey = (
  value: string | null | undefined
): ParsedKey | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const match = KEY_PATTERN.exec(value);
  if (match === null) {
    return null;
  }
  const [label] = match;
  const { letter = "C", accidental = "", minor } = match.groups ?? {};
  let pitch = NATURAL_PITCHES.get(letter) ?? 0;
  if (accidental === "#" || accidental === "♯") {
    pitch += 1;
  }
  if (accidental === "b" || accidental === "♭") {
    pitch -= 1;
  }
  if (minor !== undefined) {
    pitch += RELATIVE_MAJOR_OFFSET;
  }
  return {
    label: label.trim(),
    majorPitch:
      ((pitch % SEMITONES_IN_OCTAVE) + SEMITONES_IN_OCTAVE) %
      SEMITONES_IN_OCTAVE,
  };
};

export type KeyTransitionLevel = "smooth" | "noticeable" | "awkward";

export interface KeyTransition {
  fromItemId: string;
  toItemId: string;
  from: string;
  to: string;
  level: KeyTransitionLevel;
  description: string;
}

/** Indexed by semitones up from the previous song's key. */
const INTERVALS = [
  { level: "smooth", description: "Same key" },
  { level: "smooth", description: "Up a half step" },
  { level: "smooth", description: "Up a whole step" },
  { level: "noticeable", description: "Up a minor third" },
  { level: "noticeable", description: "Up a major third" },
  { level: "smooth", description: "Up a fourth" },
  { level: "awkward", description: "A tritone apart" },
  { level: "smooth", description: "Up a fifth" },
  { level: "noticeable", description: "Down a major third" },
  { level: "noticeable", description: "Down a minor third" },
  { level: "noticeable", description: "Down a whole step" },
  { level: "awkward", description: "Down a half step" },
] as const satisfies readonly {
  level: KeyTransitionLevel;
  description: string;
}[];

const songEndKey = (item: PlanItem) =>
  parseKey(item.key?.endingKey) ?? parseKey(item.key?.startingKey);

/**
 * Key changes between songs that follow each other within a section. A header starts a
 * new section, so a sermon or break between sets never counts as a transition.
 */
export const keyTransitions = (items: readonly PlanItem[]): KeyTransition[] => {
  const transitions: KeyTransition[] = [];
  let previousSong: PlanItem | null = null;
  for (const item of items) {
    if (item.itemType === "header") {
      previousSong = null;
      continue;
    }
    if (item.itemType !== "song") {
      continue;
    }
    const fromKey = previousSong === null ? null : songEndKey(previousSong);
    const toKey = parseKey(item.key?.startingKey);
    if (previousSong !== null && fromKey !== null && toKey !== null) {
      const interval =
        (toKey.majorPitch - fromKey.majorPitch + SEMITONES_IN_OCTAVE) %
        SEMITONES_IN_OCTAVE;
      const { level, description } = INTERVALS[interval] ?? INTERVALS[0];
      transitions.push({
        fromItemId: previousSong.id,
        toItemId: item.id,
        from: fromKey.label,
        to: toKey.label,
        level,
        description,
      });
    }
    previousSong = item;
  }
  return transitions;
};

/**
 * Whole days between a song's last play and this plan, when that was recent enough to
 * feel like a repeat. Plays on or after the plan's date (this plan, or later ones) don't count.
 */
export const daysSinceRecentPlay = (
  item: PlanItem,
  planDate: Date | null
): number | null => {
  const lastScheduledAt = item.song?.lastScheduledAt ?? null;
  if (planDate === null || lastScheduledAt === null) {
    return null;
  }
  const days = Math.floor(
    (planDate.getTime() - lastScheduledAt.getTime()) / DAY_MS
  );
  return days >= 1 && days <= RECENT_REPEAT_DAYS ? days : null;
};

const WEEK_DAYS = 7;
const MONTH_DAYS = 30;
const YEAR_DAYS = 365;

/** "This week", "3 wk ago", "5 mo ago", or "2 yr ago": how long a song has rested. */
export const formatPlayedAgo = (playedAt: Date, now: Date): string => {
  const days = Math.max(
    0,
    Math.floor((now.getTime() - playedAt.getTime()) / DAY_MS)
  );
  if (days < WEEK_DAYS) {
    return "This week";
  }
  if (days < MONTH_DAYS * 2) {
    return `${Math.floor(days / WEEK_DAYS)} wk ago`;
  }
  if (days < YEAR_DAYS) {
    return `${Math.floor(days / MONTH_DAYS)} mo ago`;
  }
  return `${Math.floor(days / YEAR_DAYS)} yr ago`;
};

export interface PlanInsights {
  /** Key changes into each song, by the song's item id. */
  transitions: ReadonlyMap<string, KeyTransition>;
  /** Rough key changes worth a second look. */
  keyJumps: number;
  /** Days since each recently repeated song was last played, by item id. */
  recentPlays: ReadonlyMap<string, number>;
}

export const buildPlanInsights = (
  items: readonly PlanItem[],
  planDate: Date | null
): PlanInsights => {
  const transitions = new Map<string, KeyTransition>();
  let keyJumps = 0;
  for (const transition of keyTransitions(items)) {
    transitions.set(transition.toItemId, transition);
    if (transition.level !== "smooth") {
      keyJumps += 1;
    }
  }
  const recentPlays = new Map<string, number>();
  for (const item of items) {
    const days = daysSinceRecentPlay(item, planDate);
    if (days !== null) {
      recentPlays.set(item.id, days);
    }
  }
  return { transitions, keyJumps, recentPlays };
};

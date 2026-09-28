import type { PlanItem } from "@pcobooster/planning-center-models/types";

import { keyName, parseMusicalKey } from "@/lib/key-theory";
import { rateKeyChange } from "@/lib/key-transition-advice";
import type {
  KeyChangeKind,
  KeyTransitionLevel,
  TransitionSongs,
} from "@/lib/key-transition-advice";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Songs played within this many days before the plan count as a repeat. */
export const RECENT_REPEAT_DAYS = 28;
/** A timed item this long between two songs gives the band room to change key. */
export const BRIDGING_ITEM_SECONDS = 60;

export interface KeyTransition extends TransitionSongs {
  fromItemId: string;
  toItemId: string;
  from: string;
  to: string;
  level: KeyTransitionLevel;
  kind: KeyChangeKind;
  description: string;
  /** A timed item between the songs that covers the change, so it isn't flagged. */
  bridgedBy: string | null;
}

const songEndKey = (item: PlanItem) =>
  parseMusicalKey(item.key?.endingKey) ??
  parseMusicalKey(item.key?.startingKey);

/**
 * Key changes between songs that follow each other within a section. A header starts a
 * new section, so a sermon or break between sets never counts, and a timed prayer or
 * reading of a minute or more between two songs covers the change (research, row 0).
 */
export const keyTransitions = (items: readonly PlanItem[]): KeyTransition[] => {
  const transitions: KeyTransition[] = [];
  let previousSong: PlanItem | null = null;
  let bridge: PlanItem | null = null;
  for (const item of items) {
    if (item.itemType === "header") {
      previousSong = null;
      bridge = null;
      continue;
    }
    if (item.itemType !== "song") {
      if ((item.length ?? 0) >= BRIDGING_ITEM_SECONDS) {
        bridge = item;
      }
      continue;
    }
    const fromKey = previousSong === null ? null : songEndKey(previousSong);
    const toKey = parseMusicalKey(item.key?.startingKey);
    if (previousSong !== null && fromKey !== null && toKey !== null) {
      const rating = rateKeyChange(fromKey, toKey);
      transitions.push({
        fromItemId: previousSong.id,
        toItemId: item.id,
        from: keyName(fromKey),
        to: keyName(toKey),
        fromKey,
        toKey,
        fromTitle: previousSong.title || "the last song",
        toTitle: item.title || "the next song",
        level: bridge === null ? rating.level : "smooth",
        kind: rating.kind,
        description: rating.reason,
        bridgedBy: bridge === null ? null : bridge.title || "an item",
      });
    }
    previousSong = item;
    bridge = null;
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

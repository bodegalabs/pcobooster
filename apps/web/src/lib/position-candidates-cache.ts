import {
  planWindowHistoryBatchSchema,
  positionCandidatesSchema,
} from "@pcobooster/contracts/people-schemas";
import type {
  PlanWindowHistoryBatch,
  PositionCandidates,
} from "@pcobooster/contracts/people-schemas";
import { z } from "zod";

import { presentationCacheKey } from "@/lib/presentation-cache";

/**
 * Saved parts of the Assign view's candidate list, so a reload paints the last known list
 * before the live calls return. Schedule writes and account changes clear all of it.
 */
/** Every version's entries; clearing also drops the single-call list's `v1` entries. */
const STORAGE_PREFIX = "pcobooster:people:";
/** v3: deferred window plans carry their roster pages. */
const CACHE_VERSION = "v3";
const KEY_PREFIX = `${STORAGE_PREFIX}${CACHE_VERSION}:`;
const CANDIDATES_KEY_PREFIX = `${KEY_PREFIX}candidates:`;
const WINDOW_HISTORY_KEY = `${KEY_PREFIX}window-history`;
const AVAILABILITY_KEY = `${KEY_PREFIX}availability`;
/** Window histories are about 150 KB each, so only the latest few dates are kept. */
const WINDOW_HISTORY_DATES_KEPT = 3;
/** Availability older than this is dropped when new availability is saved. */
const AVAILABILITY_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface CacheEntry<Data> {
  savedAt: number;
  data: Data;
}

const cachedCandidatesSchema = z.object({
  savedAt: z.number(),
  data: positionCandidatesSchema,
});

const cachedWindowHistorySchema = z.record(
  z.string(),
  z.object({
    savedAt: z.number(),
    data: z.array(planWindowHistoryBatchSchema),
  })
);
type CachedWindowHistory = z.output<typeof cachedWindowHistorySchema>;

const cachedAvailabilitySchema = z.record(
  z.string(),
  z.object({ savedAt: z.number(), isBlockedForDate: z.boolean() })
);
type CachedAvailability = z.output<typeof cachedAvailabilitySchema>;

const readJson = <Value>(
  key: string,
  schema: z.ZodType<Value>
): Value | undefined => {
  const raw = globalThis.window?.localStorage.getItem(
    presentationCacheKey(key)
  );
  if (raw === null || raw === undefined) {
    return undefined;
  }
  const parsed = schema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : undefined;
};

type StoredPayload =
  | CacheEntry<PositionCandidates>
  | CachedWindowHistory
  | CachedAvailability;

const writeJson = (key: string, value: StoredPayload): void => {
  globalThis.window?.localStorage.setItem(
    presentationCacheKey(key),
    JSON.stringify(value)
  );
};

const candidatesKey = (
  serviceTypeId: string,
  teamId: string | null,
  positionId: string,
  planId: string
) =>
  `${CANDIDATES_KEY_PREFIX}${[
    serviceTypeId,
    teamId ?? "none",
    positionId,
    planId,
  ]
    .map(encodeURIComponent)
    .join(":")}`;

export const readCachedPositionCandidates = (
  serviceTypeId: string,
  teamId: string | null,
  positionId: string,
  planId: string
): CacheEntry<PositionCandidates> | undefined => {
  try {
    return readJson(
      candidatesKey(serviceTypeId, teamId, positionId, planId),
      cachedCandidatesSchema
    );
  } catch {
    return undefined;
  }
};

export const writeCachedPositionCandidates = (
  serviceTypeId: string,
  teamId: string | null,
  positionId: string,
  planId: string,
  data: PositionCandidates
): void => {
  try {
    writeJson(candidatesKey(serviceTypeId, teamId, positionId, planId), {
      savedAt: Date.now(),
      data,
    } satisfies CacheEntry<PositionCandidates>);
  } catch {
    // Ignore storage failures (private mode, quota); live queries still load.
  }
};

const readWindowHistoryPayload = (): CachedWindowHistory =>
  readJson(WINDOW_HISTORY_KEY, cachedWindowHistorySchema) ?? {};

export const readCachedPlanWindowHistory = (
  dateKey: string
): CacheEntry<PlanWindowHistoryBatch[]> | undefined => {
  try {
    return readWindowHistoryPayload()[dateKey];
  } catch {
    return undefined;
  }
};

export const writeCachedPlanWindowHistory = (
  dateKey: string,
  data: PlanWindowHistoryBatch[]
): void => {
  try {
    const kept = Object.entries(readWindowHistoryPayload())
      .filter(([key]) => key !== dateKey)
      .toSorted(([, a], [, b]) => b.savedAt - a.savedAt)
      .slice(0, WINDOW_HISTORY_DATES_KEPT - 1);
    writeJson(WINDOW_HISTORY_KEY, {
      ...Object.fromEntries(kept),
      [dateKey]: { savedAt: Date.now(), data },
    } satisfies CachedWindowHistory);
  } catch {
    // Ignore storage failures (private mode, quota); live queries still load.
  }
};

const availabilityKey = (dateKey: string, personId: string) =>
  `${dateKey}|${personId}`;

const readAvailabilityPayload = (): CachedAvailability =>
  readJson(AVAILABILITY_KEY, cachedAvailabilitySchema) ?? {};

/** Saved blocked flags for every one of `personIds` on the date, or nothing if any is missing. */
export const readCachedCandidateAvailability = (
  dateKey: string,
  personIds: readonly string[]
):
  | CacheEntry<{ personId: string; isBlockedForDate: boolean }[]>
  | undefined => {
  try {
    const payload = readAvailabilityPayload();
    const entries = personIds.flatMap((personId) => {
      const entry = payload[availabilityKey(dateKey, personId)];
      return entry === undefined ? [] : [{ personId, ...entry }];
    });
    if (entries.length === 0 || entries.length !== personIds.length) {
      return undefined;
    }
    return {
      savedAt: Math.min(...entries.map(({ savedAt }) => savedAt)),
      data: entries.map(({ personId, isBlockedForDate }) => ({
        personId,
        isBlockedForDate,
      })),
    };
  } catch {
    return undefined;
  }
};

export const writeCachedCandidateAvailability = (
  dateKey: string,
  details: readonly { personId: string; isBlockedForDate: boolean }[]
): void => {
  try {
    const savedAt = Date.now();
    const payload: CachedAvailability = Object.fromEntries(
      Object.entries(readAvailabilityPayload()).filter(
        ([, entry]) => savedAt - entry.savedAt < AVAILABILITY_RETENTION_MS
      )
    );
    for (const { personId, isBlockedForDate } of details) {
      payload[availabilityKey(dateKey, personId)] = {
        savedAt,
        isBlockedForDate,
      };
    }
    writeJson(AVAILABILITY_KEY, payload);
  } catch {
    // Ignore storage failures (private mode, quota); live queries still load.
  }
};

const removeKeys = (matches: (key: string) => boolean): void => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return;
  }
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key !== null && matches(key)) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage failures; live queries still load.
  }
};

/** Everything saved, for account changes. */
export const clearCachedPositionCandidates = (): void => {
  removeKeys((key) => key.startsWith(STORAGE_PREFIX));
};

/** What a schedule write changes: rosters and history. Blockouts stay. */
export const clearCachedCandidateSchedules = (): void => {
  removeKeys(
    (key) => key.startsWith(STORAGE_PREFIX) && !key.startsWith(AVAILABILITY_KEY)
  );
};

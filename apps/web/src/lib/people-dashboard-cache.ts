import {
  peopleDashboardActivitySchema,
  peopleDashboardPersonDetailSchema,
  peopleDashboardRosterSchema,
} from "@pcobooster/contracts/http/people-schemas";
import type {
  PeopleDashboardActivity,
  PeopleDashboardPersonDetail,
  PeopleDashboardRoster,
} from "@pcobooster/contracts/http/people-schemas";
import { Schema } from "effect";

import { presentationCacheKey } from "@/lib/presentation-cache";
import { savedAnswer, storedJson } from "@/lib/stored-json";
import type { StoredJson } from "@/lib/stored-json";

/** Every version's entries, so clearing also drops older versions' saved people. */
const STORAGE_PREFIX = "pcobooster:people-dashboard:";
/** v3: activity and person details carry only the rhythm, roles, and month days. */
const CACHE_VERSION = "v3";
const KEY_PREFIX = `${STORAGE_PREFIX}${CACHE_VERSION}:`;
const PERSON_DETAIL_KEY_PREFIX = `${KEY_PREFIX}person:`;
const ROSTER_KEY = `${KEY_PREFIX}roster`;
const ACTIVITY_KEY = `${KEY_PREFIX}activity`;
/** Activity older than this is dropped when new activity is saved. */
const ACTIVITY_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface PeopleDashboardRosterCacheEntry {
  savedAt: number;
  data: PeopleDashboardRoster;
}

export interface PeopleDashboardActivityCacheEntry {
  savedAt: number;
  data: PeopleDashboardActivity[];
}

export interface PeopleDashboardPersonCacheEntry {
  savedAt: number;
  data: PeopleDashboardPersonDetail;
}

const cachedRosterPayload = savedAnswer(peopleDashboardRosterSchema);

const cachedActivityPayloadSchema = Schema.Record(
  Schema.String,
  Schema.Struct({ savedAt: Schema.Finite, data: peopleDashboardActivitySchema })
);
type CachedActivityPayload = typeof cachedActivityPayloadSchema.Type;
const cachedActivityPayload = storedJson(cachedActivityPayloadSchema);

const cachedPersonDetailPayload = savedAnswer(
  peopleDashboardPersonDetailSchema
);

const buildPersonDetailCacheKey = (
  personId: string,
  month: string | null
): string =>
  presentationCacheKey(
    `${PERSON_DETAIL_KEY_PREFIX}${encodeURIComponent(personId)}:${encodeURIComponent(month ?? "current")}`
  );

/** Reads a stored entry; one that does not decode reads as missing. */
const readStorageEntry = <Entry>(
  key: string,
  stored: StoredJson<Entry>
): Entry | undefined =>
  stored.parse(
    globalThis.window?.localStorage.getItem(presentationCacheKey(key)) ?? null
  );

const writeStorageJson = <Entry>(
  key: string,
  stored: StoredJson<Entry>,
  value: Entry
): void => {
  const saved = stored.stringify(value);
  if (saved !== undefined) {
    globalThis.window?.localStorage.setItem(presentationCacheKey(key), saved);
  }
};

export const readCachedPeopleDashboardRoster = ():
  | PeopleDashboardRosterCacheEntry
  | undefined => {
  try {
    return readStorageEntry(ROSTER_KEY, cachedRosterPayload);
  } catch {
    return undefined;
  }
};

export const writeCachedPeopleDashboardRoster = (
  data: PeopleDashboardRoster
): void => {
  try {
    writeStorageJson(ROSTER_KEY, cachedRosterPayload, {
      savedAt: Date.now(),
      data,
    });
  } catch {
    // Ignore storage failures; query invalidation still refreshes live data.
  }
};

const readActivityPayload = (): CachedActivityPayload =>
  readStorageEntry(ACTIVITY_KEY, cachedActivityPayload) ?? {};

/** Saved activity for every one of `personIds`, or nothing if any is missing. */
export const readCachedPeopleDashboardActivity = (
  personIds: readonly string[]
): PeopleDashboardActivityCacheEntry | undefined => {
  try {
    const payload = readActivityPayload();
    const entries = personIds.map((personId) => payload[personId]);
    const complete = entries.filter((entry) => entry !== undefined);
    if (complete.length === 0 || complete.length !== personIds.length) {
      return undefined;
    }
    return {
      savedAt: Math.min(...complete.map((entry) => entry.savedAt)),
      data: complete.map((entry) => entry.data),
    };
  } catch {
    return undefined;
  }
};

export const writeCachedPeopleDashboardActivity = (
  activities: readonly PeopleDashboardActivity[]
): void => {
  try {
    const savedAt = Date.now();
    const payload: Record<string, CachedActivityPayload[string]> =
      Object.fromEntries(
        Object.entries(readActivityPayload()).filter(
          ([, entry]) => savedAt - entry.savedAt < ACTIVITY_RETENTION_MS
        )
      );
    for (const activity of activities) {
      payload[activity.id] = { savedAt, data: activity };
    }
    writeStorageJson(ACTIVITY_KEY, cachedActivityPayload, payload);
  } catch {
    // Ignore storage failures; query invalidation still refreshes live data.
  }
};

export const readCachedPeopleDashboardPerson = (
  personId: string,
  month: string | null
): PeopleDashboardPersonCacheEntry | undefined => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return undefined;
  }

  try {
    return cachedPersonDetailPayload.parse(
      storage.getItem(buildPersonDetailCacheKey(personId, month))
    );
  } catch {
    return undefined;
  }
};

export const writeCachedPeopleDashboardPerson = (
  personId: string,
  month: string | null,
  data: PeopleDashboardPersonDetail
): void => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return;
  }

  try {
    const saved = cachedPersonDetailPayload.stringify({
      savedAt: Date.now(),
      data,
    });
    if (saved !== undefined) {
      storage.setItem(buildPersonDetailCacheKey(personId, month), saved);
    }
  } catch {
    // Ignore storage failures; query invalidation still refreshes live data.
  }
};

export const clearCachedPeopleDashboards = (): void => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return;
  }

  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(STORAGE_PREFIX) === true) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage read/write failures.
  }
};

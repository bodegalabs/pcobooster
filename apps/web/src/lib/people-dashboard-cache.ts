import {
  peopleDashboardActivitySchema,
  peopleDashboardPersonDetailSchema,
  peopleDashboardRosterSchema,
} from "@pcobooster/contracts/people-schemas";
import type {
  PeopleDashboardActivity,
  PeopleDashboardPersonDetail,
  PeopleDashboardRoster,
} from "@pcobooster/contracts/people-schemas";
import { Schema, Result } from "effect";

import { presentationCacheKey } from "@/lib/presentation-cache";

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

interface CachedPayload<T> {
  savedAt: number;
  data: T;
}

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

const cachedRosterPayloadSchema = Schema.Struct({
  savedAt: Schema.Finite,
  data: peopleDashboardRosterSchema,
});

const cachedActivityPayloadSchema = Schema.Record(
  Schema.String,
  Schema.mutableKey(
    Schema.Struct({
      savedAt: Schema.Finite,
      data: peopleDashboardActivitySchema,
    })
  )
);
type CachedActivityPayload = typeof cachedActivityPayloadSchema.Type;

const cachedPersonDetailPayloadSchema = Schema.Struct({
  savedAt: Schema.Finite,
  data: peopleDashboardPersonDetailSchema,
});

const buildPersonDetailCacheKey = (
  personId: string,
  month: string | null
): string =>
  presentationCacheKey(
    `${PERSON_DETAIL_KEY_PREFIX}${encodeURIComponent(personId)}:${encodeURIComponent(month ?? "current")}`
  );

/** Reads and validates a stored entry; throws only on malformed JSON. */
const readStorageEntry = <S extends Schema.ConstraintDecoder<unknown>>(
  key: string,
  schema: S
): S["Type"] | undefined => {
  const raw = globalThis.window?.localStorage.getItem(
    presentationCacheKey(key)
  );
  if (raw === null || raw === undefined) {
    return undefined;
  }
  const parsed = Schema.decodeUnknownResult(Schema.toCodecJson(schema))(
    JSON.parse(raw)
  );
  return Result.isSuccess(parsed) ? parsed.success : undefined;
};

const writeStorageJson = (
  key: string,
  value: PeopleDashboardRosterCacheEntry | CachedActivityPayload
): void => {
  globalThis.window?.localStorage.setItem(
    presentationCacheKey(key),
    JSON.stringify(value)
  );
};

export const readCachedPeopleDashboardRoster = ():
  | PeopleDashboardRosterCacheEntry
  | undefined => {
  try {
    return readStorageEntry(ROSTER_KEY, cachedRosterPayloadSchema);
  } catch {
    return undefined;
  }
};

export const writeCachedPeopleDashboardRoster = (
  data: PeopleDashboardRoster
): void => {
  try {
    writeStorageJson(ROSTER_KEY, {
      savedAt: Date.now(),
      data,
    } satisfies CachedPayload<PeopleDashboardRoster>);
  } catch {
    // Ignore storage failures; query invalidation still refreshes live data.
  }
};

const readActivityPayload = (): CachedActivityPayload =>
  readStorageEntry(ACTIVITY_KEY, cachedActivityPayloadSchema) ?? {};

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
    const payload: CachedActivityPayload = Object.fromEntries(
      Object.entries(readActivityPayload()).filter(
        ([, entry]) => savedAt - entry.savedAt < ACTIVITY_RETENTION_MS
      )
    );
    for (const activity of activities) {
      payload[activity.id] = { savedAt, data: activity };
    }
    writeStorageJson(ACTIVITY_KEY, payload);
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
    const raw = storage.getItem(buildPersonDetailCacheKey(personId, month));
    if (raw === null) {
      return undefined;
    }
    const parsed = Schema.decodeUnknownResult(
      Schema.toCodecJson(cachedPersonDetailPayloadSchema)
    )(JSON.parse(raw));
    if (Result.isFailure(parsed)) {
      return undefined;
    }
    return parsed.success;
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
    storage.setItem(
      buildPersonDetailCacheKey(personId, month),
      JSON.stringify({
        savedAt: Date.now(),
        data,
      } satisfies CachedPayload<PeopleDashboardPersonDetail>)
    );
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

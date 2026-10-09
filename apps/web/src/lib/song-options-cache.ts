import { songOptionSetSchema } from "@pcobooster/contracts/http/song-schemas";
import type { SongOptionSet } from "@pcobooster/planning-center-models/types";

import { savedAnswer } from "@/lib/stored-json";

const CACHE_VERSION = "v1";
const CACHE_KEY_PREFIX = `pcobooster:song-options:${CACHE_VERSION}:`;

export interface SongOptionsCacheEntry {
  savedAt: number;
  data: SongOptionSet;
}

const cachedPayload = savedAnswer(songOptionSetSchema);

const buildCacheKey = (songId: string, serviceTypeId: string): string =>
  `${CACHE_KEY_PREFIX}${encodeURIComponent(serviceTypeId)}:${encodeURIComponent(songId)}`;

export const readCachedSongOptions = (
  songId: string | null,
  serviceTypeId: string | null
): SongOptionsCacheEntry | undefined => {
  const storage = globalThis.window?.localStorage;
  if (
    songId === null ||
    songId.length === 0 ||
    serviceTypeId === null ||
    serviceTypeId.length === 0 ||
    storage === undefined
  ) {
    return undefined;
  }

  try {
    return cachedPayload.parse(
      storage.getItem(buildCacheKey(songId, serviceTypeId))
    );
  } catch {
    return undefined;
  }
};

export const writeCachedSongOptions = (
  songId: string | null,
  serviceTypeId: string | null,
  optionSet: SongOptionSet
): void => {
  const storage = globalThis.window?.localStorage;
  if (
    songId === null ||
    songId.length === 0 ||
    serviceTypeId === null ||
    serviceTypeId.length === 0 ||
    storage === undefined
  ) {
    return;
  }

  try {
    const saved = cachedPayload.stringify({
      savedAt: Date.now(),
      data: optionSet,
    });
    if (saved !== undefined) {
      storage.setItem(buildCacheKey(songId, serviceTypeId), saved);
    }
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
};

/** Forgets one song's options in every service type, as after its arrangements change. */
export const clearCachedSongOptionsForSong = (songId: string): void => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return;
  }
  const suffix = `:${encodeURIComponent(songId)}`;
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(CACHE_KEY_PREFIX) === true && key.endsWith(suffix)) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage failures; live queries will still fetch Planning Center.
  }
};

export const clearCachedSongOptions = (): void => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return;
  }

  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(CACHE_KEY_PREFIX) === true) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage failures; live queries will still fetch Planning Center.
  }
};

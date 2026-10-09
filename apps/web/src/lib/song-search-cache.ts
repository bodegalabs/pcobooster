import { mutableArray } from "@pcobooster/contracts/http/schema";
import { songCatalogEntrySchema } from "@pcobooster/contracts/http/song-schemas";
import type { SongCatalogEntry } from "@pcobooster/planning-center-models/types";

import { savedAnswer } from "@/lib/stored-json";

// v2: keyed by query only, since the catalog no longer depends on the service type.
const CACHE_VERSION = "v2";
const CACHE_KEY_PREFIX = `pcobooster:song-search:${CACHE_VERSION}:`;

const cachedPayload = savedAnswer(mutableArray(songCatalogEntrySchema));

export interface SongSearchCacheEntry {
  savedAt: number;
  data: SongCatalogEntry[];
}

const normalizeSongSearchQuery = (query: string): string =>
  query.trim().toLowerCase();

const buildCacheKey = (query: string): string =>
  `${CACHE_KEY_PREFIX}${encodeURIComponent(query)}`;

export const readCachedSongSearch = (
  query: string
): SongSearchCacheEntry | undefined => {
  const normalizedQuery = normalizeSongSearchQuery(query);
  const storage = globalThis.window?.localStorage;
  if (normalizedQuery.length === 0 || storage === undefined) {
    return undefined;
  }

  try {
    return cachedPayload.parse(storage.getItem(buildCacheKey(normalizedQuery)));
  } catch {
    return undefined;
  }
};

export const writeCachedSongSearch = (
  query: string,
  songs: SongCatalogEntry[]
): void => {
  const normalizedQuery = normalizeSongSearchQuery(query);
  const storage = globalThis.window?.localStorage;
  if (normalizedQuery.length === 0 || storage === undefined) {
    return;
  }

  try {
    const saved = cachedPayload.stringify({ savedAt: Date.now(), data: songs });
    if (saved !== undefined) {
      storage.setItem(buildCacheKey(normalizedQuery), saved);
    }
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
};

export const clearCachedSongSearch = (): void => {
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
    // Ignore storage failures; live search will still query Planning Center.
  }
};

export { normalizeSongSearchQuery };

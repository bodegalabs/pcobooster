import { peopleSearchResultSchema } from "@pcobooster/contracts/http/people-schemas";
import type { PeopleSearchResult } from "@pcobooster/contracts/http/people-schemas";
import { mutableArray } from "@pcobooster/contracts/http/schema";

import { presentationCacheKey } from "@/lib/presentation-cache";
import { savedAnswer } from "@/lib/stored-json";

const CACHE_VERSION = "v1";
const CACHE_KEY_PREFIX = `pcobooster:people-search:${CACHE_VERSION}:`;

export interface PeopleSearchCacheEntry {
  savedAt: number;
  data: PeopleSearchResult[];
}

const cachedPayload = savedAnswer(mutableArray(peopleSearchResultSchema));

export const normalizePeopleSearchQuery = (query: string): string =>
  query.trim().toLowerCase();

const buildCacheKey = (query: string): string =>
  presentationCacheKey(`${CACHE_KEY_PREFIX}${encodeURIComponent(query)}`);

export const readCachedPeopleSearch = (
  query: string
): PeopleSearchCacheEntry | undefined => {
  const normalizedQuery = normalizePeopleSearchQuery(query);
  const storage = globalThis.window?.localStorage;
  if (normalizedQuery.length < 2 || storage === undefined) {
    return undefined;
  }

  try {
    return cachedPayload.parse(storage.getItem(buildCacheKey(normalizedQuery)));
  } catch {
    return undefined;
  }
};

export const writeCachedPeopleSearch = (
  query: string,
  results: PeopleSearchResult[]
): void => {
  const normalizedQuery = normalizePeopleSearchQuery(query);
  const storage = globalThis.window?.localStorage;
  if (normalizedQuery.length < 2 || storage === undefined) {
    return;
  }

  try {
    const saved = cachedPayload.stringify({
      savedAt: Date.now(),
      data: results,
    });
    if (saved !== undefined) {
      storage.setItem(buildCacheKey(normalizedQuery), saved);
    }
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
};

export const clearCachedPeopleSearch = (): void => {
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

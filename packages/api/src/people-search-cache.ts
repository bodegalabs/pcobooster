import { peopleSearchResultSchema } from "@worship-admin/api/api-schemas";
import { presentationCacheKey } from "@worship-admin/api/presentation-cache";
import type { PeopleSearchResult } from "@worship-admin/api/use-cases/planning-center/search-people";
import { z } from "zod";

const CACHE_VERSION = "v1";
const CACHE_KEY_PREFIX = `worshipadmin:people-search:${CACHE_VERSION}:`;

interface CachedPayload {
  savedAt: number;
  data: PeopleSearchResult[];
}

export interface PeopleSearchCacheEntry {
  savedAt: number;
  data: PeopleSearchResult[];
}

const cachedPayloadSchema = z.object({
  savedAt: z.number(),
  data: z.array(peopleSearchResultSchema),
});

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
    const raw = storage.getItem(buildCacheKey(normalizedQuery));
    if (raw === null) {
      return undefined;
    }
    const parsed = cachedPayloadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return undefined;
    }
    return parsed.data;
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
    storage.setItem(
      buildCacheKey(normalizedQuery),
      JSON.stringify({
        savedAt: Date.now(),
        data: results,
      } satisfies CachedPayload)
    );
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

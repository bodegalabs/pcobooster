import { presentationCacheKey } from "@/lib/presentation-cache";
import type { PeopleSearchResult } from "@/hooks/use-people-search";

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

export function readCachedPeopleSearch(query: string): PeopleSearchCacheEntry | undefined {
  const normalizedQuery = normalizePeopleSearchQuery(query);
  if (normalizedQuery.length < 2 || typeof window === "undefined") return undefined;

  try {
    const raw = window.localStorage.getItem(buildCacheKey(normalizedQuery));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<CachedPayload>;
    if (!parsed || typeof parsed !== "object") return undefined;
    if (typeof parsed.savedAt !== "number") return undefined;
    if (!isPeopleSearchResultArray(parsed.data)) return undefined;

    return {
      savedAt: parsed.savedAt,
      data: parsed.data,
    };
  } catch {
    return undefined;
  }
}

export function writeCachedPeopleSearch(query: string, results: PeopleSearchResult[]) {
  const normalizedQuery = normalizePeopleSearchQuery(query);
  if (normalizedQuery.length < 2 || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      buildCacheKey(normalizedQuery),
      JSON.stringify({
        savedAt: Date.now(),
        data: results,
      } satisfies CachedPayload)
    );
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
}

export function clearCachedPeopleSearch() {
  if (typeof window === "undefined") return;

  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(CACHE_KEY_PREFIX)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage failures; live search will still query Planning Center.
  }
}

export function normalizePeopleSearchQuery(query: string) {
  return query.trim().toLowerCase();
}

function buildCacheKey(query: string) {
  return presentationCacheKey(`${CACHE_KEY_PREFIX}${encodeURIComponent(query)}`);
}

function isPeopleSearchResultArray(value: unknown): value is PeopleSearchResult[] {
  return Array.isArray(value) && value.every(isPeopleSearchResult);
}

function isPeopleSearchResult(value: unknown): value is PeopleSearchResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<PeopleSearchResult>;

  return typeof result.id === "string" &&
    typeof result.firstName === "string" &&
    typeof result.lastName === "string" &&
    typeof result.fullName === "string" &&
    (result.photoThumbnailUrl === null || typeof result.photoThumbnailUrl === "string");
}

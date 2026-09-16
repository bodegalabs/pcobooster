import {
  hydrateSongCatalogEntry,
  type SerializedSongCatalogEntry,
} from "@/lib/song-catalog-client";
import type { SongCatalogEntry } from "@/lib/types";

const CACHE_VERSION = "v1";
const CACHE_KEY_PREFIX = `worshipadmin:song-search:${CACHE_VERSION}:`;

interface CachedPayload {
  savedAt: number;
  data: SerializedSongCatalogEntry[];
}

export interface SongSearchCacheEntry {
  savedAt: number;
  data: SongCatalogEntry[];
}

export function readCachedSongSearch(
  serviceTypeId: string | null,
  query: string
): SongSearchCacheEntry | undefined {
  const normalizedQuery = normalizeSongSearchQuery(query);
  if (!serviceTypeId || !normalizedQuery || typeof window === "undefined")
    return undefined;

  try {
    const raw = window.localStorage.getItem(
      buildCacheKey(serviceTypeId, normalizedQuery)
    );
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<CachedPayload>;
    if (!parsed || typeof parsed !== "object") return undefined;
    if (typeof parsed.savedAt !== "number") return undefined;
    if (!isSerializedSongCatalogEntryArray(parsed.data)) return undefined;

    return {
      savedAt: parsed.savedAt,
      data: parsed.data.map(hydrateSongCatalogEntry),
    };
  } catch {
    return undefined;
  }
}

export function writeCachedSongSearch(
  serviceTypeId: string | null,
  query: string,
  songs: SongCatalogEntry[]
) {
  const normalizedQuery = normalizeSongSearchQuery(query);
  if (!serviceTypeId || !normalizedQuery || typeof window === "undefined")
    return;

  try {
    window.localStorage.setItem(
      buildCacheKey(serviceTypeId, normalizedQuery),
      JSON.stringify({
        savedAt: Date.now(),
        data: songs.map(serializeSongCatalogEntry),
      } satisfies CachedPayload)
    );
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
}

export function clearCachedSongSearch() {
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

export function normalizeSongSearchQuery(query: string) {
  return query.trim().toLowerCase();
}

function buildCacheKey(serviceTypeId: string, query: string) {
  return `${CACHE_KEY_PREFIX}${encodeURIComponent(serviceTypeId)}:${encodeURIComponent(query)}`;
}

function serializeSongCatalogEntry(
  entry: SongCatalogEntry
): SerializedSongCatalogEntry {
  return {
    ...entry,
    lastScheduledAt: entry.lastScheduledAt
      ? entry.lastScheduledAt.toISOString()
      : null,
  };
}

function isSerializedSongCatalogEntryArray(
  value: unknown
): value is SerializedSongCatalogEntry[] {
  return Array.isArray(value) && value.every(isSerializedSongCatalogEntry);
}

function isSerializedSongCatalogEntry(
  value: unknown
): value is SerializedSongCatalogEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<SerializedSongCatalogEntry>;

  return (
    typeof entry.id === "string" &&
    typeof entry.title === "string" &&
    typeof entry.author === "string" &&
    typeof entry.themes === "string" &&
    typeof entry.hidden === "boolean" &&
    isNullableDateLike(entry.lastScheduledAt) &&
    (entry.matchScore === undefined || typeof entry.matchScore === "number")
  );
}

function isNullableDateLike(value: unknown) {
  if (value === null) return true;
  if (typeof value !== "string" && !(value instanceof Date)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

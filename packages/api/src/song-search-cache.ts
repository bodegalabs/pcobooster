import { serializedSongCatalogEntrySchema } from "@worship-admin/api/api-schemas";
import { hydrateSongCatalogEntry } from "@worship-admin/api/song-catalog-client";
import type { SerializedSongCatalogEntry } from "@worship-admin/api/song-catalog-client";
import type { SongCatalogEntry } from "@worship-admin/api/types";
import { z } from "zod";

const CACHE_VERSION = "v1";
const CACHE_KEY_PREFIX = `worshipadmin:song-search:${CACHE_VERSION}:`;

interface CachedPayload {
  savedAt: number;
  data: SerializedSongCatalogEntry[];
}

const cachedPayloadSchema = z.object({
  savedAt: z.number(),
  data: z.array(serializedSongCatalogEntrySchema),
});

export interface SongSearchCacheEntry {
  savedAt: number;
  data: SongCatalogEntry[];
}

const normalizeSongSearchQuery = (query: string): string =>
  query.trim().toLowerCase();

const buildCacheKey = (serviceTypeId: string, query: string): string =>
  `${CACHE_KEY_PREFIX}${encodeURIComponent(serviceTypeId)}:${encodeURIComponent(query)}`;

const serializeSongCatalogEntry = (
  entry: SongCatalogEntry
): SerializedSongCatalogEntry => ({
  ...entry,
  lastScheduledAt:
    entry.lastScheduledAt === null ? null : entry.lastScheduledAt.toISOString(),
});

export const readCachedSongSearch = (
  serviceTypeId: string | null,
  query: string
): SongSearchCacheEntry | undefined => {
  const normalizedQuery = normalizeSongSearchQuery(query);
  const storage = globalThis.window?.localStorage;
  if (
    serviceTypeId === null ||
    serviceTypeId.length === 0 ||
    normalizedQuery.length === 0 ||
    storage === undefined
  ) {
    return undefined;
  }

  try {
    const raw = storage.getItem(buildCacheKey(serviceTypeId, normalizedQuery));
    if (raw === null) {
      return undefined;
    }
    const parsed = cachedPayloadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return undefined;
    }
    return {
      savedAt: parsed.data.savedAt,
      data: parsed.data.data.map(hydrateSongCatalogEntry),
    };
  } catch {
    return undefined;
  }
};

export const writeCachedSongSearch = (
  serviceTypeId: string | null,
  query: string,
  songs: SongCatalogEntry[]
): void => {
  const normalizedQuery = normalizeSongSearchQuery(query);
  const storage = globalThis.window?.localStorage;
  if (
    serviceTypeId === null ||
    serviceTypeId.length === 0 ||
    normalizedQuery.length === 0 ||
    storage === undefined
  ) {
    return;
  }

  try {
    storage.setItem(
      buildCacheKey(serviceTypeId, normalizedQuery),
      JSON.stringify({
        savedAt: Date.now(),
        data: songs.map(serializeSongCatalogEntry),
      } satisfies CachedPayload)
    );
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

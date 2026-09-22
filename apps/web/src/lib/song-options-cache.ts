import type { SongOptionSet } from "@pcobooster/planning-center-models/types";
import { z } from "zod";

import { serializedSongOptionSetSchema } from "@/lib/persistence-schemas";
import { hydrateSongOptionSet } from "@/lib/song-catalog-client";
import type { SerializedSongOptionSet } from "@/lib/song-catalog-client";

const CACHE_VERSION = "v1";
const CACHE_KEY_PREFIX = `pcobooster:song-options:${CACHE_VERSION}:`;

interface CachedPayload {
  savedAt: number;
  data: SerializedSongOptionSet;
}

export interface SongOptionsCacheEntry {
  savedAt: number;
  data: SongOptionSet;
}

const cachedPayloadSchema = z.object({
  savedAt: z.number(),
  data: serializedSongOptionSetSchema,
});

const buildCacheKey = (songId: string, serviceTypeId: string): string =>
  `${CACHE_KEY_PREFIX}${encodeURIComponent(serviceTypeId)}:${encodeURIComponent(songId)}`;

const serializeSongOptionSet = (
  optionSet: SongOptionSet
): SerializedSongOptionSet => ({
  ...optionSet,
  song: {
    ...optionSet.song,
    lastScheduledAt:
      optionSet.song.lastScheduledAt === null
        ? null
        : optionSet.song.lastScheduledAt.toISOString(),
  },
});

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
    const raw = storage.getItem(buildCacheKey(songId, serviceTypeId));
    if (raw === null) {
      return undefined;
    }
    const parsed = cachedPayloadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return undefined;
    }
    return {
      savedAt: parsed.data.savedAt,
      data: hydrateSongOptionSet(parsed.data.data),
    };
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
    storage.setItem(
      buildCacheKey(songId, serviceTypeId),
      JSON.stringify({
        savedAt: Date.now(),
        data: serializeSongOptionSet(optionSet),
      } satisfies CachedPayload)
    );
  } catch {
    // Ignore storage write failures (private mode/quota).
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

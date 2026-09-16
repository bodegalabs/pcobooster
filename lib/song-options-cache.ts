import {
  hydrateSongOptionSet,
  type SerializedSongCatalogEntry,
  type SerializedSongOptionSet,
} from "@/lib/song-catalog-client";
import type {
  ArrangementOption,
  KeyOption,
  LayoutOption,
  SongOptionSet,
} from "@/lib/types";

const CACHE_VERSION = "v1";
const CACHE_KEY_PREFIX = `worshipadmin:song-options:${CACHE_VERSION}:`;

interface CachedPayload {
  savedAt: number;
  data: SerializedSongOptionSet;
}

export interface SongOptionsCacheEntry {
  savedAt: number;
  data: SongOptionSet;
}

export function readCachedSongOptions(
  songId: string | null,
  serviceTypeId: string | null
): SongOptionsCacheEntry | undefined {
  if (!songId || !serviceTypeId || typeof window === "undefined")
    return undefined;

  try {
    const raw = window.localStorage.getItem(
      buildCacheKey(songId, serviceTypeId)
    );
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<CachedPayload>;
    if (!parsed || typeof parsed !== "object") return undefined;
    if (typeof parsed.savedAt !== "number") return undefined;
    if (!isSerializedSongOptionSet(parsed.data)) return undefined;

    return {
      savedAt: parsed.savedAt,
      data: hydrateSongOptionSet(parsed.data),
    };
  } catch {
    return undefined;
  }
}

export function writeCachedSongOptions(
  songId: string | null,
  serviceTypeId: string | null,
  optionSet: SongOptionSet
) {
  if (!songId || !serviceTypeId || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      buildCacheKey(songId, serviceTypeId),
      JSON.stringify({
        savedAt: Date.now(),
        data: serializeSongOptionSet(optionSet),
      } satisfies CachedPayload)
    );
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
}

export function clearCachedSongOptions() {
  if (typeof window === "undefined") return;

  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(CACHE_KEY_PREFIX)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage failures; live queries will still fetch Planning Center.
  }
}

function buildCacheKey(songId: string, serviceTypeId: string) {
  return `${CACHE_KEY_PREFIX}${encodeURIComponent(serviceTypeId)}:${encodeURIComponent(songId)}`;
}

function serializeSongOptionSet(
  optionSet: SongOptionSet
): SerializedSongOptionSet {
  return {
    ...optionSet,
    song: {
      ...optionSet.song,
      lastScheduledAt: optionSet.song.lastScheduledAt
        ? optionSet.song.lastScheduledAt.toISOString()
        : null,
    },
  };
}

function isSerializedSongOptionSet(
  value: unknown
): value is SerializedSongOptionSet {
  if (!value || typeof value !== "object") return false;
  const optionSet = value as Partial<SerializedSongOptionSet>;

  return (
    isSerializedSongCatalogEntry(optionSet.song) &&
    Array.isArray(optionSet.arrangements) &&
    optionSet.arrangements.every(isArrangementOption) &&
    Array.isArray(optionSet.layouts) &&
    optionSet.layouts.every(isLayoutOption) &&
    (optionSet.currentLayout === null ||
      isLayoutOption(optionSet.currentLayout)) &&
    isNullableString(optionSet.suggestedArrangementId) &&
    isNullableString(optionSet.suggestedKeyId) &&
    isNullableString(optionSet.suggestedLayoutId) &&
    (optionSet.layoutMode === "unavailable" ||
      optionSet.layoutMode === "existing-only" ||
      optionSet.layoutMode === "editable")
  );
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

function isArrangementOption(value: unknown): value is ArrangementOption {
  if (!value || typeof value !== "object") return false;
  const arrangement = value as Partial<ArrangementOption>;

  return (
    typeof arrangement.id === "string" &&
    typeof arrangement.name === "string" &&
    Array.isArray(arrangement.sequence) &&
    arrangement.sequence.every((line) => typeof line === "string") &&
    (arrangement.length === null || typeof arrangement.length === "number") &&
    typeof arrangement.archived === "boolean" &&
    Array.isArray(arrangement.keys) &&
    arrangement.keys.every(isKeyOption)
  );
}

function isKeyOption(value: unknown): value is KeyOption {
  if (!value || typeof value !== "object") return false;
  const key = value as Partial<KeyOption>;

  return (
    typeof key.id === "string" &&
    typeof key.name === "string" &&
    isNullableString(key.startingKey) &&
    isNullableString(key.endingKey)
  );
}

function isLayoutOption(value: unknown): value is LayoutOption {
  if (!value || typeof value !== "object") return false;
  const layout = value as Partial<LayoutOption>;

  return typeof layout.id === "string" && typeof layout.name === "string";
}

function isNullableString(value: unknown) {
  return value === null || typeof value === "string";
}

function isNullableDateLike(value: unknown) {
  if (value === null) return true;
  if (typeof value !== "string" && !(value instanceof Date)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

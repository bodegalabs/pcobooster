import type { SongCatalogEntry, SongOptionSet } from "@/lib/types";

export interface SerializedSongCatalogEntry extends Omit<
  SongCatalogEntry,
  "lastScheduledAt"
> {
  lastScheduledAt: string | Date | null;
}

export interface SerializedSongOptionSet extends Omit<SongOptionSet, "song"> {
  song: SerializedSongCatalogEntry;
}

export function parseOptionalDate(
  value: string | Date | null | undefined
): Date | null {
  if (!value) return null;

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function hydrateSongCatalogEntry(
  entry: SerializedSongCatalogEntry
): SongCatalogEntry {
  return {
    ...entry,
    lastScheduledAt: parseOptionalDate(entry.lastScheduledAt),
  };
}

export function hydrateSongOptionSet(
  optionSet: SerializedSongOptionSet
): SongOptionSet {
  return {
    ...optionSet,
    song: hydrateSongCatalogEntry(optionSet.song),
  };
}

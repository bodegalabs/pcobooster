import type { SongCatalogEntry, SongOptionSet } from "@worship-admin/api/types";

export interface SerializedSongCatalogEntry extends Omit<
  SongCatalogEntry,
  "lastScheduledAt"
> {
  lastScheduledAt: string | Date | null;
}

export interface SerializedSongOptionSet extends Omit<SongOptionSet, "song"> {
  song: SerializedSongCatalogEntry;
}

export const parseOptionalDate = (
  value: string | Date | null | undefined
): Date | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const hydrateSongCatalogEntry = (
  entry: SerializedSongCatalogEntry
): SongCatalogEntry => ({
  ...entry,
  lastScheduledAt: parseOptionalDate(entry.lastScheduledAt),
});

export const hydrateSongOptionSet = (
  optionSet: SerializedSongOptionSet
): SongOptionSet => ({
  ...optionSet,
  song: hydrateSongCatalogEntry(optionSet.song),
});

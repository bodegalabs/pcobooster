import { formatCalendarDateLabel } from "@pcobooster/planning-center-models/calendar";
import type {
  SongCatalogEntry,
  SongOptionSet,
} from "@pcobooster/planning-center-models/types";

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

/** "Dec 31, 2026" for the org calendar day a song was last scheduled, or null without a date. */
export const formatSongLastScheduled = (
  value: string | Date | null,
  orgTimeZone: string
): string | null => {
  const date = parseOptionalDate(value);
  return date === null
    ? null
    : formatCalendarDateLabel(date, orgTimeZone, "monthDayYear");
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

import { songCatalogEntrySchema } from "@pcobooster/contracts/song-schemas";
import { z } from "zod";

const requiredId = z.string().trim().min(1);

/** The song catalog is organization-wide, so search takes no service type. */
export const songsSearchInputSchema = z.object({
  query: z.string().trim().min(1),
});

export const songsOptionsInputSchema = z.object({
  serviceTypeId: requiredId,
  songId: requiredId,
});

export const songsSearchOutputSchema = z.array(songCatalogEntrySchema);

export const songsSuggestionsInputSchema = z.object({});

export const songLibraryEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  themes: z.string(),
  /** Null when Planning Center has never scheduled the song. */
  lastScheduledAt: z.date().nullable(),
  createdAt: z.date().nullable(),
});

/** Every visible song in the organization's library, A to Z. */
export const songLibrarySchema = z.object({
  songs: z.array(songLibraryEntrySchema),
  /**
   * The catalog read stopped at its page limit, so songs later in the alphabet are missing.
   * Hidden songs count toward the limit but aren't listed.
   */
  truncated: z.boolean(),
});

export const songsHistoryInputSchema = z.object({ songId: requiredId });

export const songHistoryEntrySchema = z.object({
  planId: z.string().nullable(),
  serviceTypeId: z.string().nullable(),
  serviceTypeName: z.string(),
  sortDate: z.date(),
  keyName: z.string().nullable(),
  startingKey: z.string().nullable(),
  arrangementName: z.string().nullable(),
});

/** Every plan in any service type that scheduled the song over the past year, newest first. */
export const songsHistoryOutputSchema = z.array(songHistoryEntrySchema);

export const songsSuggestionsOutputSchema = z.object({
  /** Played most recently first. */
  recentlyPlayed: z.array(songCatalogEntrySchema),
  /** Played before, but not in the last few months. */
  resting: z.array(songCatalogEntrySchema),
});

export type SongsSearchInput = z.input<typeof songsSearchInputSchema>;
export type SongsOptionsInput = z.input<typeof songsOptionsInputSchema>;
export type SongsSuggestions = z.output<typeof songsSuggestionsOutputSchema>;
export type SongLibraryEntry = z.output<typeof songLibraryEntrySchema>;
export type SongLibrary = z.output<typeof songLibrarySchema>;
export type SongsHistoryInput = z.input<typeof songsHistoryInputSchema>;
export type SongHistoryEntry = z.output<typeof songHistoryEntrySchema>;

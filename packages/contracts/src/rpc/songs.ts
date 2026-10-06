/** Song procedures over Effect RPC. Ported from the zod schemas in `../songs.ts`. */
import { planningCenterGroup } from "@pcobooster/contracts/rpc/group";
import { read } from "@pcobooster/contracts/rpc/procedure";
import { mutableArray, requiredId } from "@pcobooster/contracts/rpc/schema";
import {
  songCatalogEntrySchema,
  songOptionSetSchema,
} from "@pcobooster/contracts/rpc/song-schemas";
import { Schema } from "effect";

/** The song catalog is organization-wide, so search takes no service type. */
export const songsSearchInputSchema = Schema.Struct({ query: requiredId });

export const songsOptionsInputSchema = Schema.Struct({
  serviceTypeId: requiredId,
  songId: requiredId,
});

export const songLibraryEntrySchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  author: Schema.String,
  themes: Schema.String,
  /** Null when Planning Center has never scheduled the song. */
  lastScheduledAt: Schema.NullOr(Schema.Date),
  createdAt: Schema.NullOr(Schema.Date),
});

/** Every visible song in the organization's library, A to Z. */
export const songLibrarySchema = Schema.Struct({
  songs: mutableArray(songLibraryEntrySchema),
  /**
   * The catalog read stopped at its page limit, so songs later in the alphabet are missing.
   * Hidden songs count toward the limit but aren't listed.
   */
  truncated: Schema.Boolean,
});

export const songsHistoryInputSchema = Schema.Struct({ songId: requiredId });

export const songHistoryEntrySchema = Schema.Struct({
  planId: Schema.NullOr(Schema.String),
  serviceTypeId: Schema.NullOr(Schema.String),
  serviceTypeName: Schema.String,
  sortDate: Schema.Date,
  keyName: Schema.NullOr(Schema.String),
  startingKey: Schema.NullOr(Schema.String),
  arrangementName: Schema.NullOr(Schema.String),
});

export const songsSuggestionsOutputSchema = Schema.Struct({
  /** Played most recently first. */
  recentlyPlayed: mutableArray(songCatalogEntrySchema),
  /** Played before, but not in the last few months. */
  resting: mutableArray(songCatalogEntrySchema),
});

export const songsSearch = read("songs.search", {
  payload: songsSearchInputSchema,
  success: mutableArray(songCatalogEntrySchema),
});

export const songsSuggestions = read("songs.suggestions", {
  payload: Schema.Struct({}),
  success: songsSuggestionsOutputSchema,
});

/**
 * The Songs page's library: behind the `chordCharts` flag, though it lives in this namespace.
 * Partial without a cursor (`truncated`). Main's contract takes no input (`.output` only).
 */
export const songsLibrary = read("songs.library", {
  payload: Schema.Void,
  success: songLibrarySchema,
  feature: "chordCharts",
});

/** Every plan in any service type that scheduled the song over the past year, newest first. */
export const songsHistory = read("songs.history", {
  payload: songsHistoryInputSchema,
  success: mutableArray(songHistoryEntrySchema),
});

export const songsOptions = read("songs.options", {
  payload: songsOptionsInputSchema,
  success: songOptionSetSchema,
});

export const songsProcedures = [
  songsSearch,
  songsSuggestions,
  songsLibrary,
  songsHistory,
  songsOptions,
] as const;
export const songsRpc = planningCenterGroup(...songsProcedures);

/** The organization's song catalog, history, and options. */
import { read } from "@pcobooster/contracts/http/endpoint";
import { planningCenterGroup } from "@pcobooster/contracts/http/group";
import { mutableArray, requiredId } from "@pcobooster/contracts/http/schema";
import {
  songCatalogEntrySchema,
  songOptionSetSchema,
} from "@pcobooster/contracts/http/song-schemas";
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

export const songs = planningCenterGroup(
  "songs",
  read("songs.search", "/songs", {
    params: {},
    query: songsSearchInputSchema.fields,
    success: mutableArray(songCatalogEntrySchema),
  }),
  read("songs.suggestions", "/songs/suggestions", {
    params: {},
    query: {},
    success: songsSuggestionsOutputSchema,
  }),
  /**
   * The Songs page's library: behind the `chordCharts` flag, though it lives in this namespace.
   * Partial without a cursor (`truncated`).
   */
  read("songs.library", "/songs/library", {
    params: {},
    query: {},
    success: songLibrarySchema,
    feature: "chordCharts",
  }),
  /** Every plan in any service type that scheduled the song over the past year, newest first. */
  read("songs.history", "/songs/:songId/history", {
    params: songsHistoryInputSchema.fields,
    query: {},
    success: mutableArray(songHistoryEntrySchema),
  }),
  read("songs.options", "/service-types/:serviceTypeId/songs/:songId/options", {
    params: songsOptionsInputSchema.fields,
    query: {},
    success: songOptionSetSchema,
  })
);

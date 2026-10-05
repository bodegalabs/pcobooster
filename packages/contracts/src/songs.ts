import { RpcError } from "@pcobooster/contracts/errors";
import {
  songCatalogEntrySchema,
  songOptionSetSchema,
} from "@pcobooster/contracts/song-schemas";
import { Schema, Struct } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

const requiredId = Schema.Trim.check(Schema.isMinLength(1));

/** The song catalog is organization-wide, so search takes no service type. */
export const songsSearchInputSchema = Schema.Struct({
  query: Schema.Trim.check(Schema.isMinLength(1)),
}).mapFields(Struct.map(Schema.mutableKey));

export const songsOptionsInputSchema = Schema.Struct({
  serviceTypeId: requiredId,
  songId: requiredId,
}).mapFields(Struct.map(Schema.mutableKey));

export const songsSearchOutputSchema = Schema.mutable(
  Schema.Array(songCatalogEntrySchema)
);

export const songsSuggestionsInputSchema = Schema.Struct({}).mapFields(
  Struct.map(Schema.mutableKey)
);

export const songLibraryEntrySchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  author: Schema.String,
  themes: Schema.String,
  /** Null when Planning Center has never scheduled the song. */
  lastScheduledAt: Schema.NullOr(Schema.Date),
  createdAt: Schema.NullOr(Schema.Date),
}).mapFields(Struct.map(Schema.mutableKey));

/** Every visible song in the organization's library, A to Z. */
export const songLibrarySchema = Schema.Struct({
  songs: Schema.mutable(Schema.Array(songLibraryEntrySchema)),
  /**
   * The catalog read stopped at its page limit, so songs later in the alphabet are missing.
   * Hidden songs count toward the limit but aren't listed.
   */
  truncated: Schema.Boolean,
}).mapFields(Struct.map(Schema.mutableKey));

export const songsHistoryInputSchema = Schema.Struct({
  songId: requiredId,
}).mapFields(Struct.map(Schema.mutableKey));

export const songHistoryEntrySchema = Schema.Struct({
  planId: Schema.NullOr(Schema.String),
  serviceTypeId: Schema.NullOr(Schema.String),
  serviceTypeName: Schema.String,
  sortDate: Schema.Date,
  keyName: Schema.NullOr(Schema.String),
  startingKey: Schema.NullOr(Schema.String),
  arrangementName: Schema.NullOr(Schema.String),
}).mapFields(Struct.map(Schema.mutableKey));

/** Every plan in any service type that scheduled the song over the past year, newest first. */
export const songsHistoryOutputSchema = Schema.mutable(
  Schema.Array(songHistoryEntrySchema)
);

export const songsSuggestionsOutputSchema = Schema.Struct({
  /** Played most recently first. */
  recentlyPlayed: Schema.mutable(Schema.Array(songCatalogEntrySchema)),
  /** Played before, but not in the last few months. */
  resting: Schema.mutable(Schema.Array(songCatalogEntrySchema)),
}).mapFields(Struct.map(Schema.mutableKey));

export const songsRpc = RpcGroup.make(
  Rpc.make("songs.search", {
    payload: songsSearchInputSchema,
    success: songsSearchOutputSchema,
    error: RpcError,
  }),
  Rpc.make("songs.suggestions", {
    payload: songsSuggestionsInputSchema,
    success: songsSuggestionsOutputSchema,
    error: RpcError,
  }),
  Rpc.make("songs.library", {
    payload: Schema.Struct({}),
    success: songLibrarySchema,
    error: RpcError,
  }),
  Rpc.make("songs.history", {
    payload: songsHistoryInputSchema,
    success: songsHistoryOutputSchema,
    error: RpcError,
  }),
  Rpc.make("songs.options", {
    payload: songsOptionsInputSchema,
    success: songOptionSetSchema,
    error: RpcError,
  })
);

export type SongsSearchInput = typeof songsSearchInputSchema.Encoded;

export type SongsOptionsInput = typeof songsOptionsInputSchema.Encoded;

export type SongsSuggestions = typeof songsSuggestionsOutputSchema.Type;

export type SongLibraryEntry = typeof songLibraryEntrySchema.Type;

export type SongLibrary = typeof songLibrarySchema.Type;

export type SongsHistoryInput = typeof songsHistoryInputSchema.Encoded;

export type SongHistoryEntry = typeof songHistoryEntrySchema.Type;

/** The organization's song catalog, history, and options. */
import { read } from "@pcobooster/contracts/http/endpoint";
import { planningCenterGroup } from "@pcobooster/contracts/http/group";
import { mutableArray } from "@pcobooster/contracts/rpc/schema";
import {
  songCatalogEntrySchema,
  songOptionSetSchema,
} from "@pcobooster/contracts/rpc/song-schemas";
import {
  songHistoryEntrySchema,
  songLibrarySchema,
  songsHistoryInputSchema,
  songsOptionsInputSchema,
  songsSearchInputSchema,
  songsSuggestionsOutputSchema,
} from "@pcobooster/contracts/rpc/songs";

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

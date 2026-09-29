import { oc } from "@orpc/contract";
import { applicationErrorMap } from "@pcobooster/contracts/errors";
import {
  songCatalogEntrySchema,
  songOptionSetSchema,
} from "@pcobooster/contracts/song-schemas";
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

const songsProcedure = oc.errors({
  UNAUTHORIZED: applicationErrorMap.UNAUTHORIZED,
  FORBIDDEN: applicationErrorMap.FORBIDDEN,
  TOO_MANY_REQUESTS: applicationErrorMap.TOO_MANY_REQUESTS,
  BAD_GATEWAY: applicationErrorMap.BAD_GATEWAY,
  INTERNAL_SERVER_ERROR: applicationErrorMap.INTERNAL_SERVER_ERROR,
});

export const songsContract = {
  search: songsProcedure
    .route({
      method: "GET",
      path: "/songs/search",
      summary: "Search the song catalog",
    })
    .input(songsSearchInputSchema)
    .output(songsSearchOutputSchema),
  suggestions: songsProcedure
    .route({
      method: "GET",
      path: "/songs/suggestions",
      summary: "Suggest recently played and resting songs from the catalog",
    })
    .input(songsSuggestionsInputSchema)
    .output(songsSuggestionsOutputSchema),
  history: songsProcedure
    .route({
      method: "GET",
      path: "/songs/{songId}/history",
      summary: "Read where and when a song was sung across every service",
    })
    .input(songsHistoryInputSchema)
    .output(songsHistoryOutputSchema),
  options: songsProcedure
    .route({
      method: "GET",
      path: "/songs/{songId}/options",
      summary: "Read a song's arrangements, keys, and layout options",
    })
    .input(songsOptionsInputSchema)
    .output(songOptionSetSchema),
};

export type SongsSearchInput = z.input<typeof songsSearchInputSchema>;
export type SongsOptionsInput = z.input<typeof songsOptionsInputSchema>;
export type SongsSuggestions = z.output<typeof songsSuggestionsOutputSchema>;
export type SongsHistoryInput = z.input<typeof songsHistoryInputSchema>;
export type SongHistoryEntry = z.output<typeof songHistoryEntrySchema>;

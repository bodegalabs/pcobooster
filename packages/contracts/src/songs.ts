import { oc } from "@orpc/contract";
import { applicationErrorMap } from "@worship-admin/contracts/errors";
import {
  songCatalogEntrySchema,
  songOptionSetSchema,
} from "@worship-admin/contracts/song-schemas";
import { z } from "zod";

const requiredId = z.string().trim().min(1);

export const songsSearchInputSchema = z.object({
  serviceTypeId: requiredId,
  query: z.string().trim().min(1),
});

export const songsOptionsInputSchema = z.object({
  serviceTypeId: requiredId,
  songId: requiredId,
});

export const songsSearchOutputSchema = z.array(songCatalogEntrySchema);

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
      summary: "Search songs for a service type",
    })
    .input(songsSearchInputSchema)
    .output(songsSearchOutputSchema),
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

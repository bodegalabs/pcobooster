import { callForQuery } from "@pcobooster/client/query";
import type { SongLibrary } from "@pcobooster/contracts/songs";
import { useQuery } from "@tanstack/react-query";
import type { QueryFunctionContext } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { productClient } from "@/product-client";

/** The API caches the catalog for an hour, so a refetch sooner rarely finds anything new. */
const SONG_LIBRARY_STALE_TIME_MS = 10 * 60 * 1000;

export const songLibraryQueryOptions = {
  queryKey: queryKeys.songLibrary(),
  queryFn: async (context: QueryFunctionContext): Promise<SongLibrary> =>
    await callForQuery(context, productClient, (api) => api.songs.library()),
  staleTime: SONG_LIBRARY_STALE_TIME_MS,
};

/** Every visible song in the organization's library. */
export const useSongLibrary = () => useQuery(songLibraryQueryOptions);

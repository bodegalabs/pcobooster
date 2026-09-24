import type { SongCatalogEntry } from "@pcobooster/planning-center-models/types";
import { useQuery } from "@tanstack/react-query";
import type { QueryFunctionContext } from "@tanstack/react-query";
import { useCallback } from "react";

import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import {
  normalizeSongSearchQuery,
  readCachedSongSearch,
  writeCachedSongSearch,
} from "@/lib/song-search-cache";
import { orpc } from "@/orpc-client";

const SONG_SEARCH_STALE_TIME_MS = 5 * 60 * 1000;

export const useSongSearch = (query: string) => {
  const trimmedQuery = normalizeSongSearchQuery(query);
  const queryKey = queryKeys.songSearch(trimmedQuery);
  const readCachedSongs = useCallback(
    () => readCachedSongSearch(trimmedQuery),
    [trimmedQuery]
  );
  useHydrateQueryFromCache(queryKey, readCachedSongs);

  return useQuery<SongCatalogEntry[]>({
    queryKey,
    queryFn: async ({ signal }: QueryFunctionContext) => {
      if (!trimmedQuery) {
        return [];
      }

      const songs = await orpc.songs.search(
        { query: trimmedQuery },
        { signal }
      );
      writeCachedSongSearch(trimmedQuery, songs);
      return songs;
    },
    enabled: trimmedQuery.length > 0,
    placeholderData: (previousSongs) => previousSongs,
    staleTime: SONG_SEARCH_STALE_TIME_MS,
  });
};

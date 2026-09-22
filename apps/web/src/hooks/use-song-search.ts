import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
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

export const useSongSearch = (serviceTypeId: string | null, query: string) => {
  const trimmedQuery = normalizeSongSearchQuery(query);
  const queryKey = queryKeys.songSearch(serviceTypeId, trimmedQuery);
  const readCachedSongs = useCallback(
    () => readCachedSongSearch(serviceTypeId, trimmedQuery),
    [serviceTypeId, trimmedQuery]
  );
  useHydrateQueryFromCache(queryKey, readCachedSongs);

  return useQuery<SongCatalogEntry[]>({
    queryKey,
    queryFn: async ({ signal }: QueryFunctionContext) => {
      if (!isNonEmptyString(serviceTypeId) || !trimmedQuery) {
        return [];
      }

      const songs = await orpc.songs.search(
        { serviceTypeId, query: trimmedQuery },
        { signal }
      );
      writeCachedSongSearch(serviceTypeId, trimmedQuery, songs);
      return songs;
    },
    enabled: isNonEmptyString(serviceTypeId) && trimmedQuery.length > 0,
    placeholderData: (previousSongs) => previousSongs,
    staleTime: SONG_SEARCH_STALE_TIME_MS,
  });
};

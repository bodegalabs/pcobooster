import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { getJson } from "@/lib/http/client";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import {
  hydrateSongCatalogEntry,
  type SerializedSongCatalogEntry,
} from "@/lib/song-catalog-client";
import {
  normalizeSongSearchQuery,
  readCachedSongSearch,
  writeCachedSongSearch,
} from "@/lib/song-search-cache";
import type { SongCatalogEntry } from "@/lib/types";

const SONG_SEARCH_STALE_TIME_MS = 5 * 60 * 1000;

export function useSongSearch(serviceTypeId: string | null, query: string) {
  const trimmedQuery = normalizeSongSearchQuery(query);
  const queryKey = queryKeys.songSearch(serviceTypeId, trimmedQuery);
  const readCachedSongs = useCallback(
    () => readCachedSongSearch(serviceTypeId, trimmedQuery),
    [serviceTypeId, trimmedQuery]
  );
  useHydrateQueryFromCache(queryKey, readCachedSongs);

  return useQuery<SongCatalogEntry[]>({
    queryKey,
    queryFn: async () => {
      if (!serviceTypeId || !trimmedQuery) return [];

      const params = new URLSearchParams({
        service_type_id: serviceTypeId,
        q: trimmedQuery,
      });

      const songs = await getJson<SerializedSongCatalogEntry[]>(
        `/api/songs/search?${params.toString()}`
      );

      const hydratedSongs = songs.map(hydrateSongCatalogEntry);
      writeCachedSongSearch(serviceTypeId, trimmedQuery, hydratedSongs);
      return hydratedSongs;
    },
    enabled: !!serviceTypeId && trimmedQuery.length > 0,
    placeholderData: (previousSongs) => previousSongs,
    staleTime: SONG_SEARCH_STALE_TIME_MS,
  });
}

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { serializedSongCatalogEntrySchema } from "@/lib/api-schemas";
import { getJson } from "@/lib/http/client";
import { isNonEmptyString } from "@/lib/json";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import { hydrateSongCatalogEntry } from "@/lib/song-catalog-client";
import {
  normalizeSongSearchQuery,
  readCachedSongSearch,
  writeCachedSongSearch,
} from "@/lib/song-search-cache";
import type { SongCatalogEntry } from "@/lib/types";

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
    queryFn: async () => {
      if (!isNonEmptyString(serviceTypeId) || !trimmedQuery) {
        return [];
      }

      const params = new URLSearchParams({
        service_type_id: serviceTypeId,
        q: trimmedQuery,
      });

      const songs = await getJson(
        `/api/songs/search?${params.toString()}`,
        serializedSongCatalogEntrySchema.array()
      );

      const hydratedSongs = songs.map(hydrateSongCatalogEntry);
      writeCachedSongSearch(serviceTypeId, trimmedQuery, hydratedSongs);
      return hydratedSongs;
    },
    enabled: isNonEmptyString(serviceTypeId) && trimmedQuery.length > 0,
    placeholderData: (previousSongs) => previousSongs,
    staleTime: SONG_SEARCH_STALE_TIME_MS,
  });
};

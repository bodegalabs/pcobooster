import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { getJson } from "@/lib/http/client";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import {
  hydrateSongOptionSet,
  type SerializedSongOptionSet,
} from "@/lib/song-catalog-client";
import {
  readCachedSongOptions,
  writeCachedSongOptions,
} from "@/lib/song-options-cache";
import type { SongOptionSet } from "@/lib/types";

export function useSongOptions(
  songId: string | null,
  serviceTypeId: string | null
) {
  const queryKey = queryKeys.songOptions(songId, serviceTypeId);
  const readCachedOptions = useCallback(
    () => readCachedSongOptions(songId, serviceTypeId),
    [serviceTypeId, songId]
  );
  useHydrateQueryFromCache(queryKey, readCachedOptions);

  return useQuery<SongOptionSet | null>({
    ...createSongOptionsQueryOptions(songId, serviceTypeId),
    queryKey,
    enabled: !!songId && !!serviceTypeId,
  });
}

export function createSongOptionsQueryOptions(
  songId: string | null,
  serviceTypeId: string | null
) {
  return {
    queryKey: queryKeys.songOptions(songId, serviceTypeId),
    queryFn: async () => {
      if (!songId || !serviceTypeId) return null;

      const params = new URLSearchParams({
        service_type_id: serviceTypeId,
      });

      const optionSet = await getJson<SerializedSongOptionSet>(
        `/api/songs/${songId}/options?${params.toString()}`
      );

      const hydratedOptions = hydrateSongOptionSet(optionSet);
      writeCachedSongOptions(songId, serviceTypeId, hydratedOptions);
      return hydratedOptions;
    },
    placeholderData: (previousOptions: SongOptionSet | null | undefined) =>
      previousOptions,
    staleTime: 5 * 60 * 1000,
  };
}

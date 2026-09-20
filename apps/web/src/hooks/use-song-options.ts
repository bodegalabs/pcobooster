import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { serializedSongOptionSetSchema } from "@/lib/api-schemas";
import { getJson } from "@/lib/http/client";
import { isNonEmptyString } from "@/lib/json";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import { hydrateSongOptionSet } from "@/lib/song-catalog-client";
import {
  readCachedSongOptions,
  writeCachedSongOptions,
} from "@/lib/song-options-cache";
import type { SongOptionSet } from "@/lib/types";

export const createSongOptionsQueryOptions = (
  songId: string | null,
  serviceTypeId: string | null
) => ({
  queryKey: queryKeys.songOptions(songId, serviceTypeId),
  queryFn: async () => {
    if (!isNonEmptyString(songId) || !isNonEmptyString(serviceTypeId)) {
      return null;
    }

    const params = new URLSearchParams({
      service_type_id: serviceTypeId,
    });

    const optionSet = await getJson(
      `/api/songs/${songId}/options?${params.toString()}`,
      serializedSongOptionSetSchema
    );

    const hydratedOptions = hydrateSongOptionSet(optionSet);
    writeCachedSongOptions(songId, serviceTypeId, hydratedOptions);
    return hydratedOptions;
  },
  placeholderData: (previousOptions: SongOptionSet | null | undefined) =>
    previousOptions,
  staleTime: 5 * 60 * 1000,
});

export const useSongOptions = (
  songId: string | null,
  serviceTypeId: string | null
) => {
  const queryKey = queryKeys.songOptions(songId, serviceTypeId);
  const readCachedOptions = useCallback(
    () => readCachedSongOptions(songId, serviceTypeId),
    [serviceTypeId, songId]
  );
  useHydrateQueryFromCache(queryKey, readCachedOptions);

  return useQuery<SongOptionSet | null>({
    ...createSongOptionsQueryOptions(songId, serviceTypeId),
    queryKey,
    enabled: isNonEmptyString(songId) && isNonEmptyString(serviceTypeId),
  });
};

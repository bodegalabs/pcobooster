import { queryKeys } from "@pcobooster/client/query-keys";
import { callForQuery } from "@pcobooster/client/request-priority";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type { SongOptionSet } from "@pcobooster/planning-center-models/types";
import { useQuery } from "@tanstack/react-query";
import type { QueryFunctionContext } from "@tanstack/react-query";
import { useCallback } from "react";

import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import {
  readCachedSongOptions,
  writeCachedSongOptions,
} from "@/lib/song-options-cache";
import { rpc } from "@/rpc-client";

export const createSongOptionsQueryOptions = (
  songId: string | null,
  serviceTypeId: string | null
) => ({
  queryKey: queryKeys.songOptions(songId, serviceTypeId),
  queryFn: async (context: QueryFunctionContext) => {
    if (!isNonEmptyString(songId) || !isNonEmptyString(serviceTypeId)) {
      return null;
    }

    const optionSet = await callForQuery(
      context,
      async (options) =>
        await rpc("songs.options", { songId, serviceTypeId }, options)
    );
    writeCachedSongOptions(songId, serviceTypeId, optionSet);
    return optionSet;
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

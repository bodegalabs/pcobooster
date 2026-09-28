import type { SongsSuggestions } from "@pcobooster/contracts/songs";
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { callForQuery } from "@/lib/request-priority";
import { orpc } from "@/orpc-client";

const SONG_SUGGESTIONS_STALE_TIME_MS = 10 * 60 * 1000;

/** Recently played and resting songs for the plan builder's library, from the cached catalog. */
export const useSongSuggestions = () =>
  useQuery<SongsSuggestions>({
    queryKey: queryKeys.songSuggestions(),
    queryFn: async (context) =>
      await callForQuery(
        context,
        async (options) => await orpc.songs.suggestions({}, options)
      ),
    staleTime: SONG_SUGGESTIONS_STALE_TIME_MS,
  });

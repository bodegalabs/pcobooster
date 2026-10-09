import { callForQuery } from "@pcobooster/client/query";
import type { SongsSuggestions } from "@pcobooster/contracts/http/songs";
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { productClient } from "@/product-client";

const SONG_SUGGESTIONS_STALE_TIME_MS = 10 * 60 * 1000;

/** Recently played and resting songs for the plan builder's library, from the cached catalog. */
export const useSongSuggestions = () =>
  useQuery<SongsSuggestions>({
    queryKey: queryKeys.songSuggestions(),
    queryFn: async (context) =>
      await callForQuery(context, productClient, (api) =>
        api.songs.suggestions()
      ),
    staleTime: SONG_SUGGESTIONS_STALE_TIME_MS,
  });

import { callForQuery } from "@pcobooster/client/query";
import type { SongHistoryEntry } from "@pcobooster/contracts/songs";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { productClient } from "@/product-client";

const SONG_HISTORY_STALE_TIME_MS = 10 * 60 * 1000;

/** Where and when one song was sung across every service, for the song panel's facts. */
export const useSongHistory = (songId: string | null) =>
  useQuery<SongHistoryEntry[]>({
    queryKey: queryKeys.songHistory(songId),
    queryFn: async (context) => {
      if (!isNonEmptyString(songId)) {
        throw new Error("A song is required.");
      }
      return await callForQuery(
        context,
        async (options) =>
          await productClient.call("songs.history", { songId }, options)
      );
    },
    enabled: isNonEmptyString(songId),
    staleTime: SONG_HISTORY_STALE_TIME_MS,
  });

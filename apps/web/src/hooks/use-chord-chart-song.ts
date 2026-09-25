import { ORPCError } from "@orpc/client";
import type {
  ChordChartArrangement,
  ChordChartCreateInput,
  ChordChartSongOutput,
  ChordChartUpdateInput,
  LyricsSearchResult,
} from "@pcobooster/contracts/chord-charts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryFunctionContext } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { orpc } from "@/orpc-client";

/** Editing starts from what Services holds, so the chart is never read from a stale copy. */
export const createChordChartSongQueryOptions = (songId: string) => ({
  queryKey: queryKeys.chordChartSong(songId),
  queryFn: async ({ signal }: QueryFunctionContext) =>
    await orpc.chordCharts.song({ songId }, { signal }),
  staleTime: 30 * 1000,
});

export const useChordChartSong = (songId: string) =>
  useQuery<ChordChartSongOutput>(createChordChartSongQueryOptions(songId));

const replaceArrangement = (
  current: ChordChartSongOutput | undefined,
  arrangement: ChordChartArrangement
): ChordChartSongOutput | undefined => {
  if (current === undefined) {
    return current;
  }
  const exists = current.arrangements.some(
    (candidate) => candidate.id === arrangement.id
  );
  return {
    ...current,
    arrangements: exists
      ? current.arrangements.map((candidate) =>
          candidate.id === arrangement.id ? arrangement : candidate
        )
      : [...current.arrangements, arrangement],
  };
};

export const isChordChartConflict = (error: Error): boolean =>
  error instanceof ORPCError && error.code === "CONFLICT";

/** The API's safe message, or a generic one for network and unexpected failures. */
export const chordChartErrorMessage = (error: Error): string =>
  error instanceof ORPCError && error.message !== ""
    ? error.message
    : "Planning Center did not save the chart. Try again.";

export const useSaveChordChart = (songId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ChordChartUpdateInput) =>
      await orpc.chordCharts.update(input),
    onSuccess: (arrangement) => {
      queryClient.setQueryData<ChordChartSongOutput>(
        queryKeys.chordChartSong(songId),
        (current) => replaceArrangement(current, arrangement)
      );
    },
  });
};

export const useCreateChordChart = (songId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ChordChartCreateInput) =>
      await orpc.chordCharts.create(input),
    onSuccess: (arrangement) => {
      queryClient.setQueryData<ChordChartSongOutput>(
        queryKeys.chordChartSong(songId),
        (current) => replaceArrangement(current, arrangement)
      );
    },
  });
};

/** Lyrics searches reach an outside service, so they run only on submit and stay cached. */
export const useLyricsSearch = (query: string, enabled: boolean) =>
  useQuery<LyricsSearchResult[]>({
    queryKey: queryKeys.lyricsSearch(query),
    queryFn: async ({ signal }: QueryFunctionContext) =>
      await orpc.chordCharts.lyricsSearch({ query }, { signal }),
    enabled: enabled && query.length >= 2,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

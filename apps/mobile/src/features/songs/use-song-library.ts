import { useQueryClient } from "@tanstack/react-query";
import { Option, Schema } from "effect";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Settings } from "react-native";

import { useFeatures } from "../../app-shell/features";
import { useProductClient } from "../../app-shell/queries";
import {
  useVisibleQuery,
  useVisibleReadSignal,
} from "../../app-shell/visible-queries";
import { playHaptic } from "../../design/haptics";
import { useClock, useOrgTimeZone } from "../../lib/environment";
import {
  parseSongLibraryFilter,
  parseSongLibrarySort,
  songLibraryListing,
  songLibrarySummary,
} from "./library";
import type {
  SongLibraryFilter,
  SongLibrarySort,
  SongRowData,
} from "./library";
import {
  prefetchSong,
  recentSongsQuery,
  songChartHref,
  songHref,
  songsReads,
} from "./reads";
import { showSongActions } from "./song-actions";

/** Device preferences (Swift `@SceneStorage("songs.filter")`), not account data. */
const FILTER_KEY = "songs.filter";
const SORT_KEY = "songs.sort";

const decodeStored = Schema.decodeUnknownOption(Schema.String);

/** A stored preference, or null when nothing (or something else) is stored. */
const storedString = (key: string): string | null =>
  Option.getOrNull(decodeStored(Settings.get(key)));

/**
 * The Songs tab's library (Swift `SongLibraryModel`): every visible song from `songs.library`
 * (only with the `chordCharts` flag), filtered, sorted, and searched with the web's rules, plus
 * the songs this device opened recently in this account.
 */
export const useSongLibrary = () => {
  const context = useProductClient();
  const cache = useQueryClient();
  const readSignal = useVisibleReadSignal();
  const router = useRouter();
  const features = useFeatures();
  const timeZone = useOrgTimeZone();
  const clock = useClock();
  // One "now" per visit keeps the list from reshuffling as the clock moves.
  const now = useMemo(() => clock.now(), [clock]);
  const [filter, setFilter] = useState<SongLibraryFilter>(() =>
    parseSongLibraryFilter(storedString(FILTER_KEY))
  );
  const [sort, setSort] = useState<SongLibrarySort>(() =>
    parseSongLibrarySort(storedString(SORT_KEY))
  );
  const [searchText, setSearchText] = useState("");
  const library = useVisibleQuery({
    ...songsReads.library(context),
    enabled: features.chordCharts,
  });
  const recents = useVisibleQuery(recentSongsQuery(context.scope));
  const query = searchText.trim();
  const view = useMemo(() => ({ filter, sort, query }), [filter, sort, query]);
  const songs = library.data?.songs;
  const listing = useMemo(
    () =>
      songs === undefined
        ? null
        : songLibraryListing({
            songs,
            recents: recents.data ?? [],
            view,
            now,
          }),
    [songs, recents.data, view, now]
  );
  const summary = useMemo(
    () =>
      songs === undefined
        ? null
        : songLibrarySummary({ songs, view, now, timeZone }),
    [songs, view, now, timeZone]
  );

  const chooseFilter = (next: SongLibraryFilter) => {
    playHaptic("selection");
    setFilter(next);
    Settings.set({ [FILTER_KEY]: next });
  };
  const chooseSort = (next: SongLibrarySort) => {
    playHaptic("selection");
    setSort(next);
    Settings.set({ [SORT_KEY]: next });
  };
  const open = (songId: string) => {
    router.push(songHref(songId));
  };
  const openChart = (songId: string) => {
    router.push(songChartHref(songId));
  };
  const showActions = (row: SongRowData) => {
    // A deliberate long press is clear intent to look at the song.
    void prefetchSong(
      cache,
      context,
      row.id,
      features.chordCharts,
      readSignal()
    );
    showSongActions({
      title: row.title,
      songId: row.id,
      chartsEnabled: features.chordCharts,
      tidying: filter !== "all",
      onOpen: () => {
        open(row.id);
      },
      onChart: () => {
        openChart(row.id);
      },
    });
  };

  return {
    features,
    library,
    listing,
    summary,
    now,
    filter,
    sort,
    query,
    searchText,
    setSearchText,
    chooseFilter,
    chooseSort,
    open,
    showActions,
    isTidying: filter !== "all",
    isSearching: query !== "",
    refresh: async () => {
      await library.refetch();
    },
  };
};

export type SongLibraryModel = ReturnType<typeof useSongLibrary>;

import {
  addChordChartSong,
  commitChordChartSave,
  createChordChart,
  prepareChordChartSave,
  readChordChartPdf,
  readChordChartSong,
  searchChordChartLyrics,
} from "@pcobooster/api/application/chord-charts";
import {
  getRunSheetSongHistory,
  getRunSheetSongOptions,
  searchRunSheetSongs,
  suggestRunSheetSongs,
} from "@pcobooster/api/application/run-sheet";
import { readSongLibrary } from "@pcobooster/api/application/song-library";
import { preparedWrite } from "@pcobooster/api/rpc/write";
import { ProductApi } from "@pcobooster/contracts/http/api";
import { Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

export const SongHandlers = Layer.mergeAll(
  HttpApiBuilder.group(ProductApi, "songs", (handlers) =>
    handlers
      .handle("songs.search", ({ query }) => searchRunSheetSongs(query))
      .handle("songs.suggestions", () => suggestRunSheetSongs())
      .handle("songs.library", () => readSongLibrary())
      .handle("songs.history", ({ params }) => getRunSheetSongHistory(params))
      .handle("songs.options", ({ params }) => getRunSheetSongOptions(params))
  ),
  HttpApiBuilder.group(ProductApi, "chordCharts", (handlers) =>
    handlers
      .handle("chordCharts.song", ({ params }) => readChordChartSong(params))
      .handle("chordCharts.update", ({ params, payload }) =>
        preparedWrite(
          prepareChordChartSave({ ...params, ...payload }),
          commitChordChartSave
        )
      )
      .handle("chordCharts.create", ({ params, payload }) =>
        createChordChart({ ...params, ...payload })
      )
      .handle("chordCharts.createSong", ({ payload }) =>
        addChordChartSong(payload)
      )
      .handle("chordCharts.pdf", ({ params, query }) =>
        readChordChartPdf({ ...params, ...query })
      )
      .handle("chordCharts.lyricsSearch", ({ query }) =>
        searchChordChartLyrics(query)
      )
  )
);

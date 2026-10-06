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
import { chordChartsRpc } from "@pcobooster/contracts/rpc/chord-charts";
import { songsRpc } from "@pcobooster/contracts/rpc/songs";
import { Layer } from "effect";

export const SongHandlers = Layer.mergeAll(
  songsRpc.toLayer({
    "songs.search": searchRunSheetSongs,
    "songs.suggestions": () => suggestRunSheetSongs(),
    "songs.library": () => readSongLibrary(),
    "songs.history": getRunSheetSongHistory,
    "songs.options": getRunSheetSongOptions,
  }),
  chordChartsRpc.toLayer({
    "chordCharts.song": readChordChartSong,
    "chordCharts.update": (input) =>
      preparedWrite(prepareChordChartSave(input), commitChordChartSave),
    "chordCharts.create": createChordChart,
    "chordCharts.createSong": addChordChartSong,
    "chordCharts.pdf": readChordChartPdf,
    "chordCharts.lyricsSearch": (input) => searchChordChartLyrics(input),
  })
);

import {
  addChordChartSong,
  commitChordChartSave,
  createChordChart,
  prepareChordChartSave,
  readChordChartPdf,
  readChordChartSong,
  searchChordChartLyrics,
} from "@pcobooster/api/application/chord-charts";
import { withPlanningCenterAccess } from "@pcobooster/api/application/planning-center-access";
import { executeApplicationEffect } from "@pcobooster/api/transport/rpc/execute";
import { defineHandler } from "@pcobooster/api/transport/rpc/implementation";
import { executePreparedPlanningCenterWrite } from "@pcobooster/api/transport/rpc/planning-center-write";

const song = defineHandler(
  "chordCharts.song",
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      withPlanningCenterAccess(readChordChartSong(input)),
      context,
      signal
    )
);

const update = defineHandler(
  "chordCharts.update",
  async ({ input, context, signal }) =>
    await executePreparedPlanningCenterWrite(
      context,
      signal,
      prepareChordChartSave(input),
      commitChordChartSave
    )
);

const create = defineHandler(
  "chordCharts.create",
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      withPlanningCenterAccess(createChordChart(input)),
      context,
      signal,
      { interruptOnAbort: false }
    )
);

const lyricsSearch = defineHandler(
  "chordCharts.lyricsSearch",
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      withPlanningCenterAccess(searchChordChartLyrics(input)),
      context,
      signal
    )
);

const pdf = defineHandler(
  "chordCharts.pdf",
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      withPlanningCenterAccess(readChordChartPdf(input)),
      context,
      signal
    )
);

const createSong = defineHandler(
  "chordCharts.createSong",
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      withPlanningCenterAccess(addChordChartSong(input)),
      context,
      signal,
      { interruptOnAbort: false }
    )
);

export const chordChartsRouter = {
  song,
  update,
  create,
  createSong,
  pdf,
  lyricsSearch,
};

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
import { executeApplicationEffect } from "@pcobooster/api/transport/orpc/execute";
import { rpc } from "@pcobooster/api/transport/orpc/implementation";
import { executePreparedPlanningCenterWrite } from "@pcobooster/api/transport/orpc/planning-center-write";

const song = rpc.chordCharts.song.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      withPlanningCenterAccess(readChordChartSong(input)),
      context,
      signal
    )
);

const update = rpc.chordCharts.update.handler(
  async ({ input, context, signal }) =>
    await executePreparedPlanningCenterWrite(
      context,
      signal,
      prepareChordChartSave(input),
      commitChordChartSave
    )
);

const create = rpc.chordCharts.create.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      withPlanningCenterAccess(createChordChart(input)),
      context,
      signal,
      { interruptOnAbort: false }
    )
);

const lyricsSearch = rpc.chordCharts.lyricsSearch.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      withPlanningCenterAccess(searchChordChartLyrics(input)),
      context,
      signal
    )
);

const pdf = rpc.chordCharts.pdf.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      withPlanningCenterAccess(readChordChartPdf(input)),
      context,
      signal
    )
);

const createSong = rpc.chordCharts.createSong.handler(
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

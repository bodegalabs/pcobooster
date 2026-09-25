import {
  commitChordChartSave,
  createChordChart,
  prepareChordChartSave,
  readChordChartSong,
  searchChordChartLyrics,
} from "@pcobooster/api/application/chord-charts";
import { withPlanningCenterAccess } from "@pcobooster/api/application/planning-center-access";
import { executeApplicationEffect } from "@pcobooster/api/transport/orpc/execute";
import {
  applicationRuntime,
  rpc,
} from "@pcobooster/api/transport/orpc/implementation";
import { executePreparedPlanningCenterWrite } from "@pcobooster/api/transport/orpc/planning-center-write";

const song = rpc.chordCharts.song.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(readChordChartSong(input)),
      context,
      signal
    )
);

const update = rpc.chordCharts.update.handler(
  async ({ input, context, signal }) =>
    await executePreparedPlanningCenterWrite(
      applicationRuntime,
      context,
      signal,
      prepareChordChartSave(input),
      commitChordChartSave
    )
);

const create = rpc.chordCharts.create.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(createChordChart(input)),
      context,
      signal,
      { interruptOnAbort: false }
    )
);

const lyricsSearch = rpc.chordCharts.lyricsSearch.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(searchChordChartLyrics(input)),
      context,
      signal
    )
);

export const chordChartsRouter = { song, update, create, lyricsSearch };

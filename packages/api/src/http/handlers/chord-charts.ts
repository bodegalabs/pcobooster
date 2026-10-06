import { readChordChartSong } from "@pcobooster/api/application/chord-charts";
import { ProductApi } from "@pcobooster/contracts/http/api";
import { HttpApiBuilder } from "effect/unstable/httpapi";

export const ChordChartsHttpHandlers = HttpApiBuilder.group(
  ProductApi,
  "chordCharts",
  (handlers) =>
    handlers.handle("song", ({ params }) => readChordChartSong(params))
);

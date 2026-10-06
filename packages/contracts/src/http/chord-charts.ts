/** Chord chart endpoints, all behind the `chordCharts` flag. Spike scope: one song's charts. */
import { read } from "@pcobooster/contracts/http/endpoint";
import { PlanningCenterSession } from "@pcobooster/contracts/http/planning-center-session";
import { ProcedureScope } from "@pcobooster/contracts/http/procedure-scope";
import {
  chordChartSongInputSchema,
  chordChartSongOutputSchema,
} from "@pcobooster/contracts/rpc/chord-charts";
import { HttpApiGroup } from "effect/unstable/httpapi";

export const chordChartsSong = read("song", "/songs/:songId/chord-charts", {
  params: chordChartSongInputSchema.fields,
  query: {},
  success: chordChartSongOutputSchema,
  feature: "chordCharts",
});

export const chordChartsApi = HttpApiGroup.make("chordCharts")
  .add(chordChartsSong.endpoint)
  .middleware(PlanningCenterSession)
  .middleware(ProcedureScope);

export const chordChartsWireApi = HttpApiGroup.make("chordCharts")
  .add(chordChartsSong.wire)
  .middleware(PlanningCenterSession)
  .middleware(ProcedureScope);

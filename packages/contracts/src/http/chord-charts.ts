/** Chord charts and lyrics, all behind the `chordCharts` flag. */
import { read, write } from "@pcobooster/contracts/http/endpoint";
import { planningCenterGroup } from "@pcobooster/contracts/http/group";
import {
  chordChartArrangementSchema,
  chordChartCreateInputSchema,
  chordChartPdfInputSchema,
  chordChartPdfOutputSchema,
  chordChartSongCreateInputSchema,
  chordChartSongInputSchema,
  chordChartSongOutputSchema,
  chordChartUpdateInputSchema,
  lyricsSearchInputSchema,
  lyricsSearchResultSchema,
} from "@pcobooster/contracts/rpc/chord-charts";
import { mutableArray } from "@pcobooster/contracts/rpc/schema";
import { Struct } from "effect";

const ARRANGEMENT = ["songId", "arrangementId"] as const;

export const chordCharts = planningCenterGroup(
  "chordCharts",
  read("chordCharts.song", "/songs/:songId/chord-charts", {
    params: chordChartSongInputSchema.fields,
    query: {},
    success: chordChartSongOutputSchema,
    feature: "chordCharts",
  }),
  /** A prepared write: the conflict check may stop on disconnect; the save always finishes. */
  write.patch(
    "chordCharts.update",
    "/songs/:songId/arrangements/:arrangementId/chord-chart",
    {
      params: Struct.pick(chordChartUpdateInputSchema.fields, ARRANGEMENT),
      payload: Struct.omit(chordChartUpdateInputSchema.fields, ARRANGEMENT),
      success: chordChartArrangementSchema,
      feature: "chordCharts",
    }
  ),
  write.post("chordCharts.create", "/songs/:songId/arrangements", {
    params: Struct.pick(chordChartCreateInputSchema.fields, ["songId"]),
    payload: Struct.omit(chordChartCreateInputSchema.fields, ["songId"]),
    success: chordChartArrangementSchema,
    feature: "chordCharts",
  }),
  write.post("chordCharts.createSong", "/songs", {
    params: {},
    payload: chordChartSongCreateInputSchema.fields,
    success: chordChartSongOutputSchema,
    feature: "chordCharts",
  }),
  read("chordCharts.pdf", "/songs/:songId/arrangements/:arrangementId/pdf", {
    params: Struct.pick(chordChartPdfInputSchema.fields, ARRANGEMENT),
    query: Struct.omit(chordChartPdfInputSchema.fields, ARRANGEMENT),
    success: chordChartPdfOutputSchema,
    feature: "chordCharts",
  }),
  read("chordCharts.lyricsSearch", "/lyrics", {
    params: {},
    query: lyricsSearchInputSchema.fields,
    success: mutableArray(lyricsSearchResultSchema),
    feature: "chordCharts",
  })
);

/** Chord chart procedures over Effect RPC. Ported from the zod schemas in `../chord-charts.ts`. */
import {
  CHORD_CHART_CHORD_COLORS,
  CHORD_CHART_FONT_SIZES,
  CHORD_CHART_MARGINS,
  CHORD_CHART_MAX_COLUMNS,
  CHORD_CHART_ORIENTATIONS,
  CHORD_CHART_PAGE_SIZES,
} from "@pcobooster/contracts/chord-charts";
import { planningCenterGroup } from "@pcobooster/contracts/rpc/group";
import { read, write } from "@pcobooster/contracts/rpc/procedure";
import {
  finiteNumber,
  integer,
  mutableArray,
  requiredId,
} from "@pcobooster/contracts/rpc/schema";
import { keyOptionSchema } from "@pcobooster/contracts/rpc/song-schemas";
import { Schema, Struct } from "effect";

const NAME_MAX_LENGTH = 255;
const LYRICS_QUERY_MIN_LENGTH = 2;
const LYRICS_QUERY_MAX_LENGTH = 200;

const fontSizeSchema = integer.check(
  Schema.makeFilter((size: number) =>
    CHORD_CHART_FONT_SIZES.some((allowed) => allowed === size)
      ? undefined
      : "Font size must be one Services offers"
  )
);

/** Print settings Services stores beside the chart and uses for its PDFs. */
export const chordChartLayoutSchema = Schema.Struct({
  font: Schema.NullOr(Schema.String),
  fontSize: Schema.NullOr(fontSizeSchema),
  columns: Schema.NullOr(
    integer.check(
      Schema.isGreaterThanOrEqualTo(1),
      Schema.isLessThanOrEqualTo(CHORD_CHART_MAX_COLUMNS)
    )
  ),
  chordColor: Schema.NullOr(
    integer.check(
      Schema.isGreaterThanOrEqualTo(0),
      Schema.isLessThanOrEqualTo(CHORD_CHART_CHORD_COLORS.length - 1)
    )
  ),
  pageSize: Schema.NullOr(Schema.Literals(CHORD_CHART_PAGE_SIZES)),
  orientation: Schema.NullOr(Schema.Literals(CHORD_CHART_ORIENTATIONS)),
  margin: Schema.NullOr(Schema.Literals(CHORD_CHART_MARGINS)),
});

export const chordChartArrangementSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  archived: Schema.Boolean,
  /** Lyrics & Chords text in Services' ChordPro-based format. */
  chordChart: Schema.String,
  /** The key the chords are written in. */
  chordChartKey: Schema.NullOr(Schema.String),
  /** Lyrics Services derives from the chart, used to start a new chart from lyrics only. */
  lyrics: Schema.String,
  keys: mutableArray(keyOptionSchema),
  layout: chordChartLayoutSchema,
  updatedAt: Schema.NullOr(Schema.String),
});

export const chordChartSongSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  author: Schema.String,
});

export const chordChartSongOutputSchema = Schema.Struct({
  song: chordChartSongSchema,
  arrangements: mutableArray(chordChartArrangementSchema),
});

export const chordChartSongInputSchema = Schema.Struct({ songId: requiredId });

/** `chordChartLayoutSchema.partial()`: any subset of the settings. */
const chordChartLayoutChangesSchema = chordChartLayoutSchema.mapFields(
  Struct.map(Schema.optional)
);

const chordChartEditFields = {
  chordChart: Schema.String,
  chordChartKey: Schema.NullOr(requiredId),
  layout: Schema.optional(chordChartLayoutChangesSchema),
};

export const chordChartUpdateInputSchema = Schema.Struct({
  ...chordChartEditFields,
  songId: requiredId,
  arrangementId: requiredId,
  /** The `updatedAt` the edit started from; a newer arrangement is a conflict. */
  baseUpdatedAt: Schema.NullOr(Schema.String),
});

export const chordChartCreateInputSchema = Schema.Struct({
  ...chordChartEditFields,
  songId: requiredId,
  name: Schema.Trim.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(NAME_MAX_LENGTH)
  ),
});

export const chordChartSongCreateInputSchema = Schema.Struct({
  /** A title, or a CCLI number for Services to fill in the song from SongSelect. */
  title: Schema.Trim.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(NAME_MAX_LENGTH)
  ),
  author: Schema.optional(
    Schema.Trim.check(Schema.isMaxLength(NAME_MAX_LENGTH))
  ),
  copyright: Schema.optional(
    Schema.Trim.check(Schema.isMaxLength(NAME_MAX_LENGTH))
  ),
  ccliNumber: Schema.optional(integer.check(Schema.isGreaterThan(0))),
});

/** A chart Services renders: one of the arrangement's keys, or its lyrics sheet. */
export const chordChartPdfInputSchema = Schema.Struct({
  songId: requiredId,
  arrangementId: requiredId,
  /** The arrangement key to render chords in; absent for the lyrics sheet. */
  keyId: Schema.optional(requiredId),
});

export const chordChartPdfOutputSchema = Schema.Struct({
  /** The PDF Services rendered, base64 encoded. */
  data: Schema.String,
});

/** A song's lyrics found by a web search, to start a chart from. */
export const lyricsSearchResultSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  artist: Schema.String,
  album: Schema.NullOr(Schema.String),
  durationSeconds: Schema.NullOr(finiteNumber),
  lyrics: Schema.String,
});

export const lyricsSearchInputSchema = Schema.Struct({
  query: Schema.Trim.check(
    Schema.isMinLength(LYRICS_QUERY_MIN_LENGTH),
    Schema.isMaxLength(LYRICS_QUERY_MAX_LENGTH)
  ),
});

export const chordChartsSong = read("chordCharts.song", {
  payload: chordChartSongInputSchema,
  success: chordChartSongOutputSchema,
  feature: "chordCharts",
});

/** A prepared write: the conflict check may stop on disconnect; the save always finishes. */
export const chordChartsUpdate = write("chordCharts.update", {
  payload: chordChartUpdateInputSchema,
  success: chordChartArrangementSchema,
  feature: "chordCharts",
});

export const chordChartsCreate = write("chordCharts.create", {
  payload: chordChartCreateInputSchema,
  success: chordChartArrangementSchema,
  feature: "chordCharts",
});

export const chordChartsCreateSong = write("chordCharts.createSong", {
  payload: chordChartSongCreateInputSchema,
  success: chordChartSongOutputSchema,
  feature: "chordCharts",
});

export const chordChartsPdf = read("chordCharts.pdf", {
  payload: chordChartPdfInputSchema,
  success: chordChartPdfOutputSchema,
  feature: "chordCharts",
});

export const chordChartsLyricsSearch = read("chordCharts.lyricsSearch", {
  payload: lyricsSearchInputSchema,
  success: mutableArray(lyricsSearchResultSchema),
  feature: "chordCharts",
});

export const chordChartsProcedures = [
  chordChartsSong,
  chordChartsUpdate,
  chordChartsCreate,
  chordChartsCreateSong,
  chordChartsPdf,
  chordChartsLyricsSearch,
] as const;
export const chordChartsRpc = planningCenterGroup(...chordChartsProcedures);

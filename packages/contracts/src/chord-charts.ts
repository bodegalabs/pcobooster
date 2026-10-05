import { RpcError } from "@pcobooster/contracts/errors";
import { keyOptionSchema } from "@pcobooster/contracts/song-schemas";
import { Schema, Struct } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

const requiredId = Schema.Trim.check(Schema.isMinLength(1));

/** Font sizes Services accepts for `chord_chart_font_size`. */
export const CHORD_CHART_FONT_SIZES = [
  10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 32, 36, 42, 48,
] as const;

export const CHORD_CHART_PAGE_SIZES = [
  "Letter",
  "A4",
  "Legal",
  "11x17",
  "Widescreen (16x9)",
  "Fullscreen (4x3)",
] as const;

export const CHORD_CHART_ORIENTATIONS = ["Portrait", "Landscape"] as const;

export const CHORD_CHART_MARGINS = [
  "0.0in",
  "0.25in",
  "0.5in",
  "0.75in",
  "1.0in",
] as const;

/** Services lays charts out in one or two columns. */
export const CHORD_CHART_MAX_COLUMNS = 2;

/** Fonts Services' Formatting dialog offers, stored in `chord_chart_font` by value. */
export const CHORD_CHART_FONTS = [
  { value: "Helvetica", label: "Arial, Helvetica" },
  { value: "Courier", label: "Courier, Monospaced" },
  { value: "Monaco", label: "Monaco, Monospaced" },
  { value: "Times-Roman", label: "Times New Roman" },
  { value: "Noto Sans", label: "Noto Sans (International)" },
] as const;

/** Chord colors in Services' order; `chord_chart_chord_color` stores the index. */
export const CHORD_CHART_CHORD_COLORS = [
  "Black",
  "Blue",
  "Green",
  "Orange",
  "Purple",
  "Red",
] as const;

const fontSizeSchema = Schema.Finite.check(Schema.isInt()).check(
  Schema.makeFilter(
    (size) => CHORD_CHART_FONT_SIZES.some((allowed) => allowed === size),
    { message: "Font size must be one Services offers" }
  )
);

/** Print settings Services stores beside the chart and uses for its PDFs. */
export const chordChartLayoutSchema = Schema.Struct({
  font: Schema.NullOr(Schema.String),
  fontSize: Schema.NullOr(fontSizeSchema),
  columns: Schema.NullOr(
    Schema.Finite.check(Schema.isInt())
      .check(Schema.isGreaterThanOrEqualTo(1))
      .check(Schema.isLessThanOrEqualTo(CHORD_CHART_MAX_COLUMNS))
  ),
  chordColor: Schema.NullOr(
    Schema.Finite.check(Schema.isInt())
      .check(Schema.isGreaterThanOrEqualTo(0))
      .check(Schema.isLessThanOrEqualTo(CHORD_CHART_CHORD_COLORS.length - 1))
  ),
  pageSize: Schema.NullOr(Schema.Literals(CHORD_CHART_PAGE_SIZES)),
  orientation: Schema.NullOr(Schema.Literals(CHORD_CHART_ORIENTATIONS)),
  margin: Schema.NullOr(Schema.Literals(CHORD_CHART_MARGINS)),
}).mapFields(Struct.map(Schema.mutableKey));

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
  keys: Schema.mutable(Schema.Array(keyOptionSchema)),
  layout: chordChartLayoutSchema,
  updatedAt: Schema.NullOr(Schema.String),
}).mapFields(Struct.map(Schema.mutableKey));

export const chordChartSongSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  author: Schema.String,
}).mapFields(Struct.map(Schema.mutableKey));

export const chordChartSongOutputSchema = Schema.Struct({
  song: chordChartSongSchema,
  arrangements: Schema.mutable(Schema.Array(chordChartArrangementSchema)),
}).mapFields(Struct.map(Schema.mutableKey));

export const chordChartSongInputSchema = Schema.Struct({
  songId: requiredId,
}).mapFields(Struct.map(Schema.mutableKey));

const chordChartEditSchema = Schema.Struct({
  chordChart: Schema.String,
  chordChartKey: Schema.NullOr(Schema.Trim.check(Schema.isMinLength(1))),
  layout: Schema.optional(
    chordChartLayoutSchema.mapFields(Struct.map(Schema.optional))
  ),
}).mapFields(Struct.map(Schema.mutableKey));

export const chordChartUpdateInputSchema = Schema.Struct({
  ...chordChartEditSchema.fields,
  songId: requiredId,
  arrangementId: requiredId,
  baseUpdatedAt: Schema.NullOr(Schema.String),
}).mapFields(Struct.map(Schema.mutableKey));

export const chordChartCreateInputSchema = Schema.Struct({
  ...chordChartEditSchema.fields,
  songId: requiredId,
  name: Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(255)),
}).mapFields(Struct.map(Schema.mutableKey));

export const chordChartSongCreateInputSchema = Schema.Struct({
  /** A title, or a CCLI number for Services to fill in the song from SongSelect. */
  title: Schema.Trim.check(Schema.isMinLength(1)).check(
    Schema.isMaxLength(255)
  ),
  author: Schema.optional(Schema.Trim.check(Schema.isMaxLength(255))),
  copyright: Schema.optional(Schema.Trim.check(Schema.isMaxLength(255))),
  ccliNumber: Schema.optional(
    Schema.Finite.check(Schema.isInt()).check(Schema.isGreaterThan(0))
  ),
}).mapFields(Struct.map(Schema.mutableKey));

/** A chart Services renders: one of the arrangement's keys, or its lyrics sheet. */
export const chordChartPdfInputSchema = Schema.Struct({
  songId: requiredId,
  arrangementId: requiredId,
  /** The arrangement key to render chords in; absent for the lyrics sheet. */
  keyId: Schema.optional(requiredId),
}).mapFields(Struct.map(Schema.mutableKey));

export const chordChartPdfOutputSchema = Schema.Struct({
  /** The PDF Services rendered, base64 encoded. */
  data: Schema.String,
}).mapFields(Struct.map(Schema.mutableKey));

/** A song's lyrics found by a web search, to start a chart from. */
export const lyricsSearchResultSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  artist: Schema.String,
  album: Schema.NullOr(Schema.String),
  durationSeconds: Schema.NullOr(Schema.Finite),
  lyrics: Schema.String,
}).mapFields(Struct.map(Schema.mutableKey));

export const lyricsSearchInputSchema = Schema.Struct({
  query: Schema.Trim.check(Schema.isMinLength(2)).check(
    Schema.isMaxLength(200)
  ),
}).mapFields(Struct.map(Schema.mutableKey));

export const lyricsSearchOutputSchema = Schema.mutable(
  Schema.Array(lyricsSearchResultSchema)
);

export const chordChartsRpc = RpcGroup.make(
  Rpc.make("chordCharts.song", {
    payload: chordChartSongInputSchema,
    success: chordChartSongOutputSchema,
    error: RpcError,
  }),
  Rpc.make("chordCharts.update", {
    payload: chordChartUpdateInputSchema,
    success: chordChartArrangementSchema,
    error: RpcError,
  }),
  Rpc.make("chordCharts.create", {
    payload: chordChartCreateInputSchema,
    success: chordChartArrangementSchema,
    error: RpcError,
  }),
  Rpc.make("chordCharts.createSong", {
    payload: chordChartSongCreateInputSchema,
    success: chordChartSongOutputSchema,
    error: RpcError,
  }),
  Rpc.make("chordCharts.pdf", {
    payload: chordChartPdfInputSchema,
    success: chordChartPdfOutputSchema,
    error: RpcError,
  }),
  Rpc.make("chordCharts.lyricsSearch", {
    payload: lyricsSearchInputSchema,
    success: lyricsSearchOutputSchema,
    error: RpcError,
  })
);

export type ChordChartLayout = typeof chordChartLayoutSchema.Type;

export type ChordChartArrangement = typeof chordChartArrangementSchema.Type;

export type ChordChartSong = typeof chordChartSongSchema.Type;

export type ChordChartSongOutput = typeof chordChartSongOutputSchema.Type;

export type ChordChartSongInput = typeof chordChartSongInputSchema.Encoded;

export type ChordChartUpdateInput = typeof chordChartUpdateInputSchema.Encoded;

export type ChordChartCreateInput = typeof chordChartCreateInputSchema.Encoded;

export type ChordChartSongCreateInput =
  typeof chordChartSongCreateInputSchema.Encoded;

export type ChordChartPdfInput = typeof chordChartPdfInputSchema.Encoded;

export type ChordChartPdf = typeof chordChartPdfOutputSchema.Type;

export type LyricsSearchResult = typeof lyricsSearchResultSchema.Type;

export type LyricsSearchInput = typeof lyricsSearchInputSchema.Encoded;

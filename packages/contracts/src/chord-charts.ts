import { oc } from "@orpc/contract";
import { applicationErrorMap } from "@pcobooster/contracts/errors";
import { keyOptionSchema } from "@pcobooster/contracts/song-schemas";
import { z } from "zod";

const requiredId = z.string().trim().min(1);

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
export const CHORD_CHART_MAX_COLUMNS = 4;

const fontSizeSchema = z
  .number()
  .int()
  .refine(
    (size) => CHORD_CHART_FONT_SIZES.some((allowed) => allowed === size),
    "Font size must be one Services offers"
  );

/** Print settings Services stores beside the chart and uses for its PDFs. */
export const chordChartLayoutSchema = z.object({
  font: z.string().nullable(),
  fontSize: fontSizeSchema.nullable(),
  columns: z.number().int().min(1).max(CHORD_CHART_MAX_COLUMNS).nullable(),
  pageSize: z.enum(CHORD_CHART_PAGE_SIZES).nullable(),
  orientation: z.enum(CHORD_CHART_ORIENTATIONS).nullable(),
  margin: z.enum(CHORD_CHART_MARGINS).nullable(),
});

export const chordChartArrangementSchema = z.object({
  id: z.string(),
  name: z.string(),
  archived: z.boolean(),
  bpm: z.number().nullable(),
  meter: z.string().nullable(),
  /** Short section labels in order, such as `V1`, `C`, `B`. */
  sequence: z.array(z.string()),
  /** Lyrics & Chords text in Services' ChordPro-based format. */
  chordChart: z.string(),
  /** The key the chords are written in. */
  chordChartKey: z.string().nullable(),
  /** Lyrics Services derives from the chart, used to start a new chart from lyrics only. */
  lyrics: z.string(),
  keys: z.array(keyOptionSchema),
  layout: chordChartLayoutSchema,
  updatedAt: z.string().nullable(),
});

export const chordChartSongSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  copyright: z.string(),
  ccliNumber: z.string().nullable(),
});

export const chordChartSongOutputSchema = z.object({
  song: chordChartSongSchema,
  arrangements: z.array(chordChartArrangementSchema),
});

export const chordChartSongInputSchema = z.object({ songId: requiredId });

const chordChartEditSchema = z.object({
  chordChart: z.string(),
  chordChartKey: z.string().trim().min(1).nullable(),
  layout: chordChartLayoutSchema.partial().optional(),
});

export const chordChartUpdateInputSchema = chordChartEditSchema.extend({
  songId: requiredId,
  arrangementId: requiredId,
  /** The `updatedAt` the edit started from; a newer arrangement is a conflict. */
  baseUpdatedAt: z.string().nullable(),
});

export const chordChartCreateInputSchema = chordChartEditSchema.extend({
  songId: requiredId,
  name: z.string().trim().min(1).max(255),
});

const chordChartsProcedure = oc.errors({
  UNAUTHORIZED: applicationErrorMap.UNAUTHORIZED,
  FORBIDDEN: applicationErrorMap.FORBIDDEN,
  NOT_FOUND: applicationErrorMap.NOT_FOUND,
  BAD_REQUEST: applicationErrorMap.BAD_REQUEST,
  CONFLICT: applicationErrorMap.CONFLICT,
  TOO_MANY_REQUESTS: applicationErrorMap.TOO_MANY_REQUESTS,
  BAD_GATEWAY: applicationErrorMap.BAD_GATEWAY,
  INTERNAL_SERVER_ERROR: applicationErrorMap.INTERNAL_SERVER_ERROR,
});

export const chordChartsContract = {
  song: chordChartsProcedure
    .route({
      method: "GET",
      path: "/chord-charts/songs/{songId}",
      summary: "Read a song's arrangements with their chord charts",
    })
    .input(chordChartSongInputSchema)
    .output(chordChartSongOutputSchema),
  update: chordChartsProcedure
    .route({
      method: "PATCH",
      path: "/chord-charts/songs/{songId}/arrangements/{arrangementId}",
      summary: "Save an arrangement's chord chart to Planning Center",
    })
    .input(chordChartUpdateInputSchema)
    .output(chordChartArrangementSchema),
  create: chordChartsProcedure
    .route({
      method: "POST",
      path: "/chord-charts/songs/{songId}/arrangements",
      summary: "Create an arrangement from a chord chart in Planning Center",
    })
    .input(chordChartCreateInputSchema)
    .output(chordChartArrangementSchema),
};

export type ChordChartLayout = z.output<typeof chordChartLayoutSchema>;
export type ChordChartArrangement = z.output<
  typeof chordChartArrangementSchema
>;
export type ChordChartSong = z.output<typeof chordChartSongSchema>;
export type ChordChartSongOutput = z.output<typeof chordChartSongOutputSchema>;
export type ChordChartSongInput = z.input<typeof chordChartSongInputSchema>;
export type ChordChartUpdateInput = z.input<typeof chordChartUpdateInputSchema>;
export type ChordChartCreateInput = z.input<typeof chordChartCreateInputSchema>;

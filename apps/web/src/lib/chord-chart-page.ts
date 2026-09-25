import type { ChordChartLayout } from "@pcobooster/contracts/chord-charts";

/** CSS pixels per inch and per point, the units Services' print settings use. */
export const PIXELS_PER_INCH = 96;
const PIXELS_PER_POINT = PIXELS_PER_INCH / 72;

/** Services' defaults for an arrangement that never changed its print settings. */
export const DEFAULT_CHORD_CHART_LAYOUT = {
  font: null,
  fontSize: 12,
  columns: 1,
  pageSize: "Letter",
  orientation: "Portrait",
  margin: "0.5in",
} as const satisfies ChordChartLayout;

/** Portrait width and height in inches. */
const PAGE_INCHES: Readonly<
  Record<NonNullable<ChordChartLayout["pageSize"]>, readonly [number, number]>
> = {
  Letter: [8.5, 11],
  A4: [8.27, 11.69],
  Legal: [8.5, 14],
  "11x17": [11, 17],
  // Slide sizes are already landscape.
  "Widescreen (16x9)": [13.333, 7.5],
  "Fullscreen (4x3)": [10, 7.5],
};

export interface ChordChartPageGeometry {
  readonly width: number;
  readonly height: number;
  readonly margin: number;
  readonly columns: number;
  readonly fontSize: number;
  readonly fontFamily: string;
}

const MONOSPACE_FONT_PATTERN = /courier|mono|consol/iu;
const SERIF_FONT_PATTERN = /times|georgia|garamond|serif|palatino/iu;

/** Services' PDFs render in a few families; unknown names fall back to Helvetica. */
export const chordChartFontFamily = (font: string | null): string => {
  if (font !== null && MONOSPACE_FONT_PATTERN.test(font)) {
    return `"${font}", "Courier New", Courier, monospace`;
  }
  if (font !== null && SERIF_FONT_PATTERN.test(font)) {
    return `"${font}", "Times New Roman", Times, serif`;
  }
  const named = font === null ? "" : `"${font}", `;
  return `${named}Helvetica, Arial, sans-serif`;
};

/** Page size, margins, and type for a layout, in CSS pixels. */
export const chordChartPageGeometry = (
  layout: ChordChartLayout
): ChordChartPageGeometry => {
  const pageSize = layout.pageSize ?? DEFAULT_CHORD_CHART_LAYOUT.pageSize;
  const [portraitWidth, portraitHeight] = PAGE_INCHES[pageSize];
  const landscape =
    (layout.orientation ?? DEFAULT_CHORD_CHART_LAYOUT.orientation) ===
    "Landscape";
  const isSlide = portraitWidth > portraitHeight;
  const [widthInches, heightInches] =
    landscape && !isSlide
      ? [portraitHeight, portraitWidth]
      : [portraitWidth, portraitHeight];
  const marginInches = Number(
    (layout.margin ?? DEFAULT_CHORD_CHART_LAYOUT.margin).replace("in", "")
  );
  return {
    width: Math.round(widthInches * PIXELS_PER_INCH),
    height: Math.round(heightInches * PIXELS_PER_INCH),
    margin: Math.round(marginInches * PIXELS_PER_INCH),
    columns: layout.columns ?? DEFAULT_CHORD_CHART_LAYOUT.columns,
    fontSize:
      (layout.fontSize ?? DEFAULT_CHORD_CHART_LAYOUT.fontSize) *
      PIXELS_PER_POINT,
    fontFamily: chordChartFontFamily(layout.font),
  };
};

export interface MeasuredBlock {
  readonly height: number;
  /** A heading measures with the line after it, so it never ends a column. */
  readonly keepWithNext: boolean;
  readonly breakAfter: "none" | "column" | "page";
}

/** Which column of which page each block prints in. */
export interface BlockPlacement {
  readonly page: number;
  readonly column: number;
}

/**
 * Flows measured blocks down columns and across pages the way a PDF does: a block that
 * does not fit starts the next column, and the last column moves to the next page.
 * `firstPageOffset` is the header's height, which only the first page prints.
 */
export const paginateBlocks = (
  blocks: readonly MeasuredBlock[],
  {
    contentHeight,
    columns,
    firstPageOffset,
  }: { contentHeight: number; columns: number; firstPageOffset: number }
): BlockPlacement[] => {
  const placements: BlockPlacement[] = [];
  let page = 0;
  let column = 0;
  // The header spans every column of the first page.
  const columnTop = () => (page === 0 ? firstPageOffset : 0);
  let used = columnTop();

  const startPage = () => {
    page += 1;
    column = 0;
    used = columnTop();
  };
  const startColumn = () => {
    if (column + 1 >= columns) {
      startPage();
      return;
    }
    column += 1;
    used = columnTop();
  };

  for (const [index, block] of blocks.entries()) {
    const following = blocks[index + 1];
    const needed =
      block.keepWithNext && following !== undefined
        ? block.height + following.height
        : block.height;
    if (used + needed > contentHeight && used > columnTop()) {
      startColumn();
    }
    placements.push({ page, column });
    used += block.height;
    if (block.breakAfter === "column") {
      startColumn();
    } else if (block.breakAfter === "page") {
      startPage();
    }
  }
  return placements;
};

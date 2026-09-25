import { describe, expect, it } from "vitest";

import {
  chordChartFontFamily,
  chordChartPageGeometry,
  paginateBlocks,
} from "@/lib/chord-chart-page";
import type { MeasuredBlock } from "@/lib/chord-chart-page";

const line = (height = 10): MeasuredBlock => ({
  height,
  keepWithNext: false,
  breakAfter: "none",
});

describe(chordChartPageGeometry, () => {
  it("uses Services' defaults for unset settings", () => {
    expect(
      chordChartPageGeometry({
        font: null,
        fontSize: null,
        columns: null,
        pageSize: null,
        orientation: null,
        margin: null,
      })
    ).toStrictEqual({
      width: 816,
      height: 1056,
      margin: 48,
      columns: 1,
      fontSize: 16,
      fontFamily: "Helvetica, Arial, sans-serif",
    });
  });

  it("turns a portrait page sideways for landscape but keeps slides wide", () => {
    const landscape = chordChartPageGeometry({
      font: null,
      fontSize: 14,
      columns: 2,
      pageSize: "A4",
      orientation: "Landscape",
      margin: "0.25in",
    });
    expect([landscape.width, landscape.height]).toStrictEqual([1122, 794]);
    const slide = chordChartPageGeometry({
      font: null,
      fontSize: 14,
      columns: 2,
      pageSize: "Widescreen (16x9)",
      orientation: "Landscape",
      margin: "0.25in",
    });
    expect([slide.width, slide.height]).toStrictEqual([1280, 720]);
  });
});

describe(chordChartFontFamily, () => {
  it("falls back within the named font's family", () => {
    expect(chordChartFontFamily("Courier")).toContain("monospace");
    expect(chordChartFontFamily("Times")).toContain("serif");
    expect(chordChartFontFamily("Arial")).toBe(
      '"Arial", Helvetica, Arial, sans-serif'
    );
  });
});

describe(paginateBlocks, () => {
  it("flows into the next column, then the next page", () => {
    expect(
      paginateBlocks([line(), line(), line(), line(), line()], {
        contentHeight: 25,
        columns: 2,
        firstPageOffset: 0,
      })
    ).toStrictEqual([
      { page: 0, column: 0 },
      { page: 0, column: 0 },
      { page: 0, column: 1 },
      { page: 0, column: 1 },
      { page: 1, column: 0 },
    ]);
  });

  it("keeps the header off later pages and headings with their first line", () => {
    const heading: MeasuredBlock = {
      height: 10,
      keepWithNext: true,
      breakAfter: "none",
    };
    expect(
      paginateBlocks([line(), heading, line()], {
        contentHeight: 30,
        columns: 1,
        firstPageOffset: 10,
      })
    ).toStrictEqual([
      { page: 0, column: 0 },
      { page: 1, column: 0 },
      { page: 1, column: 0 },
    ]);
  });

  it("honors column and page breaks", () => {
    expect(
      paginateBlocks(
        [
          { height: 1, keepWithNext: false, breakAfter: "column" },
          { height: 1, keepWithNext: false, breakAfter: "page" },
          line(1),
        ],
        { contentHeight: 100, columns: 2, firstPageOffset: 0 }
      )
    ).toStrictEqual([
      { page: 0, column: 0 },
      { page: 0, column: 1 },
      { page: 1, column: 0 },
    ]);
  });

  it("places a block taller than a column instead of looping", () => {
    expect(
      paginateBlocks([line(50)], {
        contentHeight: 20,
        columns: 1,
        firstPageOffset: 0,
      })
    ).toStrictEqual([{ page: 0, column: 0 }]);
  });
});

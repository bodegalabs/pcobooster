import type {
  ChordChartArrangement,
  ChordChartLayout,
  ChordChartSong,
} from "@pcobooster/contracts/chord-charts";
import {
  parseChordChart,
  renderChordChart,
} from "@pcobooster/planning-center-models/chord-chart";
import type {
  ChordChartBlock,
  ChordChartDisplay,
  ChordChartSegment,
} from "@pcobooster/planning-center-models/chord-chart";
import { parseKey } from "@pcobooster/planning-center-models/chord-chart-chords";
import type { ReactNode } from "react";
import {
  useDeferredValue,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ChordSheetChordRow,
  ChordSheetChordedLine,
  ChordSheetColumns,
  ChordSheetHeader,
  ChordSheetHeading,
  ChordSheetLyrics,
  ChordSheetNote,
  ChordSheetPage,
  ChordSheetSpacer,
  ChordSheetType,
} from "@/components/ui/chord-sheet";
import type { ChordSheetPiece } from "@/components/ui/chord-sheet";
import { chordChartPageGeometry, paginateBlocks } from "@/lib/chord-chart-page";
import type { BlockPlacement, MeasuredBlock } from "@/lib/chord-chart-page";

/** Space between columns, as a share of the font size. */
const COLUMN_GAP_EM = 1.5;
/** Matches the pages' `p-6` inset inside the pane. */
const PANE_PADDING = 24;

type PrintBlock = Exclude<
  ChordChartBlock,
  { kind: "key-change" } | { kind: "column-break" } | { kind: "page-break" }
>;

interface PrintItem {
  readonly id: string;
  readonly block: PrintBlock;
  readonly breakAfter: MeasuredBlock["breakAfter"];
}

/**
 * Breaks attach to the block before them, so every printed item has a height. A break
 * before any content has nothing to separate and is dropped.
 */
const toPrintItems = (blocks: readonly ChordChartBlock[]): PrintItem[] => {
  const items: PrintItem[] = [];
  for (const block of blocks) {
    if (block.kind === "key-change") {
      continue;
    }
    if (block.kind === "column-break" || block.kind === "page-break") {
      const last = items.at(-1);
      if (last !== undefined) {
        items[items.length - 1] = {
          ...last,
          breakAfter: block.kind === "page-break" ? "page" : "column",
        };
      }
      continue;
    }
    items.push({ id: `block-${items.length}`, block, breakAfter: "none" });
  }
  return items;
};

const WORD_PATTERN = /\S*\s*/gu;
const STARTS_WITH_LETTER_PATTERN = /^\S/u;
const ENDS_WITH_LETTER_PATTERN = /\S$/u;

/** Splits segments at word boundaries so a long line wraps between words. */
const toPieces = (
  segments: readonly ChordChartSegment[]
): ChordSheetPiece[] => {
  const pieces: ChordSheetPiece[] = [];
  for (const [segmentIndex, segment] of segments.entries()) {
    const words = (segment.lyric.match(WORD_PATTERN) ?? []).filter(
      (word) => word.length > 0
    );
    const nextLyric = segments[segmentIndex + 1]?.lyric ?? "";
    const splitsWord =
      ENDS_WITH_LETTER_PATTERN.test(segment.lyric) &&
      STARTS_WITH_LETTER_PATTERN.test(nextLyric);
    if (words.length === 0) {
      pieces.push({
        id: `${segmentIndex}`,
        chord: segment.chord,
        lyric: "",
        splitsWord: false,
      });
    }
    for (const [wordIndex, word] of words.entries()) {
      pieces.push({
        id: `${segmentIndex}-${wordIndex}`,
        chord: wordIndex === 0 ? segment.chord : null,
        lyric: word,
        splitsWord: splitsWord && wordIndex === words.length - 1,
      });
    }
  }
  return pieces;
};

const PrintBlockView = ({ block }: { block: PrintBlock }): ReactNode => {
  switch (block.kind) {
    case "section": {
      return <ChordSheetHeading>{block.label}</ChordSheetHeading>;
    }
    case "lyrics": {
      return block.segments.some((segment) => segment.chord !== null) ? (
        <ChordSheetChordedLine pieces={toPieces(block.segments)} />
      ) : (
        <ChordSheetLyrics>
          {block.segments.map((segment) => segment.lyric).join("")}
        </ChordSheetLyrics>
      );
    }
    case "chords": {
      return <ChordSheetChordRow>{block.text}</ChordSheetChordRow>;
    }
    case "note": {
      return <ChordSheetNote>{block.text}</ChordSheetNote>;
    }
    case "blank": {
      return <ChordSheetSpacer />;
    }
    default: {
      return block satisfies never;
    }
  }
};

const headerTitle = (
  song: ChordChartSong,
  arrangement: ChordChartArrangement,
  keyLabel: string | null
): string => {
  const details = [
    keyLabel,
    arrangement.bpm === null ? null : `${arrangement.bpm} bpm`,
    arrangement.meter,
  ].filter((detail): detail is string => detail !== null && detail !== "");
  return details.length > 0
    ? `${song.title} [${details.join(", ")}]`
    : song.title;
};

const headerCredit = (song: ChordChartSong): string =>
  [
    song.copyright === "" ? null : `[${song.copyright}]`,
    song.author === "" ? null : `by ${song.author}`,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");

const samePlacements = (
  left: readonly BlockPlacement[],
  right: readonly BlockPlacement[]
): boolean =>
  left.length === right.length &&
  left.every(
    (placement, index) =>
      placement.page === right[index]?.page &&
      placement.column === right[index]?.column
  );

/** Calls `onResize` whenever any present element changes size. */
const observeResizes = (
  elements: readonly (HTMLElement | null)[],
  onResize: () => void
): (() => void) => {
  const observer = new ResizeObserver(onResize);
  for (const element of elements) {
    if (element !== null) {
      observer.observe(element);
    }
  }
  return () => {
    observer.disconnect();
  };
};

const observeWidth = (
  element: HTMLElement,
  onWidth: (width: number) => void
): (() => void) => {
  const observer = new ResizeObserver(([entry]) => {
    onWidth(entry?.contentRect.width ?? 0);
  });
  observer.observe(element);
  return () => {
    observer.disconnect();
  };
};

const usePaneWidth = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const pane = ref.current;
    return pane ? observeWidth(pane, setWidth) : undefined;
  }, []);
  return { ref, width };
};

export interface ChordChartPreviewProps {
  song: ChordChartSong;
  arrangement: ChordChartArrangement;
  chart: string;
  writtenKey: string | null;
  display: ChordChartDisplay;
  layout: ChordChartLayout;
}

/**
 * The chart as Services prints its PDF: pages at their real size, flowed into columns,
 * with the song header on the first page. It is scaled to fit the pane.
 */
export const ChordChartPreview = ({
  song,
  arrangement,
  chart,
  writtenKey,
  display,
  layout,
}: ChordChartPreviewProps) => {
  const deferredChart = useDeferredValue(chart);
  const geometry = chordChartPageGeometry(layout);
  const items = useMemo(
    () =>
      toPrintItems(
        renderChordChart(parseChordChart(deferredChart), {
          writtenKey: parseKey(writtenKey),
          display,
        })
      ),
    [deferredChart, writtenKey, display]
  );

  const columnGap = geometry.fontSize * COLUMN_GAP_EM;
  const contentWidth = geometry.width - geometry.margin * 2;
  const contentHeight = geometry.height - geometry.margin * 2;
  const columnWidth =
    (contentWidth - columnGap * (geometry.columns - 1)) / geometry.columns;

  const measureRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [placements, setPlacements] = useState<BlockPlacement[]>([]);
  const keyLabel =
    display.kind === "chords" ? (display.key?.name ?? writtenKey) : writtenKey;
  const header = (
    <ChordSheetHeader
      title={headerTitle(song, arrangement, keyLabel)}
      credit={headerCredit(song)}
      sequence={arrangement.sequence.join(", ")}
    />
  );

  // Pages follow rendered heights: blocks are measured at print size, off screen, and
  // re-measured whenever the text changes or the measured column resizes (type, width).
  useLayoutEffect(() => {
    const measure = measureRef.current;
    const measuredHeader = headerRef.current;
    const paginate = () => {
      if (measure === null || measuredHeader === null) {
        return;
      }
      const heights = [...measure.children].map(
        (child) => child.getBoundingClientRect().height
      );
      const next = paginateBlocks(
        items.map((item, index) => ({
          height: heights[index] ?? 0,
          keepWithNext: item.block.kind === "section",
          breakAfter: item.breakAfter,
        })),
        {
          contentHeight,
          columns: geometry.columns,
          firstPageOffset: measuredHeader.getBoundingClientRect().height,
        }
      );
      setPlacements((current) =>
        samePlacements(current, next) ? current : next
      );
    };
    paginate();
    return observeResizes([measure, measuredHeader], paginate);
  }, [items, contentHeight, geometry.columns]);

  const { ref: paneRef, width: paneWidth } = usePaneWidth();
  const scale =
    paneWidth > 0
      ? Math.min(1, (paneWidth - PANE_PADDING * 2) / geometry.width)
      : 0;
  const pageCount = Math.max(
    1,
    ...placements.map((placement) => placement.page + 1)
  );
  const pages = Array.from({ length: pageCount }, (_, page) => page);
  const columns = Array.from(
    { length: geometry.columns },
    (_, column) => column
  );

  return (
    <div ref={paneRef} className="relative min-h-0 flex-1 overflow-auto">
      <div
        aria-hidden
        className="pointer-events-none invisible absolute top-0 left-0 size-0 overflow-hidden"
      >
        <ChordSheetType
          ref={headerRef}
          fontFamily={geometry.fontFamily}
          fontSize={geometry.fontSize}
          width={contentWidth}
        >
          {header}
        </ChordSheetType>
        <ChordSheetType
          ref={measureRef}
          fontFamily={geometry.fontFamily}
          fontSize={geometry.fontSize}
          width={columnWidth}
        >
          {items.map((item) => (
            <div key={item.id}>
              <PrintBlockView block={item.block} />
            </div>
          ))}
        </ChordSheetType>
      </div>
      <div className="flex flex-col items-center gap-4 p-6">
        {pages.map((page) => (
          <ChordSheetPage
            key={`page-${page}`}
            width={geometry.width}
            height={geometry.height}
            margin={geometry.margin}
            scale={scale}
            fontFamily={geometry.fontFamily}
            fontSize={geometry.fontSize}
          >
            {page === 0 ? header : null}
            <ChordSheetColumns columns={geometry.columns} gap={columnGap}>
              {columns.map((column) => (
                <div key={`column-${column}`} className="min-w-0">
                  {items.map((item, index) =>
                    placements[index]?.page === page &&
                    placements[index]?.column === column ? (
                      <div key={item.id}>
                        <PrintBlockView block={item.block} />
                      </div>
                    ) : null
                  )}
                </div>
              ))}
            </ChordSheetColumns>
          </ChordSheetPage>
        ))}
      </div>
    </div>
  );
};

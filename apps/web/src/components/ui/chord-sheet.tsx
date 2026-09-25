import { cn } from "cn";
import type * as React from "react";

/**
 * A printed chord sheet as Planning Center's PDFs set it: white paper at its real size,
 * a grey title band, bold section labels, and bold chords over the lyrics. Sizes come in
 * as CSS pixels because the sheet reproduces a print layout, not the app's type scale.
 */

type SheetVariables = React.CSSProperties & Record<`--${string}`, string>;

const px = (value: number) => `${value}px`;

interface ChordSheetTypeProps extends React.ComponentProps<"div"> {
  fontFamily: string;
  fontSize: number;
  /** A fixed width, such as one column's, for measuring blocks before paginating. */
  width?: number;
}

/** Sets the sheet's type; the preview measures blocks inside one before paginating. */
const ChordSheetType = ({
  fontFamily,
  fontSize,
  width,
  className,
  ...props
}: ChordSheetTypeProps) => {
  const variables: SheetVariables = {
    "--sheet-font": fontFamily,
    "--sheet-font-size": px(fontSize),
    "--sheet-type-width": width === undefined ? "auto" : px(width),
  };
  return (
    <div
      data-slot="chord-sheet-type"
      className={cn(
        "text-paper-foreground font-(family-name:--sheet-font) text-(length:--sheet-font-size) leading-[1.2]",
        "w-(--sheet-type-width)",
        className
      )}
      style={variables}
      {...props}
    />
  );
};

interface ChordSheetPageProps {
  width: number;
  height: number;
  margin: number;
  /** How much the page shrinks to fit its pane. */
  scale: number;
  fontFamily: string;
  fontSize: number;
  children: React.ReactNode;
}

const ChordSheetPage = ({
  width,
  height,
  margin,
  scale,
  fontFamily,
  fontSize,
  children,
}: ChordSheetPageProps) => {
  const variables: SheetVariables = {
    "--sheet-width": px(width),
    "--sheet-height": px(height),
    "--sheet-margin": px(margin),
    "--sheet-scale": String(scale),
  };
  return (
    <div
      data-slot="chord-sheet-page"
      className="h-[calc(var(--sheet-height)*var(--sheet-scale))] w-[calc(var(--sheet-width)*var(--sheet-scale))] shrink-0"
      style={variables}
    >
      <ChordSheetType
        fontFamily={fontFamily}
        fontSize={fontSize}
        className="bg-paper ring-paper-foreground/10 h-(--sheet-height) w-(--sheet-width) origin-top-left scale-(--sheet-scale) p-(--sheet-margin) shadow-md ring-1"
      >
        {children}
      </ChordSheetType>
    </div>
  );
};

interface ChordSheetColumnsProps extends React.ComponentProps<"div"> {
  columns: number;
  gap: number;
}

const ChordSheetColumns = ({
  columns,
  gap,
  className,
  ...props
}: ChordSheetColumnsProps) => {
  const variables: SheetVariables = {
    "--sheet-columns": String(columns),
    "--sheet-column-gap": px(gap),
  };
  return (
    <div
      data-slot="chord-sheet-columns"
      className={cn(
        "grid grid-cols-[repeat(var(--sheet-columns),minmax(0,1fr))] gap-x-(--sheet-column-gap)",
        className
      )}
      style={variables}
      {...props}
    />
  );
};

interface ChordSheetHeaderProps {
  title: string;
  credit: string;
  sequence: string;
}

const ChordSheetHeader = ({
  title,
  credit,
  sequence,
}: ChordSheetHeaderProps) => (
  <div
    data-slot="chord-sheet-header"
    className="bg-paper-band mb-[1em] px-[0.6em] py-[0.45em]"
  >
    <p className="text-[1.25em] leading-tight font-bold">{title}</p>
    {credit === "" ? null : (
      <p className="text-[0.6em] leading-snug">{credit}</p>
    )}
    {sequence === "" ? null : (
      <p className="text-[0.8em] leading-snug font-bold">{sequence}</p>
    )}
  </div>
);

const ChordSheetHeading = ({ children }: { children: React.ReactNode }) => (
  <p data-slot="chord-sheet-heading" className="pt-[0.2em] font-bold">
    {children}
  </p>
);

const ChordSheetChordRow = ({ children }: { children: React.ReactNode }) => (
  <p data-slot="chord-sheet-chord-row" className="font-bold whitespace-pre">
    {children}
  </p>
);

const ChordSheetLyrics = ({ children }: { children: React.ReactNode }) => (
  <p data-slot="chord-sheet-lyrics" className="whitespace-pre-wrap">
    {children}
  </p>
);

const ChordSheetNote = ({ children }: { children: React.ReactNode }) => (
  <p data-slot="chord-sheet-note" className="italic">
    {children}
  </p>
);

/** A blank line in the chart. */
const ChordSheetSpacer = () => (
  <div data-slot="chord-sheet-spacer" className="h-[0.7em]" />
);

export interface ChordSheetPiece {
  readonly id: string;
  readonly chord: string | null;
  readonly lyric: string;
  /** A chord landed mid-word: Services prints a hyphen in the gap the chord leaves. */
  readonly splitsWord: boolean;
}

/** Lyrics with chords above them; pieces wrap between words like the PDF. */
const ChordSheetChordedLine = ({
  pieces,
}: {
  pieces: readonly ChordSheetPiece[];
}) => (
  <p data-slot="chord-sheet-chorded-line" className="flex flex-wrap items-end">
    {pieces.map((piece) => (
      <span key={piece.id} className="inline-flex flex-col">
        <span className="min-h-[1.2em] pr-[0.35em] font-bold whitespace-pre">
          {piece.chord ?? ""}
        </span>
        <span className="flex whitespace-pre">
          <span>{piece.lyric}</span>
          {piece.splitsWord ? (
            // Zero width keeps the hyphen out of the column's size; it shows only in the
            // gap a wider chord leaves, as in Services' PDFs.
            <span className="w-0 grow overflow-hidden text-center">-</span>
          ) : null}
        </span>
      </span>
    ))}
  </p>
);

export {
  ChordSheetChordedLine,
  ChordSheetChordRow,
  ChordSheetColumns,
  ChordSheetHeader,
  ChordSheetHeading,
  ChordSheetLyrics,
  ChordSheetNote,
  ChordSheetPage,
  ChordSheetSpacer,
  ChordSheetType,
};

import type { ChordChartArrangement } from "@pcobooster/contracts/chord-charts";
import { importChordChart } from "@pcobooster/planning-center-models/chord-chart-import";
import type {
  ChordChartImport,
  ChordChartImportFormat,
} from "@pcobooster/planning-center-models/chord-chart-import";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Textarea } from "@/components/ui/textarea";

const formatLabels: Record<ChordChartImportFormat, string> = {
  "chordpro-file": "ChordPro file, such as a SongSelect download",
  "chords-over-lyrics": "Chords written above lyrics",
  "inline-chords": "Chart with inline [chords]",
  lyrics: "Lyrics only",
};

/** Where the pasted text comes from: typed in, or another arrangement of this song. */
type ImportSource = "paste" | `chart:${string}` | `lyrics:${string}`;

const isImportSource = (value: string): value is ImportSource =>
  value === "paste" ||
  value.startsWith("chart:") ||
  value.startsWith("lyrics:");

const sourceText = (
  source: ImportSource,
  pasted: string,
  arrangements: readonly ChordChartArrangement[]
): string => {
  if (source === "paste") {
    return pasted;
  }
  const [kind, id] = source.split(":");
  const arrangement = arrangements.find((candidate) => candidate.id === id);
  if (arrangement === undefined) {
    return "";
  }
  return kind === "chart" ? arrangement.chordChart : arrangement.lyrics;
};

export interface ChordChartImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** This song's other arrangements, offered as starting points. */
  arrangements: readonly ChordChartArrangement[];
  onImport: (result: ChordChartImport, mode: "replace" | "append") => void;
}

/**
 * Starts a chart from text pasted from anywhere (SongSelect ChordPro, a chord sheet, or
 * lyrics) or from another arrangement, converted to Services' format before it lands.
 */
export const ChordChartImportDialog = ({
  open,
  onOpenChange,
  arrangements,
  onImport,
}: ChordChartImportDialogProps) => {
  const [source, setSource] = useState<ImportSource>("paste");
  const [pasted, setPasted] = useState("");
  const text = sourceText(source, pasted, arrangements);
  const result = text.trim().length > 0 ? importChordChart(text) : null;

  const finish = (mode: "replace" | "append") => {
    if (result === null) {
      return;
    }
    onImport(result, mode);
    setPasted("");
    setSource("paste");
    onOpenChange(false);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent desktopClassName="max-w-2xl">
        <ResponsiveDialogHeader className="text-left">
          <ResponsiveDialogTitle>Import lyrics or chords</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Paste a ChordPro file from SongSelect, a chord sheet, or plain
            lyrics. Section names become headings and chords move inline, so
            Planning Center can transpose them.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="flex flex-col gap-3 max-md:px-4">
          {arrangements.length > 0 ? (
            <NativeSelect
              aria-label="Import from"
              className="w-full"
              value={source}
              onChange={(event) => {
                const next = event.target.value;
                if (isImportSource(next)) {
                  setSource(next);
                }
              }}
            >
              <NativeSelectOption value="paste">Paste text</NativeSelectOption>
              {arrangements.map((arrangement) => (
                <NativeSelectOption
                  key={`chart:${arrangement.id}`}
                  value={`chart:${arrangement.id}`}
                  disabled={arrangement.chordChart.trim() === ""}
                >
                  {`Chart from “${arrangement.name}”`}
                </NativeSelectOption>
              ))}
              {arrangements.map((arrangement) => (
                <NativeSelectOption
                  key={`lyrics:${arrangement.id}`}
                  value={`lyrics:${arrangement.id}`}
                  disabled={arrangement.lyrics.trim() === ""}
                >
                  {`Lyrics only from “${arrangement.name}”`}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          ) : null}
          {source === "paste" ? (
            <Textarea
              aria-label="Text to import"
              autoFocus
              className="h-72"
              placeholder={
                "{title: Song}\n{comment: Verse 1}\n[G]Lyrics with [C]chords"
              }
              value={pasted}
              onChange={(event) => {
                setPasted(event.target.value);
              }}
            />
          ) : (
            <pre className="bg-muted/50 h-72 overflow-auto rounded-2xl p-3 font-mono text-xs whitespace-pre-wrap">
              {result?.chart ?? ""}
            </pre>
          )}
          <p className="text-muted-foreground text-xs" aria-live="polite">
            {result === null
              ? "Nothing to import yet."
              : `Detected: ${formatLabels[result.format]}.`}
          </p>
        </div>
        <ResponsiveDialogFooter>
          <Button
            variant="outline"
            disabled={result === null}
            onClick={() => {
              finish("append");
            }}
          >
            Add to end
          </Button>
          <Button
            disabled={result === null}
            onClick={() => {
              finish("replace");
            }}
          >
            Replace chart
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
};

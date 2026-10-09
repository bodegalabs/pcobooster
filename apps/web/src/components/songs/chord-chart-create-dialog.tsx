import { failureMessage } from "@pcobooster/client/product-client";
import type {
  ChordChartArrangement,
  ChordChartLayout,
} from "@pcobooster/contracts/http/chord-charts";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Spinner } from "@/components/ui/spinner";
import { useCreateChordChart } from "@/hooks/use-chord-chart-song";

/** What a new arrangement starts with. */
export interface ChordChartCreateContent {
  readonly chart: string;
  readonly key: string | null;
  /** Only the print settings to set; the rest inherit the organization's defaults. */
  readonly layout: Partial<ChordChartLayout>;
}

/** The arrangement being copied, and what this visit did to it. */
export interface ChordChartCopySource {
  readonly name: string;
  /** Changes already saved to it, as Save as you type does. */
  readonly savedChanges: boolean;
  readonly unsavedChanges: boolean;
}

/** What happens to the arrangement being copied, in plain words. */
const originalNote = ({
  name,
  savedChanges,
  unsavedChanges,
}: ChordChartCopySource): string => {
  if (savedChanges && unsavedChanges) {
    return `“${name}” keeps the changes already saved to it; your unsaved ones go only to the copy. To undo the saved ones there, choose Revert all changes.`;
  }
  if (savedChanges) {
    return `“${name}” keeps the changes already saved to it. To undo them there, choose Revert all changes.`;
  }
  if (unsavedChanges) {
    return `“${name}” stays as last saved; your unsaved changes go only to the copy.`;
  }
  return `“${name}” stays as it is.`;
};

export interface ChordChartCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  songId: string;
  content: ChordChartCreateContent;
  /** The arrangement this copies, or null for a new, empty one. */
  copyOf: ChordChartCopySource | null;
  onCreated: (arrangement: ChordChartArrangement) => void;
}

/** Creates an arrangement in Planning Center, empty or copied from the chart being edited. */
export const ChordChartCreateDialog = ({
  open,
  onOpenChange,
  songId,
  content,
  copyOf,
  onCreated,
}: ChordChartCreateDialogProps) => {
  const nameId = useId();
  const [name, setName] = useState("");
  const createChart = useCreateChordChart(songId);
  const trimmedName = name.trim();

  const create = () => {
    if (trimmedName === "" || createChart.isPending) {
      return;
    }
    createChart.mutate(
      {
        songId,
        name: trimmedName,
        chordChart: content.chart,
        chordChartKey: content.key,
        layout: content.layout,
      },
      {
        onSuccess: (arrangement) => {
          setName("");
          onOpenChange(false);
          onCreated(arrangement);
        },
        onError: (error) => {
          toast.error(
            failureMessage(
              error,
              "Planning Center didn’t create the arrangement. Try again."
            )
          );
        },
      }
    );
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent desktopClassName="max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            create();
          }}
        >
          <ResponsiveDialogHeader className="text-left">
            <ResponsiveDialogTitle>
              {copyOf === null
                ? "New arrangement"
                : "Copy to a new arrangement"}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {copyOf === null
                ? "Creates an empty arrangement in Planning Center."
                : "Creates an arrangement in Planning Center with this chart, its key, and any formatting you changed."}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="flex flex-col gap-2 max-md:px-4">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              autoFocus
              placeholder="Acoustic"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            {copyOf === null ? null : (
              <p className="text-muted-foreground text-xs">
                {originalNote(copyOf)}
              </p>
            )}
          </div>
          <ResponsiveDialogFooter>
            <Button
              type="submit"
              disabled={trimmedName === "" || createChart.isPending}
            >
              {createChart.isPending ? <Spinner aria-hidden /> : null}
              Create in Planning Center
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
};

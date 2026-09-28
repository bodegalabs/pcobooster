import { LoaderCircle, Music2, Plus, Type } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/plan-overview";
import type { PlanOrder } from "@/lib/plan-overview";

interface PlanTabToolbarProps {
  order: PlanOrder | null;
  /** Rough key changes between back-to-back songs. */
  keyJumps: number;
  /** Songs sung in the weeks before this plan. */
  repeats: number;
  isReordering: boolean;
  isCreatingBasicItem?: boolean;
  disabled?: boolean;
  onAddSong: () => void;
  onAddHeader: () => void;
  onAddItem: () => void;
}

const pluralize = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

const describeOrder = (order: PlanOrder) => {
  const parts = [
    pluralize(order.songs.length, "song"),
    pluralize(order.itemCount, "item"),
  ];
  const length = formatDuration(order.serviceLength);
  if (length !== null) {
    parts.push(`${length} service`);
  }
  return parts.join(" · ");
};

const Insights = ({
  keyJumps,
  repeats,
  songsWithoutKey,
}: {
  keyJumps: number;
  repeats: number;
  songsWithoutKey: number;
}) => {
  const notes = [
    keyJumps > 0 ? pluralize(keyJumps, "key jump") : null,
    repeats > 0 ? pluralize(repeats, "recent repeat") : null,
    songsWithoutKey > 0 ? `${songsWithoutKey} without a key` : null,
  ].filter((note) => note !== null);
  if (notes.length === 0) {
    return null;
  }
  return <span className="text-status-scheduled"> · {notes.join(" · ")}</span>;
};

export const PlanTabToolbar = ({
  order,
  keyJumps,
  repeats,
  isReordering: reordering,
  isCreatingBasicItem = false,
  disabled = false,
  onAddSong,
  onAddHeader,
  onAddItem,
}: PlanTabToolbarProps) => (
  <div className="bg-background sticky top-0 z-20 flex w-full max-w-4xl shrink-0 flex-wrap items-center gap-x-4 gap-y-2 py-1">
    <p className="text-muted-foreground w-full text-sm tabular-nums sm:w-auto sm:flex-1">
      {reordering ? (
        <span className="inline-flex items-center gap-1.5">
          <LoaderCircle className="size-3.5 animate-spin" />
          Saving order…
        </span>
      ) : null}
      {!reordering && order !== null ? describeOrder(order) : null}
      {!reordering && order !== null ? (
        <Insights
          keyJumps={keyJumps}
          repeats={repeats}
          songsWithoutKey={order.songsWithoutKey}
        />
      ) : null}
    </p>
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onAddHeader}
        disabled={disabled || isCreatingBasicItem}
      >
        <Type className="size-4 opacity-70" />
        Header
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onAddItem}
        disabled={disabled || isCreatingBasicItem}
      >
        <Plus className="size-4 opacity-70" />
        Item
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onAddSong}
        disabled={disabled}
      >
        <Music2 className="size-4" />
        Add song
      </Button>
    </div>
  </div>
);

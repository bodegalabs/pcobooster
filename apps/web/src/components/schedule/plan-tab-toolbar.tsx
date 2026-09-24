import { LoaderCircle, Music4, Plus, Type } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PlanTabToolbarProps {
  pendingItemId: string | null;
  isCreatingBasicItem?: boolean;
  disabled?: boolean;
  onAddSong: () => void;
  onAddHeader: () => void;
  onAddItem: () => void;
}

export const PlanTabToolbar = ({
  pendingItemId,
  isCreatingBasicItem = false,
  disabled = false,
  onAddSong,
  onAddHeader,
  onAddItem,
}: PlanTabToolbarProps) => {
  const reordering = pendingItemId === "reorder";

  return (
    <div className="border-border/50 bg-background/95 sm:bg-background sticky top-0 z-20 -mx-4 flex shrink-0 items-center gap-1 border-b px-4 py-2 backdrop-blur sm:-mx-0 sm:rounded-md sm:border">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onAddSong}
        disabled={disabled}
      >
        <Music4 className="size-4 opacity-70" />
        Song
      </Button>
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
      {reordering ? (
        <span className="text-muted-foreground ml-auto inline-flex items-center gap-1.5 text-xs">
          <LoaderCircle className="size-3.5 animate-spin" />
          Saving order…
        </span>
      ) : null}
    </div>
  );
};

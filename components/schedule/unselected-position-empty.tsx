"use client";

import { PanelLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

export function UnselectedPositionEmpty({
  hasSlots,
  teamPositionsLoading,
  onOpenPicker,
}: {
  hasSlots: boolean;
  teamPositionsLoading: boolean;
  onOpenPicker: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center lg:h-full">
      <p className="text-muted-foreground text-sm">
        <span className="hidden lg:inline">Pick a position on the left.</span>
        <span className="lg:hidden">Pick a position to get started.</span>
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="lg:hidden"
        onClick={onOpenPicker}
        disabled={!hasSlots || teamPositionsLoading}
      >
        <PanelLeft className="size-4 opacity-70" aria-hidden />
        Open positions
      </Button>
    </div>
  );
}

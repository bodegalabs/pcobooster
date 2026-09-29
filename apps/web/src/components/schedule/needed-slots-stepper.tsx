import type { TeamPosition } from "@pcobooster/planning-center-models/types";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HoverLabel } from "@/components/ui/hover-card";
import { useAdjustNeededPositions } from "@/hooks/use-adjust-needed-positions";

/**
 * A position's filled and total slots, with one more or one fewer open slot a click away.
 * Planning Center's API only changes existing open-slot records, so a position with no
 * open slots gets more in Planning Center itself.
 */
export const NeededSlotsStepper = ({
  serviceTypeId,
  planId,
  position,
}: {
  serviceTypeId: string;
  planId: string;
  position: TeamPosition;
}) => {
  const adjust = useAdjustNeededPositions(serviceTypeId, planId);
  const filled =
    (position.filledConfirmedCount ?? 0) + (position.filledPendingCount ?? 0);
  const open = position.neededCount ?? 0;
  const total = filled + open;
  const hasOpenSlots = open > 0;

  return (
    <div className="flex shrink-0 items-center gap-1">
      <HoverLabel
        label={hasOpenSlots ? "One fewer open slot" : "No open slots to remove"}
        side="bottom"
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            aria-label={`Remove an open ${position.name} slot`}
            disabled={!hasOpenSlots}
            onClick={() => {
              adjust(position, "remove");
            }}
          />
        }
      >
        <Minus />
      </HoverLabel>
      <span
        className="min-w-9 text-center text-sm font-medium tabular-nums"
        aria-label={`${filled} of ${total} filled`}
      >
        {filled}/{total}
      </span>
      <HoverLabel
        label={
          hasOpenSlots
            ? "One more open slot"
            : "Add the first open slot in Planning Center"
        }
        side="bottom"
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            aria-label={`Add an open ${position.name} slot`}
            disabled={!hasOpenSlots}
            onClick={() => {
              adjust(position, "add");
            }}
          />
        }
      >
        <Plus />
      </HoverLabel>
    </div>
  );
};

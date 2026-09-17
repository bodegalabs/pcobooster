"use client";

import { SlotStatusPopoverContent } from "@/components/schedule/popovers/slot-status-popover";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { TeamPosition } from "@/lib/types";
import { cn } from "@/lib/utils";

export const SlotBadgeCluster = ({
  position,
  teamName,
  positionName,
}: {
  position: TeamPosition;
  teamName: string;
  positionName: string;
}) => {
  const confirmed = position.filledConfirmedCount ?? 0;
  const pending = position.filledPendingCount ?? 0;
  const needed = position.neededCount ?? 0;
  const filled = confirmed + pending;
  const total = filled + needed;
  const confirmedPeople = (position.filledPeople ?? []).filter(
    (person) => person.status === "confirmed"
  );
  const pendingPeople = (position.filledPeople ?? []).filter(
    (person) => person.status === "pending"
  );
  const allFilled = needed === 0 && filled > 0;
  const hasPending = pending > 0;

  return (
    <div className="flex items-center gap-1">
      {filled > 0 && !allFilled ? (
        <HoverCard>
          <HoverCardTrigger
            render={
              <button
                type="button"
                className="text-muted-foreground text-xs tabular-nums"
                aria-label={`${filled} of ${total} filled`}
              />
            }
          >
            {filled}/{total}
          </HoverCardTrigger>
          <HoverCardContent align="end" side="right" className="w-80">
            {confirmedPeople.length > 0 ? (
              <SlotStatusPopoverContent
                teamName={teamName}
                positionName={positionName}
                label="Confirmed"
                tone="confirmed"
                people={confirmedPeople}
              />
            ) : null}
            {pendingPeople.length > 0 ? (
              <SlotStatusPopoverContent
                teamName={teamName}
                positionName={positionName}
                label="Pending"
                tone="pending"
                people={pendingPeople}
              />
            ) : null}
          </HoverCardContent>
        </HoverCard>
      ) : null}
      {needed > 0 ? (
        <span
          className="text-status-declined dark:text-status-declined shrink-0 text-xs font-medium tabular-nums"
          title={`${needed} still needed`}
        >
          +{needed}
        </span>
      ) : null}
      {needed === 0 && allFilled ? (
        <span
          aria-label="All filled"
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            hasPending
              ? "bg-status-scheduled-bright"
              : "bg-status-confirmed-bright"
          )}
        />
      ) : null}
    </div>
  );
};

"use client";

import { SlotStatusPopoverContent } from "@/components/schedule/popovers/slot-status-popover";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { TeamPosition } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SlotBadgeCluster({
  position,
  teamName,
  positionName,
}: {
  position: TeamPosition;
  teamName: string;
  positionName: string;
}) {
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
        <HoverCard openDelay={120} closeDelay={120}>
          <HoverCardTrigger asChild>
            <span
              className="text-muted-foreground text-[11px] tabular-nums"
              aria-label={`${filled} of ${total} filled`}
            >
              {filled}/{total}
            </span>
          </HoverCardTrigger>
          <HoverCardContent align="end" side="right" className="w-80 space-y-3">
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
          className="shrink-0 text-[11px] font-medium text-red-600 tabular-nums dark:text-red-400"
          title={`${needed} still needed`}
        >
          +{needed}
        </span>
      ) : allFilled ? (
        <span
          aria-label="All filled"
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            hasPending ? "bg-amber-500" : "bg-emerald-500"
          )}
        />
      ) : null}
    </div>
  );
}

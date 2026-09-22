"use client";

import type { TeamPosition } from "@pcobooster/planning-center-models/types";

import { SlotStatusPopoverContent } from "@/components/schedule/popovers/slot-status-popover";
import { ScheduleStatusDot } from "@/components/schedule/status-dot";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { ItemSeparator } from "@/components/ui/item";
import { cn } from "@/lib/utils";

export const SlotBadgeCluster = ({
  position,
  teamName,
  positionName,
  className,
}: {
  position: TeamPosition;
  teamName: string;
  positionName: string;
  className?: string;
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
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      {filled > 0 && !allFilled ? (
        <HoverCard>
          <HoverCardTrigger
            render={
              <span
                className="text-muted-foreground cursor-default text-xs tabular-nums"
                aria-label={`${filled} of ${total} filled`}
              />
            }
          >
            {filled}/{total}
          </HoverCardTrigger>
          <HoverCardContent
            align="end"
            side="right"
            variant="panel"
            className="w-80"
          >
            <div className="flex flex-col gap-3">
              {confirmedPeople.length > 0 ? (
                <SlotStatusPopoverContent
                  teamName={teamName}
                  positionName={positionName}
                  label="Confirmed"
                  tone="confirmed"
                  people={confirmedPeople}
                />
              ) : null}
              {confirmedPeople.length > 0 && pendingPeople.length > 0 ? (
                <ItemSeparator className="my-0" />
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
            </div>
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
        <ScheduleStatusDot
          status={hasPending ? "scheduled" : "confirmed"}
          aria-label="All filled"
        />
      ) : null}
    </div>
  );
};

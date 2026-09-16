"use client";

import { CalendarDays } from "lucide-react";

import { TeamSlotsCollapsible } from "@/components/schedule/team-slots-collapsible";
import type { SlotRef } from "@/components/schedule/types";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { SidebarMenuSkeleton } from "@/components/ui/sidebar";
import type { TeamPositionGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PositionPickerList({
  teamPositionsLoading,
  teamPositionsPlaceholder,
  teamPositionGroups,
  collapsedTeams,
  selectedTeam,
  selectedPosition,
  onToggleTeam,
  onSelect,
  onPreviewSlot,
  onAddPosition,
}: {
  teamPositionsLoading: boolean;
  teamPositionsPlaceholder: boolean;
  teamPositionGroups: TeamPositionGroup[] | undefined;
  collapsedTeams: Record<string, boolean>;
  selectedTeam: string | null;
  selectedPosition: string | null;
  onToggleTeam: (teamId: string) => void;
  onSelect: (slot: SlotRef) => void;
  onPreviewSlot?: (slot: SlotRef) => void;
  onAddPosition?: (
    team: { teamId: string; teamName: string },
    positionName: string
  ) => SlotRef | null;
}) {
  const skeletonWidths = [
    "78%",
    "66%",
    "84%",
    "58%",
    "72%",
    "62%",
    "88%",
    "70%",
  ];

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="flex flex-col">
        {teamPositionsLoading ? (
          Array.from({ length: 8 }).map((_, index) => (
            <SidebarMenuSkeleton key={index} width={skeletonWidths[index]} />
          ))
        ) : !teamPositionGroups || teamPositionGroups.length === 0 ? (
          <Empty className="py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarDays />
              </EmptyMedia>
              <EmptyTitle>No slots found</EmptyTitle>
              <EmptyDescription>
                This plan has no team positions yet.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div aria-busy={teamPositionsPlaceholder}>
            {teamPositionsPlaceholder ? (
              <div className="border-sidebar-border/50 bg-sidebar/95 text-sidebar-foreground/70 sticky top-0 z-10 border-b px-3 py-1.5 text-xs font-medium backdrop-blur">
                Loading selected plan...
              </div>
            ) : null}
            <div
              className={cn(
                teamPositionsPlaceholder && "pointer-events-none opacity-60"
              )}
            >
              {teamPositionGroups.map((group) => (
                <TeamSlotsCollapsible
                  key={group.teamId}
                  group={group}
                  isCollapsed={!!collapsedTeams[group.teamId]}
                  selectedTeam={selectedTeam}
                  selectedPosition={selectedPosition}
                  onToggle={onToggleTeam}
                  onSelect={onSelect}
                  onPreview={onPreviewSlot}
                  onAddPosition={onAddPosition}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { CalendarDays } from "lucide-react";
import { Fragment } from "react";
import type { ReactNode } from "react";

import { TeamSlotsCollapsible } from "@/components/schedule/team-slots-collapsible";
import type { SlotRef } from "@/components/schedule/types";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarMenuSkeleton, SidebarSeparator } from "@/components/ui/sidebar";
import type { TeamPositionGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

const skeletonWidths = ["78%", "66%", "84%", "58%", "72%", "62%", "88%", "70%"];

export const PositionPickerList = ({
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
}) => {
  let body: ReactNode;
  if (teamPositionsLoading) {
    body = skeletonWidths.map((width) => (
      <SidebarMenuSkeleton key={width} width={width} />
    ));
  } else if (
    teamPositionGroups === undefined ||
    teamPositionGroups.length === 0
  ) {
    body = (
      <Empty>
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
    );
  } else {
    body = (
      <div aria-busy={teamPositionsPlaceholder}>
        {teamPositionsPlaceholder ? (
          <>
            <div className="bg-sidebar/95 text-sidebar-foreground/70 sticky top-0 z-10 px-3 py-1.5 text-xs font-medium backdrop-blur">
              Loading selected plan...
            </div>
            <SidebarSeparator className="my-0" />
          </>
        ) : null}
        <div
          className={cn(
            teamPositionsPlaceholder && "pointer-events-none opacity-60"
          )}
        >
          {teamPositionGroups.map((group, index) => (
            <Fragment key={group.teamId}>
              {index > 0 ? <SidebarSeparator className="my-0" /> : null}
              <TeamSlotsCollapsible
                group={group}
                isCollapsed={collapsedTeams[group.teamId]}
                selectedTeam={selectedTeam}
                selectedPosition={selectedPosition}
                onToggle={onToggleTeam}
                onSelect={onSelect}
                onPreview={onPreviewSlot}
                onAddPosition={onAddPosition}
              />
            </Fragment>
          ))}
        </div>
      </div>
    );
  }
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col py-1">{body}</div>
    </ScrollArea>
  );
};

import type { TeamPositionGroup } from "@pcobooster/planning-center-models/types";
import { CalendarDays } from "lucide-react";
import { Fragment } from "react";
import type { ReactNode } from "react";

import { PositionPickerSkeleton } from "@/components/schedule/schedule-skeletons";
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
import { SidebarSeparator } from "@/components/ui/sidebar";
import type { GetIntentPrefetchProps } from "@/hooks/use-intent-prefetch";
import { useRevealOnLoad } from "@/hooks/use-reveal-on-load";
import { cn } from "@/lib/utils";

export const PositionPickerList = ({
  teamPositionsLoading,
  teamPositionGroups,
  collapsedTeams,
  selectedTeam,
  selectedPosition,
  onToggleTeam,
  onSelect,
  getSlotIntentProps,
  onAddPosition,
  clearTabBar = false,
}: {
  /** Pad the end so the last rows scroll clear of the floating phone tab bar. */
  clearTabBar?: boolean;
  teamPositionsLoading: boolean;
  teamPositionGroups: TeamPositionGroup[] | undefined;
  collapsedTeams: Record<string, boolean>;
  selectedTeam: string | null;
  selectedPosition: string | null;
  onToggleTeam: (teamId: string) => void;
  onSelect: (slot: SlotRef) => void;
  getSlotIntentProps?: GetIntentPrefetchProps<SlotRef>;
  onAddPosition?: (
    team: { teamId: string; teamName: string },
    positionName: string
  ) => SlotRef | null;
}) => {
  const revealClassName = useRevealOnLoad(teamPositionsLoading);
  let body: ReactNode;
  if (teamPositionsLoading) {
    body = <PositionPickerSkeleton />;
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
      <div className={revealClassName}>
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
              getSlotIntentProps={getSlotIntentProps}
              onAddPosition={onAddPosition}
            />
          </Fragment>
        ))}
      </div>
    );
  }
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div
        className={cn(
          "flex flex-col py-1",
          clearTabBar && "pb-tab-bar md:pb-1"
        )}
      >
        {body}
      </div>
    </ScrollArea>
  );
};

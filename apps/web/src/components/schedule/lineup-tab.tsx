import type {
  PlanTime,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";

import { PageScrollArea } from "@/components/page-shell";
import {
  TeamRoster,
  TeamRosterSkeleton,
} from "@/components/schedule/team-roster";
import type { SlotRef } from "@/components/schedule/types";
import type { GetIntentPrefetchProps } from "@/hooks/use-intent-prefetch";

interface LineupTabProps {
  groups: TeamPositionGroup[];
  isLoading: boolean;
  serviceTypeId: string | null;
  planId: string | null;
  seriesId: string | null;
  planTimes: PlanTime[];
  collapsedTeams: Record<string, boolean>;
  onToggleTeam: (teamId: string) => void;
  onSelectPosition: (slot: SlotRef) => void;
  getSlotIntentProps?: GetIntentPrefetchProps<SlotRef>;
  onAddPosition?: (
    team: { teamId: string; teamName: string },
    positionName: string
  ) => SlotRef | null;
}

/** The lineup's team panels before anything loads. */
export const LineupTabSkeleton = () => (
  <PageScrollArea>
    <TeamRosterSkeleton layout="grid" />
  </PageScrollArea>
);

/** Every team's roster at once, in as many columns as fit. */
export const LineupTab = (props: LineupTabProps) => (
  <PageScrollArea>
    <div className="pb-safe-4">
      <TeamRoster layout="grid" personAction="edit" {...props} />
    </div>
  </PageScrollArea>
);

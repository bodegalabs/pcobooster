import type { SlotRef } from "@pcobooster/planning-center-models/scheduling-notifications";
import type {
  PlanTime,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";

import { PageScrollArea } from "@/components/page-shell";
import {
  TeamRoster,
  TeamRosterSkeleton,
} from "@/components/schedule/team-roster";
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
  <PageScrollArea axis="both">
    <TeamRosterSkeleton layout="row" />
  </PageScrollArea>
);

/** Every team's roster at once, side by side in one row that scrolls sideways. */
export const LineupTab = (props: LineupTabProps) => (
  <PageScrollArea axis="both">
    <div className="pb-safe-4">
      <TeamRoster layout="row" personAction="edit" {...props} />
    </div>
  </PageScrollArea>
);

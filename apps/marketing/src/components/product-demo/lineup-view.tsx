import { TeamRoster } from "./team-roster";

export const LineupView = ({
  onOpenPosition,
}: {
  onOpenPosition: (positionId: string) => void;
}) => <TeamRoster layout="grid" onSelect={onOpenPosition} />;

export interface SlotRef {
  teamId: string;
  teamName: string;
  positionId: string;
  positionName: string;
  source?: "team_position" | "needed_position" | "plan_member" | "custom";
}

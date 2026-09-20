import type {
  RawPlanPerson,
  RawSchedule,
  ScheduleFrequency,
  ServiceHistoryItem,
} from "@worship-admin/planning-center-models/types";

export interface SelectedPlanMatchContext {
  planId?: string;
  teamId?: string;
  selectedPositionName?: string;
  selectedTeamName?: string;
}

export interface HistoryBuildResult {
  serviceHistory: ServiceHistoryItem[];
  frequency: ScheduleFrequency;
  matchedSchedule?: RawSchedule | RawPlanPerson;
}

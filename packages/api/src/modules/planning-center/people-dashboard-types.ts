export type PeopleDashboardLoad = "low" | "normal" | "high" | "rest";

export type PeopleDashboardDayKind =
  | "service"
  | "rehearsal"
  | "blockout"
  | "rest";

export interface PeopleDashboardMonth {
  year: number;
  monthIndex: number;
  label: string;
  daysInMonth: number;
  startsOnWeekday: number;
}

export interface PeopleDashboardRosterPerson {
  id: string;
  name: string;
  initials: string;
  photoThumbnailUrl: string | null;
  teams: string[];
}

export interface PeopleDashboardActivity {
  id: string;
  roles: string;
  status: string;
  load: PeopleDashboardLoad;
  lastServed: string;
  lastRehearsal?: string;
  nextScheduled: string;
  nextRehearsal?: string;
  monthCount: number;
  thirtyDayCount: number;
  ninetyDayCount: number;
  upcomingCount: number;
  streak: string;
  highlight: string;
  monthDays: {
    day: number;
    kind: PeopleDashboardDayKind;
    positionName?: string;
    serviceTypeName?: string;
    status?: string;
    planUrl?: string;
  }[];
}

export type PeopleDashboardPerson = PeopleDashboardRosterPerson &
  Omit<PeopleDashboardActivity, "id">;

export interface PeopleDashboardRoster {
  generatedAt: string;
  month: PeopleDashboardMonth;
  people: PeopleDashboardRosterPerson[];
}

export interface PeopleDashboardActivityBatch {
  generatedAt: string;
  people: PeopleDashboardActivity[];
  deferredPersonIds: string[];
  requestBudget: {
    limit: number;
    planningCenterRequests: number;
    scheduleRequests: number;
    planTimeRequests: number;
  };
}

export interface PeopleDashboardPersonDetail {
  generatedAt: string;
  month: PeopleDashboardMonth;
  previousMonth: string;
  nextMonth: string;
  person: PeopleDashboardPerson;
  trend: {
    month: string;
    label: string;
    services: number;
    rehearsals: number;
  }[];
  requestBudget: {
    limit: number;
    /** Planning Center requests the procedure sent; cached reads cost none. */
    planningCenterRequests: number;
    /**
     * Rehearsal (and other) times the budget left unread; their assignments show on their
     * plan's date. Zero when the detail is complete.
     */
    unresolvedRehearsalTimes: number;
  };
}

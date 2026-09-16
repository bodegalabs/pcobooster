export type PeopleDashboardRange = "month" | "30" | "90";

export type PeopleDashboardLoad = "low" | "normal" | "high" | "rest";

export type PeopleDashboardDayKind =
  | "service"
  | "rehearsal"
  | "blockout"
  | "rest";

export interface PeopleDashboardPerson {
  id: string;
  name: string;
  initials: string;
  photoThumbnailUrl: string | null;
  teams: string[];
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

export interface PeopleDashboardDay {
  day: number;
  serviceCount: number;
  confirmedServiceCount: number;
  potentialServiceCount: number;
  rehearsalCount: number;
  blockoutCount: number;
}

export interface PeopleDashboardStats {
  scheduledPeople: number;
  highLoadPeople: number;
  availableSoonPeople: number;
}

export interface PeopleDashboardRequestBudget {
  teamRequests: number;
  scheduleRequests: number;
  blockoutRequests: number;
  rosterPeopleCount: number;
  hydratedPeopleCount: number;
  sampled: boolean;
}

export interface PeopleDashboardData {
  range: PeopleDashboardRange;
  generatedAt: string;
  month: {
    year: number;
    monthIndex: number;
    label: string;
    daysInMonth: number;
    startsOnWeekday: number;
  };
  people: PeopleDashboardPerson[];
  stats: PeopleDashboardStats;
  monthDays: PeopleDashboardDay[];
  matrixDays: number[];
  requestBudget: PeopleDashboardRequestBudget;
}

export interface PeopleDashboardPersonDetail {
  generatedAt: string;
  month: PeopleDashboardData["month"];
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
    scheduleRequests: number;
    blockoutRequests: number;
  };
}

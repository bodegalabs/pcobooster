export const queryKeys = {
  accounts: () => ["planning-center-accounts"] as const,
  peopleFeature: () => ["people-feature"] as const,
  organizationTimeZone: () =>
    ["planning-center-organization-time-zone"] as const,
  serviceTypes: () => ["service-types"] as const,
  plans: (serviceTypeId: string | null) => ["plans", serviceTypeId] as const,
  teamPositions: (
    serviceTypeId: string | null,
    planId: string | null,
    _seriesId: string | null
  ) => ["team-positions", serviceTypeId, planId] as const,
  people: (
    serviceTypeId: string | null,
    teamId: string | null,
    positionId: string | null,
    planId: string | null,
    dateKey: string | null
  ) => ["people", serviceTypeId, teamId, positionId, planId, dateKey] as const,
  peopleForSlot: (
    serviceTypeId: string | null,
    teamId: string | null,
    positionId: string | null,
    planId: string | null
  ) => ["people", serviceTypeId, teamId, positionId, planId] as const,
  peopleSearch: (query: string) => ["people-search", query] as const,
  peopleHistoryWarmup: (serviceTypeId: string | null, dateKey: string | null) =>
    ["people-history-warmup", serviceTypeId, dateKey] as const,
  peopleDashboard: (range: string) => ["people-dashboard", range] as const,
  peopleDashboardPerson: (personId: string, month: string | null) =>
    ["people-dashboard-person", personId, month] as const,
  blockouts: (personId: string | null) => ["blockouts", personId] as const,
  scheduleHistory: (personId: string | null, days: number) =>
    ["schedule-history", personId, days] as const,
  myScheduledPlans: (planIdsKey: string) =>
    ["my-scheduled-plans", planIdsKey] as const,
  planItems: (serviceTypeId: string | null, planId: string | null) =>
    ["plan-items", serviceTypeId, planId] as const,
  planTimes: (serviceTypeId: string | null, planId: string | null) =>
    ["plan-times", serviceTypeId, planId] as const,
  songSearch: (serviceTypeId: string | null, query: string) =>
    ["song-search", serviceTypeId, query] as const,
  songOptions: (songId: string | null, serviceTypeId: string | null) =>
    ["song-options", songId, serviceTypeId] as const,
} as const;

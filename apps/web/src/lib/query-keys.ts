export const queryKeys = {
  accounts: () => ["planning-center-accounts"] as const,
  peopleFeature: () => ["people-feature"] as const,
  cleanupFeature: () => ["cleanup-feature"] as const,
  cleanupSongs: (staleMonths: number) =>
    ["cleanup-songs", staleMonths] as const,
  cleanupPeopleRoster: () => ["cleanup-people-roster"] as const,
  cleanupPeopleActivity: (staleMonths: number, personIds: readonly string[]) =>
    ["cleanup-people-activity", staleMonths, ...personIds] as const,
  organizationTimeZone: () =>
    ["planning-center-organization-time-zone"] as const,
  serviceTypes: () => ["service-types"] as const,
  plans: (serviceTypeId: string | null) => ["plans", serviceTypeId] as const,
  teamPositions: (
    serviceTypeId: string | null,
    planId: string | null,
    _seriesId: string | null
  ) => ["team-positions", serviceTypeId, planId] as const,
  /** Candidates for one slot, with the selected plan's roster; schedule writes patch these. */
  positionCandidates: (
    serviceTypeId: string | null,
    teamId: string | null,
    positionId: string | null,
    planId: string | null
  ) => ["people", serviceTypeId, teamId, positionId, planId] as const,
  planWindowHistory: (dateKey: string) =>
    ["people-plan-window-history", dateKey] as const,
  /** `historyPlanId` is set only when the details carry schedule history for that plan. */
  candidateDetails: (
    dateKey: string,
    historyPlanId: string | null,
    personIds: readonly string[]
  ) =>
    ["people-candidate-details", dateKey, historyPlanId, ...personIds] as const,
  peopleSearch: (query: string) => ["people-search", query] as const,
  peopleDashboardRoster: () => ["people-dashboard-roster"] as const,
  peopleDashboardActivity: (personIds: readonly string[]) =>
    ["people-dashboard-activity", ...personIds] as const,
  peopleDashboardPerson: (personId: string, month: string | null) =>
    ["people-dashboard-person", personId, month] as const,
  blockouts: (personId: string | null) => ["blockouts", personId] as const,
  myScheduledPlans: (planIdsKey: string) =>
    ["my-scheduled-plans", planIdsKey] as const,
  planItems: (serviceTypeId: string | null, planId: string | null) =>
    ["plan-items", serviceTypeId, planId] as const,
  planTimes: (serviceTypeId: string | null, planId: string | null) =>
    ["plan-times", serviceTypeId, planId] as const,
  songSearch: (query: string) => ["song-search", query] as const,
  songOptions: (songId: string | null, serviceTypeId: string | null) =>
    ["song-options", songId, serviceTypeId] as const,
} as const;

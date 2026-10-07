/**
 * Where People screens live, for links from other tabs and app-wide search. Hrefs and test ids
 * are stable: a person is addressed by their Planning Center person id alone.
 */
export const peopleDestinations = {
  home: "/people",
  /** A person; `month` is `YYYY-MM`, omitted for the current month. */
  person: (personId: string, month?: string | null): string => {
    const path = `/people/${encodeURIComponent(personId)}`;
    return month === undefined || month === null
      ? path
      : `${path}?month=${encodeURIComponent(month)}`;
  },
} as const;

/** Test ids for UI automation and search result targets. */
export const peopleTestIds = {
  list: "people-list",
  scopeMenu: "people-scope-menu",
  retrySchedules: "people-retry-schedules",
  retryRoster: "people-roster-retry",
  loadMore: "people-load-more",
  loadMatches: "people-load-matches",
  row: (personId: string) => `people-row-${personId}`,
  person: (personId: string) => `person-${personId}`,
  monthPrevious: "person-month-previous",
  monthNext: "person-month-next",
  blockouts: "person-blockouts",
  openPlanningCenter: "person-open-planning-center",
} as const;

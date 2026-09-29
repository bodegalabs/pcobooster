/**
 * Calendar days on each side of the selected plan/reference date when loading plans and
 * `team_members` for history merge (`getPeopleForPosition`).
 *
 * `buildFrequencyFromServiceHistory` uses the same span for `ScheduleFrequency.recentServedDays` /
 * `recentRehearsalOnlyDays` so UI and scoring match
 * the data we actually load.
 */
export const PLAN_HISTORY_HALF_RANGE_WEEKS = 4 as const;

export const PLAN_HISTORY_HALF_RANGE_DAYS = 28 as const;

/**
 * Rehearsals come before their service, so a plan up to a week after the history window can
 * still hold a rehearsal inside it. History reads plans this far past the window for those.
 */
export const REHEARSAL_WINDOW_MARGIN_DAYS = 7 as const;

export const formatPlanHistoryHalfRangeWeeksLabel = (
  weeks: number = PLAN_HISTORY_HALF_RANGE_WEEKS
): string => `${weeks} week${weeks === 1 ? "" : "s"}`;

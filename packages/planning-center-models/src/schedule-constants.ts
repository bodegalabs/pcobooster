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

/** Default nearby-schedule popover window (±3 weeks). */
export const SCHEDULE_CONTEXT_DEFAULT_HALF_RANGE_WEEKS = 3 as const;

export const SCHEDULE_CONTEXT_MAX_HALF_RANGE_WEEKS =
  PLAN_HISTORY_HALF_RANGE_WEEKS;

/** Whole-week options for the nearby-schedule popover (1 … max loaded weeks). */
export const getScheduleContextHalfRangeWeekOptions = (): number[] => {
  const options: number[] = [];
  for (
    let weeks = 1;
    weeks <= SCHEDULE_CONTEXT_MAX_HALF_RANGE_WEEKS;
    weeks += 1
  ) {
    options.push(weeks);
  }
  return options;
};

export const formatPlanHistoryHalfRangeWeeksLabel = (
  weeks: number = PLAN_HISTORY_HALF_RANGE_WEEKS
): string => `${weeks} week${weeks === 1 ? "" : "s"}`;

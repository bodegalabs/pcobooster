// Port of packages/planning-center-models/src/schedule-constants.ts. Pinned by the
// `calendar.scheduleConstants` and `calendar.planHistoryHalfRangeWeeksLabel` parity suites.

/// The schedule-history window around a plan. History loading, frequency counts, and
/// scoring all use the same span, so what the app shows matches the data it loaded.
public enum ScheduleConstants {
  /// Weeks on each side of the selected plan's date (`PLAN_HISTORY_HALF_RANGE_WEEKS`).
  public static let planHistoryHalfRangeWeeks = 4
  /// Calendar days on each side of the selected plan's date (`PLAN_HISTORY_HALF_RANGE_DAYS`).
  public static let planHistoryHalfRangeDays = 28
  /// Rehearsals come before their service, so a plan up to a week after the window can still
  /// hold a rehearsal inside it; history reads plans this far past the window
  /// (`REHEARSAL_WINDOW_MARGIN_DAYS`).
  public static let rehearsalWindowMarginDays = 7

  /// "4 weeks" or "1 week" (`formatPlanHistoryHalfRangeWeeksLabel`).
  public static func halfRangeWeeksLabel(_ weeks: Int = planHistoryHalfRangeWeeks) -> String {
    "\(weeks) week\(weeks == 1 ? "" : "s")"
  }
}

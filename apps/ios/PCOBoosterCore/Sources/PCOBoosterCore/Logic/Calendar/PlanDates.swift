import Foundation

// Port of the date helpers in apps/web/src/lib/service-plan-selection.ts. Pinned by the
// `calendar.formatPlan*`, `calendar.isInDateWindow`, and `calendar.groupPlansByMonthAndDay`
// parity suites.

/// "Sat, Oct 31, 2026" for the organization calendar day a plan falls on (`formatPlanDate`).
public func formatPlanDate(_ date: Date, timeZone: String) -> String {
  OrgCalendar.label(date, timeZone: timeZone, style: .weekdayMonthDayYear)
}

/// "October 2026": the organization month a plan falls in, for list section headings
/// (`formatPlanMonthHeading`).
public func formatPlanMonthHeading(_ date: Date, timeZone: String) -> String {
  OrgCalendar.label(date, timeZone: timeZone, style: .monthYear)
}

/// The month, day, and weekday on a plan's date tile.
public struct PlanDateTile: Hashable, Codable, Sendable {
  /// "Oct"
  public var month: String
  /// "31"
  public var day: String
  /// "Sat"
  public var weekday: String

  public init(month: String, day: String, weekday: String) {
    self.month = month
    self.day = day
    self.weekday = weekday
  }
}

/// The date tile for a plan, all in the organization's zone (`formatPlanDateTile`).
public func formatPlanDateTile(_ date: Date, timeZone: String) -> PlanDateTile {
  PlanDateTile(
    month: OrgCalendar.label(date, timeZone: timeZone, style: .monthShort),
    day: OrgCalendar.label(date, timeZone: timeZone, style: .dayOfMonth),
    weekday: OrgCalendar.label(date, timeZone: timeZone, style: .weekday)
  )
}

/// The furthest organization calendar day ahead that still gets a relative label.
private let relativeDayLabelLimit = 13

/// "Today", "Tomorrow", or "In 5 days" for a plan within the next two weeks of organization
/// calendar days; nil for past or later plans (`formatPlanRelativeDay`).
public func formatPlanRelativeDay(_ date: Date, now: Date, timeZone: String) -> String? {
  let days = OrgCalendar.daysBetween(now, date, timeZone: timeZone)
  if days < 0 || days > relativeDayLabelLimit {
    return nil
  }
  if days == 0 {
    return "Today"
  }
  if days == 1 {
    return "Tomorrow"
  }
  return "In \(days) days"
}

/// The plan list's date filter. Raw values match the web's stored and URL values.
public enum DateRangeFilter: String, CaseIterable, Codable, Sendable {
  case all
  case next14Days = "14"
  case next30Days = "30"
  case next60Days = "60"

  /// Calendar days after today the window reaches; nil for every date.
  public var days: Int? {
    switch self {
    case .all: nil
    case .next14Days: 14
    case .next30Days: 30
    case .next60Days: 60
    }
  }

  /// The web filter's option label, such as "Next 14 days".
  public var label: String {
    guard let days else {
      return "All dates"
    }
    return "Next \(days) days"
  }
}

/// Whether a plan falls between today and `range.days` organization calendar days from today,
/// both ends included (`isInDateWindow`, which reads the clock itself; pass `now`).
///
/// The window's end comes from `OrgCalendar.addDays`, so it inherits that function's extra
/// day in zones 12 or more hours ahead of UTC.
public func isInDateWindow(
  _ date: Date, range: DateRangeFilter, timeZone: String, now: Date
) -> Bool {
  guard let days = range.days else {
    return true
  }
  let nowKey = OrgCalendar.dayKey(now, timeZone: timeZone)
  let maxKey = OrgCalendar.addDays(to: nowKey, days, timeZone: timeZone)
  let dateKey = OrgCalendar.dayKey(date, timeZone: timeZone)
  return dateKey >= nowKey && dateKey <= maxKey
}

/// One organization calendar day of plans in the plan list.
public struct PlanDayGroup<Row> {
  /// The organization calendar day, `YYYY-MM-DD`.
  public var dayKey: String
  /// The first row's date.
  public var date: Date
  public var rows: [Row]

  public init(dayKey: String, date: Date, rows: [Row]) {
    self.dayKey = dayKey
    self.date = date
    self.rows = rows
  }
}

extension PlanDayGroup: Equatable where Row: Equatable {}
extension PlanDayGroup: Sendable where Row: Sendable {}

/// One organization month of plans in the plan list.
public struct PlanMonthGroup<Row> {
  /// "October 2026"
  public var heading: String
  public var days: [PlanDayGroup<Row>]

  public init(heading: String, days: [PlanDayGroup<Row>]) {
    self.heading = heading
    self.days = days
  }
}

extension PlanMonthGroup: Equatable where Row: Equatable {}
extension PlanMonthGroup: Sendable where Row: Sendable {}

/// Groups date-sorted rows into organization months, then organization calendar days,
/// keeping row order (`groupPlansByMonthAndDay`). A late-evening plan lands on its
/// organization day, not its UTC day. Like the TypeScript, a month or day only merges with
/// the one just before it, so unsorted rows repeat headings rather than reorder.
public func groupPlansByMonthAndDay<Row>(
  _ rows: [Row], timeZone: String, sortDate: (Row) -> Date
) -> [PlanMonthGroup<Row>] {
  var months: [PlanMonthGroup<Row>] = []
  for row in rows {
    let date = sortDate(row)
    let heading = formatPlanMonthHeading(date, timeZone: timeZone)
    let dayKey = OrgCalendar.dayKey(date, timeZone: timeZone)
    if months.last?.heading != heading {
      months.append(PlanMonthGroup(heading: heading, days: []))
    }
    let monthIndex = months.count - 1
    if months[monthIndex].days.last?.dayKey == dayKey {
      months[monthIndex].days[months[monthIndex].days.count - 1].rows.append(row)
    } else {
      months[monthIndex].days.append(PlanDayGroup(dayKey: dayKey, date: date, rows: [row]))
    }
  }
  return months
}

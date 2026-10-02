import Foundation

// Port of apps/web/src/components/people/calendar.ts: commitment markers and tones, status
// copy, calendar cells, and labels for days of the dashboard month. Pinned by the
// `people.calendar.*` parity suites.

/// The marker a commitment gets on calendars, the month grid, and their legends.
public enum CommitmentDot: String, CaseIterable, Codable, Sendable {
  case confirmed
  case pending
  case rehearsal

  /// What the dot means on a single commitment: "Confirmed", "Pending", or "Rehearsal".
  public var legendLabel: String {
    switch self {
    case .confirmed: "Confirmed"
    case .pending: "Pending"
    case .rehearsal: "Rehearsal"
    }
  }

  /// What the dot means on a heatmap day, which counts several people.
  public var heatmapLegendLabel: String {
    switch self {
    case .confirmed: "Everyone confirmed"
    case .pending: "Someone pending"
    case .rehearsal: "Rehearsal only"
    }
  }
}

/// How a month grid day is tinted: by how busy it is (`empty` to `peak`) or by one person's
/// commitment (`confirmed`, `scheduled`, `rehearsal`).
public enum MonthGridDayTone: String, CaseIterable, Codable, Sendable {
  case empty
  case light
  case busy
  case peak
  case confirmed
  case scheduled
  case rehearsal
}

/// Calendar helpers for the People month views.
public enum DashboardCalendar {
  /// A slot in a month grid: a day, or a blank before the first day.
  public struct Cell: Hashable, Sendable, Identifiable {
    /// "day-5", or "blank-start-0" for the blanks before the first day.
    public var key: String
    /// The day of the month; nil for a blank.
    public var day: Int?

    public var id: String { key }

    public init(key: String, day: Int?) {
      self.key = key
      self.day = day
    }
  }

  /// Column headings, Sunday first.
  public static let weekDayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  /// Planning Center's "C" or a status spelled "confirmed" (any case, trimmed).
  public static func isConfirmedStatus(_ status: String?) -> Bool {
    let raw = JSParity.trim(status ?? "")
    return raw == "C" || PeopleText.lowercased(raw) == "confirmed"
  }

  /// Confirmed or pending service, or a rehearsal.
  public static func commitmentDot(kind: PeopleDashboardDayKind, status: String?) -> CommitmentDot {
    if kind == .rehearsal {
      return .rehearsal
    }
    return isConfirmedStatus(status) ? .confirmed : .pending
  }

  /// A person's day tinted by their commitment (`commitmentCellTone`).
  public static func cellTone(kind: PeopleDashboardDayKind, status: String?) -> MonthGridDayTone {
    switch commitmentDot(kind: kind, status: status) {
    case .rehearsal: .rehearsal
    case .confirmed: .confirmed
    case .pending: .scheduled
    }
  }

  /// "Confirmed" or "Pending", as Services labels a scheduled person (`commitmentStatusLabel`).
  public static func statusLabel(_ status: String?) -> String {
    isConfirmedStatus(status) ? "Confirmed" : "Pending"
  }

  /// "Rehearsal", "Confirmed service", or "Pending service".
  public static func engagementLabel(kind: PeopleDashboardDayKind, status: String?) -> String {
    kind == .rehearsal ? "Rehearsal" : "\(statusLabel(status)) service"
  }

  /// The commitment a day shows when it has several: a confirmed service, else any service,
  /// else the first entry (`pickCalendarMarker`).
  public static func pickMarker(_ entries: [PeopleDashboardMonthDay]) -> PeopleDashboardMonthDay? {
    entries.first { $0.kind == .service && isConfirmedStatus($0.status) }
      ?? entries.first { $0.kind == .service }
      ?? entries.first
  }

  /// Blanks for the weekdays before the first day, then one cell per day
  /// (`buildCalendarCells`).
  public static func cells(startsOnWeekday: Int, daysInMonth: Int) -> [Cell] {
    let blanks = (0..<max(0, startsOnWeekday)).map { Cell(key: "blank-start-\($0)", day: nil) }
    let days = (0..<max(0, daysInMonth)).map { Cell(key: "day-\($0 + 1)", day: $0 + 1) }
    return blanks + days
  }

  /// `cells(startsOnWeekday:daysInMonth:)` for a dashboard month, whose fields are numbers in
  /// the contract (a fraction counts its whole part, as `Array.from` does).
  public static func cells(for month: PeopleDashboardMonth) -> [Cell] {
    cells(
      startsOnWeekday: JSParity.clampedInt(month.startsOnWeekday),
      daysInMonth: JSParity.clampedInt(month.daysInMonth))
  }

  /// "Oct 5" for a day of the dashboard month.
  public static func formatMonthDay(_ month: PeopleDashboardMonth, day: Int) -> String {
    label(month, day: day, style: .monthDay)
  }

  /// "Sun, Oct 5" for a day of the dashboard month.
  public static func formatWeekdayMonthDay(_ month: PeopleDashboardMonth, day: Int) -> String {
    label(month, day: day, style: .weekdayMonthDay)
  }

  /// "Sun" for a day of the dashboard month.
  public static func formatWeekday(_ month: PeopleDashboardMonth, day: Int) -> String {
    label(month, day: day, style: .weekday)
  }

  /// Heatmap tone for a day by the people serving; rehearsal-only days read as lightly busy
  /// (`heatLevelTone`).
  public static func heatLevel(serviceCount: Int, rehearsalCount: Int = 0) -> MonthGridDayTone {
    if serviceCount >= 8 {
      return .peak
    }
    if serviceCount >= 3 {
      return .busy
    }
    if serviceCount > 0 || rehearsalCount > 0 {
      return .light
    }
    return .empty
  }

  /// Labels UTC noon on the month's day, a civil-date carrier, in UTC, as the TypeScript does
  /// with `new Date(Date.UTC(year, monthIndex, day, 12))`: a day or month past its range rolls
  /// over, and years 0 to 99 mean 1900 to 1999. Fields beyond any real date read as an empty
  /// label, where the TypeScript throws.
  private static func label(
    _ month: PeopleDashboardMonth, day: Int, style: CalendarDateLabelStyle
  ) -> String {
    let limit = 100_000_000.0
    guard month.year.isFinite, month.monthIndex.isFinite,
      abs(month.year) <= limit, abs(month.monthIndex) <= limit, abs(day) <= Int(limit)
    else {
      return ""
    }
    let time = OrgCalendar.utcTime(
      year: Int(month.year), monthIndex: Int(month.monthIndex), day: day, hour: 12)
    guard abs(time) <= JSParity.maxTime else {
      return ""
    }
    return OrgCalendar.label(JSParity.date(time: time), timeZone: "UTC", style: style)
  }
}

import PCOBoosterCore
import SwiftUI

/// How a plan time's type reads and looks: its label, glyph, and the calm sage tint that ties a
/// row's bar to its block on the day timeline. Type is a fact, so the tints stay quiet (one hue,
/// three weights) and never signal status.
///
/// A wrapper rather than an extension on the generated `PlanTimeType`, so other features can
/// describe types their own way without colliding names.
struct PlanTimeKind: Hashable {
  let type: PlanTimeType

  init(_ type: PlanTimeType) {
    self.type = type
  }

  /// The type picker's order (web `timeTypeOptions`): rehearsal, service, other.
  static let pickerOrder: [PlanTimeType] = [.rehearsal, .service, .other]

  var label: String {
    switch type {
    case .service: "Service"
    case .rehearsal: "Rehearsal"
    case .other, .unknown: "Other"
    }
  }

  var symbol: AppSymbol {
    switch type {
    case .service: .services
    case .rehearsal: .reasonRehearsal
    case .other, .unknown: .times
    }
  }

  /// The row bar and timeline block fill.
  var tint: Color {
    switch type {
    case .service: .chart2
    case .rehearsal: .chart1
    case .other, .unknown: .inkTertiary
    }
  }

  /// The name a new time of this type starts with (`buildDefaultNewPlanTimeEdit`), or nil for
  /// types the web gives no default name.
  var defaultNewName: String? {
    switch type {
    case .service: "New service"
    case .rehearsal: "New rehearsal"
    case .other, .unknown: nil
    }
  }
}

/// Facts about one plan time the Times screen shows. Static functions instead of extensions on
/// the generated `PlanTime`, for the same reason as `PlanTimeKind`.
enum TimeFacts {
  /// Times the add sheet creates carry this id prefix until the server answers with the real id.
  static let pendingIdPrefix = "pending-"

  /// The name to show: the time's own name, or its type when Planning Center has none.
  static func displayName(_ time: PlanTime) -> String {
    let trimmed = time.name.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? PlanTimeKind(time.timeType).label : trimmed
  }

  /// The time's name says no more than its type ("Rehearsal" for a rehearsal, or no name), so
  /// the row shows the type once.
  static func nameRepeatsType(_ time: PlanTime) -> Bool {
    displayName(time).compare(PlanTimeKind(time.timeType).label, options: .caseInsensitive)
      == .orderedSame
  }

  /// Still being created: shown, but not editable until the server assigns its id.
  static func isPending(_ time: PlanTime) -> Bool {
    time.id.hasPrefix(pendingIdPrefix)
  }

  /// The end, or the start when the time has none (a point on the timeline).
  static func effectiveEnd(_ time: PlanTime) -> Date {
    max(time.endsAt ?? time.startsAt, time.startsAt)
  }

  /// Elapsed length in seconds, nil without an end. Elapsed time needs no zone.
  static func durationSeconds(_ time: PlanTime) -> Int? {
    guard let endsAt = time.endsAt, endsAt > time.startsAt else { return nil }
    return Int(endsAt.timeIntervalSince(time.startsAt))
  }

  /// "1h 15m", "45m".
  static func durationLabel(seconds: Int) -> String {
    Duration.seconds(seconds).formatted(.units(allowed: [.hours, .minutes], width: .narrow))
  }

  /// "1 hour, 15 minutes", for VoiceOver.
  static func spokenDuration(seconds: Int) -> String {
    Duration.seconds(seconds).formatted(.units(allowed: [.hours, .minutes], width: .wide))
  }

  /// "9:00 AM" in the organization's zone.
  static func clock(_ instant: Date, timeZone: String) -> String {
    OrgCalendar.timeOfDay(instant, timeZone: timeZone)
  }

  /// The end's clock, with its weekday when it falls on a later day ("Mon 1:00 AM").
  static func endClock(_ time: PlanTime, timeZone: String) -> String? {
    guard let endsAt = time.endsAt else { return nil }
    let clock = OrgCalendar.timeOfDay(endsAt, timeZone: timeZone)
    let sameDay =
      OrgCalendar.dayKey(endsAt, timeZone: timeZone)
      == OrgCalendar.dayKey(time.startsAt, timeZone: timeZone)
    return sameDay
      ? clock : "\(OrgCalendar.label(endsAt, timeZone: timeZone, style: .weekday)) \(clock)"
  }

  /// "Sun, Oct 4 · 9:00 AM - 10:15 AM" (web `formatPlanTimeRangeLabel` of the saved wall times).
  static func rangeLabel(_ time: PlanTime, timeZone: String) -> String {
    let starts = OrgCalendar.wallTime(time.startsAt, timeZone: timeZone)
    let ends = time.endsAt.map { OrgCalendar.wallTime($0, timeZone: timeZone) }
    return formatPlanTimeRangeLabel(
      startDate: starts.dateKey, startTime: starts.timeValue,
      endDate: ends?.dateKey ?? starts.dateKey, endTime: ends?.timeValue ?? "")
  }

  /// "Sunday, October 4, 9:00 AM to 10:15 AM", for VoiceOver.
  static func spokenRange(_ time: PlanTime, timeZone: String) -> String {
    let day = OrgCalendar.label(time.startsAt, timeZone: timeZone, style: .weekdayMonthDay)
    let start = clock(time.startsAt, timeZone: timeZone)
    guard let end = endClock(time, timeZone: timeZone) else { return "\(day), \(start)" }
    return "\(day), \(start) to \(end)"
  }
}

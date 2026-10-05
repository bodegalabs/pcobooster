import Foundation

// Port of packages/planning-center-models/src/calendar.ts and calendar-day.ts, plus
// `formatTimeOfDay` from apps/web/src/lib/plan-overview.ts. Pinned by the `calendar.*`
// parity suites in scripts/parity/calendar.parity.ts.

/// The label shapes `OrgCalendar.label` writes, named as in `formatCalendarDateLabel`.
public enum CalendarDateLabelStyle: String, CaseIterable, Codable, Sendable {
  /// "Sep 9"
  case monthDay
  /// "Sep 9, 2026"
  case monthDayYear
  /// "Wed, Sep 9"
  case weekdayMonthDay
  /// "Wed, Sep 9, 2026"
  case weekdayMonthDayYear
  /// "September 2026"
  case monthYear
  /// "Sep"
  case monthShort
  /// "Wed"
  case weekday
  /// "9"
  case dayOfMonth
}

/// A wall-clock minute in a zone, as the plan time editors show it.
public struct ZonedWallTime: Hashable, Codable, Sendable {
  /// `YYYY-MM-DD`.
  public var dateKey: String
  /// `HH:mm`, 24-hour.
  public var timeValue: String

  public init(dateKey: String, timeValue: String) {
    self.dateKey = dateKey
    self.timeValue = timeValue
  }
}

/// Calendar math and English date labels in an IANA zone. Pass the organization's zone
/// (from `catalog.organization`) for every congregation date, never the device's: a
/// late-evening Pacific service is already the next day in UTC.
///
/// The results match the TypeScript exactly, including its quirks, because they are computed
/// with integer arithmetic on the zone's UTC offset instead of `Calendar` or `DateFormatter`.
/// An empty zone means UTC. An unknown zone also falls back to UTC, where the TypeScript
/// throws; check `isValidTimeZone` once when the organization's zone loads.
public enum OrgCalendar {
  /// Whether `identifier` names a zone. Like `Intl`, matching ignores case
  /// (`america/los_angeles` works), and an empty identifier is UTC.
  public static func isValidTimeZone(_ identifier: String) -> Bool {
    resolveTimeZone(identifier) != nil
  }

  /// `YYYY-MM-DD` for the calendar day `instant` falls on in `timeZone`
  /// (`formatCalendarDayInTimeZone`).
  public static func dayKey(_ instant: Date, timeZone: String) -> String {
    dayKey(localFields(instant, timeZone: timeZone))
  }

  /// The day key `deltaDays` calendar days after `dayKey` (`addCalendarDaysToDayKey`).
  ///
  /// The key is already a civil date, so the shifted UTC-noon carrier is read in UTC.
  /// A malformed key comes back unchanged, where the TypeScript throws.
  public static func addDays(to dayKey: String, _ deltaDays: Int) -> String {
    guard let parts = integerComponents(dayKey, separator: "-", count: 3) else {
      return dayKey
    }
    // Any shift past 100,000,000 days leaves the JavaScript date range; clamping well beyond
    // that keeps the arithmetic from overflowing and still fails the range check below.
    let delta = min(max(deltaDays, -300_000_000), 300_000_000)
    let noon = utcTime(
      year: parts[0], monthIndex: parts[1] - 1, day: parts[2] + delta, hour: 12, minute: 0)
    guard abs(noon) <= JSParity.maxTime else {
      return dayKey
    }
    return self.dayKey(localFields(time: noon, in: zone("UTC")))
  }

  /// Calendar days from `itemDayKey` to `refDayKey` (ref minus item); positive when the
  /// reference day comes later (`orgCalendarDaysRefMinusItem`). A malformed key counts as
  /// 0 days, where the TypeScript returns NaN.
  public static func daysRefMinusItem(itemDayKey: String, refDayKey: String) -> Int {
    guard let item = integerComponents(itemDayKey, separator: "-", count: 3),
      let ref = integerComponents(refDayKey, separator: "-", count: 3)
    else {
      return 0
    }
    let itemTime = utcTime(year: item[0], monthIndex: item[1] - 1, day: item[2])
    let refTime = utcTime(year: ref[0], monthIndex: ref[1] - 1, day: ref[2])
    return JSParity.floorDivide(refTime - itemTime, millisecondsPerDay)
  }

  /// Calendar days from instant `a` to instant `b` in `timeZone` (b minus a)
  /// (`orgCalendarDaysBetween`).
  public static func daysBetween(_ a: Date, _ b: Date, timeZone: String) -> Int {
    daysRefMinusItem(
      itemDayKey: dayKey(a, timeZone: timeZone), refDayKey: dayKey(b, timeZone: timeZone))
  }

  /// English label for the calendar day `instant` falls on in `timeZone`, as `en-US`
  /// `Intl.DateTimeFormat` writes it (`formatCalendarDateLabel`).
  public static func label(
    _ instant: Date, timeZone: String, style: CalendarDateLabelStyle
  ) -> String {
    let fields = localFields(instant, timeZone: timeZone)
    let month = shortMonthNames[fields.month - 1]
    let weekday = shortWeekdayNames[fields.weekday]
    return switch style {
    case .monthDay: "\(month) \(fields.day)"
    case .monthDayYear: "\(month) \(fields.day), \(fields.year)"
    case .weekdayMonthDay: "\(weekday), \(month) \(fields.day)"
    case .weekdayMonthDayYear: "\(weekday), \(month) \(fields.day), \(fields.year)"
    case .monthYear: "\(longMonthNames[fields.month - 1]) \(fields.year)"
    case .monthShort: month
    case .weekday: weekday
    case .dayOfMonth: "\(fields.day)"
    }
  }

  /// The wall-clock date and minute of `instant` in `timeZone` (`formatWallTimeInTimeZone`).
  public static func wallTime(_ instant: Date, timeZone: String) -> ZonedWallTime {
    let fields = localFields(instant, timeZone: timeZone)
    return ZonedWallTime(
      dateKey: [
        JSParity.zeroPadded(fields.year, width: 4),
        JSParity.zeroPadded(fields.month, width: 2),
        JSParity.zeroPadded(fields.day, width: 2),
      ].joined(separator: "-"),
      timeValue: [
        JSParity.zeroPadded(fields.hour, width: 2),
        JSParity.zeroPadded(fields.minute, width: 2),
      ].joined(separator: ":")
    )
  }

  /// The instant a wall-clock date and time in `timeZone` names (`zonedWallTimeToUtcIso`).
  ///
  /// Uses the TypeScript's three fixed-point passes over the zone offset, so DST edges land
  /// the same way: a time skipped by spring-forward moves ahead by the gap (2:30 AM becomes
  /// 3:30 AM daylight time) and a time repeated by fall-back takes the first, daylight
  /// occurrence. Out-of-range fields roll over like `Date.UTC` (`24:00` is the next
  /// midnight). Nil when either value is malformed, where the TypeScript throws.
  public static func utcInstant(dateKey: String, timeValue: String, timeZone: String) -> Date? {
    guard let date = integerComponents(dateKey, separator: "-", count: 3),
      let time = integerComponents(timeValue, separator: ":", count: 2)
    else {
      return nil
    }
    let target = utcTime(
      year: date[0], monthIndex: date[1] - 1, day: date[2], hour: time[0], minute: time[1])
    guard abs(target) <= JSParity.maxTime else {
      return nil
    }
    let zone = zone(timeZone)
    var utc = target
    for _ in 0..<3 {
      utc = target - offsetMilliseconds(time: utc, in: zone)
    }
    guard abs(utc) <= JSParity.maxTime else {
      return nil
    }
    return JSParity.date(time: utc)
  }

  /// "9:30 AM": the time of day of `instant` in `timeZone` (`formatTimeOfDay` in
  /// apps/web/src/lib/plan-overview.ts).
  public static func timeOfDay(_ instant: Date, timeZone: String) -> String {
    let fields = localFields(instant, timeZone: timeZone)
    let hour = fields.hour % 12 == 0 ? 12 : fields.hour % 12
    let meridiem = fields.hour < 12 ? "AM" : "PM"
    return "\(hour):\(JSParity.zeroPadded(fields.minute, width: 2))\(meridiemSeparator)\(meridiem)"
  }
}

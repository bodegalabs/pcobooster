import Foundation
import Synchronization

/// Integer calendar arithmetic behind `OrgCalendar`. It reproduces what the TypeScript gets
/// from `Date.UTC` and `Intl.DateTimeFormat` without `Calendar` or `DateFormatter`, whose
/// locale data and DST policies can drift from the Node ICU output the parity fixtures pin.
/// Dates are proleptic Gregorian, like JavaScript's.
extension OrgCalendar {
  static let millisecondsPerMinute = 60_000
  static let millisecondsPerHour = 3_600_000
  static let millisecondsPerDay = 86_400_000

  static let shortMonthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ]
  static let longMonthNames = [
    "January", "February", "March", "April", "May", "June", "July", "August", "September",
    "October", "November", "December",
  ]
  /// Indexed by `LocalFields.weekday`, Sunday first.
  static let shortWeekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  /// What `Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" })` puts
  /// between the minutes and AM or PM. Node 24's ICU 78 writes a plain space (ICU 72 had
  /// switched to U+202F); the `calendar.timeOfDay` parity fixture pins what Node writes.
  static let meridiemSeparator = " "

  /// The wall-clock fields of an instant in a zone, to the minute.
  struct LocalFields: Equatable {
    var year: Int
    /// 1 to 12.
    var month: Int
    /// 1 to 31.
    var day: Int
    /// 0 to 23.
    var hour: Int
    var minute: Int
    /// 0 is Sunday.
    var weekday: Int
  }

  static func localFields(_ instant: Date, timeZone: String) -> LocalFields {
    localFields(time: JSParity.time(instant), in: zone(timeZone))
  }

  static func localFields(time: Int, in zone: TimeZone) -> LocalFields {
    let offsetSeconds = zone.secondsFromGMT(for: JSParity.date(time: time))
    let local = time + offsetSeconds * 1000
    let days = JSParity.floorDivide(local, millisecondsPerDay)
    let millisecondOfDay = local - days * millisecondsPerDay
    let civil = civilDate(fromDays: days)
    return LocalFields(
      year: civil.year,
      month: civil.month,
      day: civil.day,
      hour: millisecondOfDay / millisecondsPerHour,
      minute: millisecondOfDay % millisecondsPerHour / millisecondsPerMinute,
      // 1970-01-01 was a Thursday.
      weekday: JSParity.modulo(days + 4, 7)
    )
  }

  /// `formatCalendarDayInTimeZone` writes the `en-CA` date: a numeric (unpadded) year and
  /// two-digit month and day.
  static func dayKey(_ fields: LocalFields) -> String {
    "\(fields.year)-\(JSParity.zeroPadded(fields.month, width: 2))-\(JSParity.zeroPadded(fields.day, width: 2))"
  }

  /// The zone's offset at `time`, as the TypeScript's `getTimeZoneOffsetMs` measures it: the
  /// wall clock read to the minute, back through `Date.UTC`, minus the instant.
  static func offsetMilliseconds(time: Int, in zone: TimeZone) -> Int {
    let fields = localFields(time: time, in: zone)
    let wallClock = utcTime(
      year: fields.year, monthIndex: fields.month - 1, day: fields.day, hour: fields.hour,
      minute: fields.minute)
    return wallClock - time
  }

  /// `Date.UTC(year, monthIndex, day, hour, minute)` in milliseconds, quirks included: a month
  /// or day outside its range rolls into the next, and years 0 to 99 mean 1900 to 1999.
  /// Callers keep each field within 100,000,000 so the arithmetic cannot overflow.
  static func utcTime(year: Int, monthIndex: Int, day: Int, hour: Int = 0, minute: Int = 0) -> Int {
    let fullYear = (0...99).contains(year) ? 1900 + year : year
    let rolledYear = fullYear + JSParity.floorDivide(monthIndex, 12)
    let month = JSParity.modulo(monthIndex, 12) + 1
    let days = daysFromCivil(year: rolledYear, month: month, day: 1) + day - 1
    return days * millisecondsPerDay + hour * millisecondsPerHour + minute * millisecondsPerMinute
  }

  /// Days since 1970-01-01 for a proleptic Gregorian date (Howard Hinnant's `days_from_civil`).
  static func daysFromCivil(year: Int, month: Int, day: Int) -> Int {
    let shiftedYear = month <= 2 ? year - 1 : year
    let era = JSParity.floorDivide(shiftedYear, 400)
    let yearOfEra = shiftedYear - era * 400
    let marchMonth = (month + 9) % 12
    let dayOfYear = (153 * marchMonth + 2) / 5 + day - 1
    let dayOfEra = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear
    return era * 146_097 + dayOfEra - 719_468
  }

  /// The proleptic Gregorian date `days` after 1970-01-01 (Hinnant's `civil_from_days`).
  static func civilDate(fromDays days: Int) -> (year: Int, month: Int, day: Int) {
    let shifted = days + 719_468
    let era = JSParity.floorDivide(shifted, 146_097)
    let dayOfEra = shifted - era * 146_097
    let yearOfEra = (dayOfEra - dayOfEra / 1460 + dayOfEra / 36524 - dayOfEra / 146_096) / 365
    let dayOfYear = dayOfEra - (365 * yearOfEra + yearOfEra / 4 - yearOfEra / 100)
    let marchMonth = (5 * dayOfYear + 2) / 153
    let day = dayOfYear - (153 * marchMonth + 2) / 5 + 1
    let month = marchMonth < 10 ? marchMonth + 3 : marchMonth - 9
    return (yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day)
  }

  /// The numbers in a `-` or `:` separated key, read like the TypeScript's
  /// `key.split(separator).map(Number)`: extra parts are ignored and an empty part is 0. Nil
  /// when a part is missing or is not a plain integer within 100,000,000 (the TypeScript
  /// gets NaN or an out-of-range date there and throws).
  static func integerComponents(
    _ key: String, separator: Unicode.Scalar, count: Int
  ) -> [Int]? {
    let parts = JSParity.split(key, separator: separator)
    guard parts.count >= count else {
      return nil
    }
    var values: [Int] = []
    for part in parts.prefix(count) {
      let trimmed = JSParity.trim(part)
      if trimmed.isEmpty {
        values.append(0)
        continue
      }
      guard let value = Int(trimmed), value.magnitude <= 100_000_000 else {
        return nil
      }
      values.append(value)
    }
    return values
  }

  /// The zone for an identifier, UTC when it is empty or unknown.
  static func zone(_ identifier: String) -> TimeZone {
    resolveTimeZone(identifier) ?? .gmt
  }

  /// Lookups are cached; an organization uses one zone and every label resolves it.
  private static let resolvedZones = Mutex<[String: TimeZone?]>([:])

  static func resolveTimeZone(_ identifier: String) -> TimeZone? {
    let name = identifier.isEmpty ? "UTC" : identifier
    if let cached = resolvedZones.withLock({ $0[name] }) {
      return cached
    }
    let zone = lookUpTimeZone(name)
    resolvedZones.withLock { $0[name] = zone }
    return zone
  }

  /// UTC spellings `Intl` accepts that `TimeZone(identifier:)` may not, lowercased.
  private static let utcAliases: Set<String> = [
    "utc", "etc/utc", "uct", "etc/uct", "gmt", "etc/gmt", "gmt0", "etc/gmt0", "gmt+0", "etc/gmt+0",
    "gmt-0", "etc/gmt-0", "greenwich", "etc/greenwich", "universal", "etc/universal", "zulu",
    "etc/zulu",
  ]

  private static func lookUpTimeZone(_ name: String) -> TimeZone? {
    if let zone = TimeZone(identifier: name) {
      return zone
    }
    // `Intl` matches IANA names case-insensitively; `TimeZone(identifier:)` does not.
    let folded = name.lowercased()
    if utcAliases.contains(folded) {
      return .gmt
    }
    guard
      let canonical = TimeZone.knownTimeZoneIdentifiers.first(where: { $0.lowercased() == folded })
    else {
      return nil
    }
    return TimeZone(identifier: canonical)
  }
}

import Foundation
import PCOBoosterCore

/// A civil date in the org calendar, `YYYY-MM-DD` on the wire.
struct MockDay: Sendable, Hashable {
  let year: Int
  let month: Int
  let day: Int

  init(year: Int, month: Int, day: Int) {
    self.year = year
    self.month = month
    self.day = day
  }

  /// Parses exactly `YYYY-MM-DD`.
  init?(key: String) {
    let parts = key.split(separator: "-", omittingEmptySubsequences: false)
    guard key.count == 10, parts.count == 3, parts[0].count == 4, parts[1].count == 2,
      parts[2].count == 2, let year = Int(parts[0]), let month = Int(parts[1]),
      let day = Int(parts[2]), (1...12).contains(month), (1...31).contains(day)
    else { return nil }
    self.init(year: year, month: month, day: day)
  }

  var key: String {
    String(format: "%04d-%02d-%02d", year, month, day)
  }
}

/// A calendar month, `YYYY-MM` on the wire.
struct MockMonth: Sendable, Hashable {
  let year: Int
  /// 1 to 12.
  let month: Int

  init(year: Int, month: Int) {
    let index = year * 12 + (month - 1)
    self.year = index.floorDivided(by: 12)
    self.month = index.floorModulo(12) + 1
  }

  init(_ day: MockDay) {
    self.init(year: day.year, month: day.month)
  }

  /// Parses exactly `YYYY-MM`.
  init?(key: String) {
    let parts = key.split(separator: "-", omittingEmptySubsequences: false)
    guard key.count == 7, parts.count == 2, let year = Int(parts[0]), let month = Int(parts[1]),
      (1...12).contains(month)
    else { return nil }
    self.init(year: year, month: month)
  }

  var key: String { String(format: "%04d-%02d", year, month) }

  var firstDay: MockDay { MockDay(year: year, month: month, day: 1) }

  func adding(months: Int) -> MockMonth { MockMonth(year: year, month: month + months) }

  func months(to other: MockMonth) -> Int {
    (other.year * 12 + other.month) - (year * 12 + month)
  }
}

extension Int {
  fileprivate func floorDivided(by divisor: Int) -> Int {
    let quotient = self / divisor
    return (self % divisor != 0 && (self < 0) != (divisor < 0)) ? quotient - 1 : quotient
  }

  fileprivate func floorModulo(_ divisor: Int) -> Int {
    ((self % divisor) + divisor) % divisor
  }
}

/// Moves fixture dates, written around the anchor Sunday, so that Sunday becomes the coming
/// Sunday (today, on a Sunday) in the org zone. Shifts are whole weeks, so weekdays and wall
/// clock times stay as written, across daylight saving changes too.
struct MockCalendar: Sendable {
  let timeZone: TimeZone
  /// Days added to every fixture date; a multiple of 7.
  let dayShift: Int
  /// Today in the org zone, after the shift.
  let today: MockDay

  private let zoned: Calendar
  private let civil: Calendar

  init(now: Date, anchorSunday: MockDay, timeZone: TimeZone) {
    var zoned = Calendar(identifier: .gregorian)
    zoned.timeZone = timeZone
    var civil = Calendar(identifier: .gregorian)
    civil.timeZone = .gmt
    self.zoned = zoned
    self.civil = civil
    self.timeZone = timeZone
    let parts = zoned.dateComponents([.year, .month, .day, .weekday], from: now)
    let today = MockDay(year: parts.year ?? 0, month: parts.month ?? 1, day: parts.day ?? 1)
    self.today = today
    // Gregorian weekdays run 1 (Sunday) to 7 (Saturday).
    let daysToSunday = (8 - (parts.weekday ?? 1)) % 7
    let comingSunday = Self.adding(daysToSunday, to: today, in: civil)
    dayShift = Self.days(from: anchorSunday, to: comingSunday, in: civil)
  }

  /// Rewrites an ISO 8601 date-time or a `YYYY-MM-DD` day; any other string is returned as is.
  func shift(_ text: String) -> String {
    if let day = MockDay(key: text) {
      return adding(dayShift, to: day).key
    }
    guard Self.looksLikeDateTime(text), let date = JSONCoding.parseISODate(text) else {
      return text
    }
    return JSONCoding.isoString(shift(date))
  }

  /// The same wall clock time `dayShift` days later in the org zone.
  func shift(_ date: Date) -> Date {
    zoned.date(byAdding: .day, value: dayShift, to: date) ?? date
  }

  func shift(_ value: MockJSON) -> MockJSON {
    dayShift == 0 ? value : value.mappingStrings(shift)
  }

  func adding(_ days: Int, to day: MockDay) -> MockDay {
    Self.adding(days, to: day, in: civil)
  }

  func days(from start: MockDay, to end: MockDay) -> Int {
    Self.days(from: start, to: end, in: civil)
  }

  /// 0 for Sunday to 6 for Saturday, as `Date.getUTCDay()` counts.
  func weekday(of day: MockDay) -> Int {
    (civil.component(.weekday, from: civilDate(day)) + 6) % 7
  }

  func daysInMonth(_ month: MockMonth) -> Int {
    civil.range(of: .day, in: .month, for: civilDate(month.firstDay))?.count ?? 30
  }

  private func civilDate(_ day: MockDay) -> Date {
    Self.civilDate(day, in: civil)
  }

  private static func civilDate(_ day: MockDay, in civil: Calendar) -> Date {
    civil.date(from: DateComponents(year: day.year, month: day.month, day: day.day, hour: 12))
      ?? .distantPast
  }

  private static func adding(_ days: Int, to day: MockDay, in civil: Calendar) -> MockDay {
    let date = civil.date(byAdding: .day, value: days, to: civilDate(day, in: civil)) ?? .distantPast
    let parts = civil.dateComponents([.year, .month, .day], from: date)
    return MockDay(year: parts.year ?? 0, month: parts.month ?? 1, day: parts.day ?? 1)
  }

  private static func days(from start: MockDay, to end: MockDay, in civil: Calendar) -> Int {
    civil.dateComponents([.day], from: civilDate(start, in: civil), to: civilDate(end, in: civil))
      .day ?? 0
  }

  /// A cheap shape check before parsing: `YYYY-MM-DDTHH:MM...`.
  private static func looksLikeDateTime(_ text: String) -> Bool {
    let utf8 = Array(text.utf8.prefix(11))
    return text.utf8.count >= 20 && utf8.count == 11 && utf8[4] == UInt8(ascii: "-")
      && utf8[7] == UInt8(ascii: "-") && utf8[10] == UInt8(ascii: "T")
  }
}

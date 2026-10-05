import Foundation

// Ports of the primitive-typed copy helpers in apps/web/src/lib/team-health.ts. Pinned by the
// `text.describeCadence`, `text.describeDaysAgo`, `text.formatDayKey`, and
// `text.formatWeekdayDayKey` parity suites.

/// Serving-rhythm copy for the People screens.
public enum TeamHealthText {
  /// "every week", "every 3 weeks", "about monthly" for a typical gap in days
  /// (`describeCadence`). A non-finite gap reads as "every week".
  public static func describeCadence(typicalGapDays: Double) -> String {
    let weeks = max(1, JSParity.clampedInt(JSParity.round(typicalGapDays / 7)))
    if weeks == 1 {
      return "every week"
    }
    if weeks == 4 {
      return "about monthly"
    }
    return "every \(weeks) weeks"
  }

  /// "today", "yesterday", "5 days ago", "3 weeks ago", "4 months ago" for a count of
  /// calendar days (`describeDaysAgo`).
  public static func describeDaysAgo(_ days: Int) -> String {
    if days <= 0 {
      return "today"
    }
    if days == 1 {
      return "yesterday"
    }
    if days < 14 {
      return "\(days) days ago"
    }
    if days < 60 {
      return "\(JSParity.clampedInt(JSParity.round(Double(days) / 7))) weeks ago"
    }
    return "\(JSParity.clampedInt(JSParity.round(Double(days) / 30))) months ago"
  }

  /// "Jul 12" for an organization `YYYY-MM-DD` day (`formatDayKey`). A key JavaScript's
  /// date parser rejects comes back unchanged, where the TypeScript throws.
  public static func formatDayKey(_ dayKey: String) -> String {
    label(dayKey, style: .monthDay)
  }

  /// "Sun, Jul 12" for an organization `YYYY-MM-DD` day (`formatWeekdayDayKey`).
  public static func formatWeekdayDayKey(_ dayKey: String) -> String {
    label(dayKey, style: .weekdayMonthDay)
  }

  /// Labels UTC noon on the day, a civil-date carrier, in UTC, as the TypeScript does with
  /// `new Date(`${dayKey}T12:00:00Z`)`.
  private static func label(_ dayKey: String, style: CalendarDateLabelStyle) -> String {
    guard let noon = utcNoon(dayKey) else {
      return dayKey
    }
    return OrgCalendar.label(noon, timeZone: "UTC", style: style)
  }

  /// UTC noon on `dayKey`, accepting what V8 parses in `YYYY-MM-DDT12:00:00Z`: a four-digit
  /// year (or a signed six-digit one), month 01 to 12, and day 01 to 31, where a day past the
  /// month's end rolls into the next month ("2026-02-30" is March 2).
  private static func utcNoon(_ dayKey: String) -> Date? {
    var text = Substring(dayKey)
    var yearSign = 1
    var yearLength = 4
    if let sign = text.first, sign == "+" || sign == "-" {
      yearSign = sign == "-" ? -1 : 1
      yearLength = 6
      text = text.dropFirst()
    }
    let parts = text.split(separator: "-", omittingEmptySubsequences: false)
    guard parts.count == 3,
      parts[0].utf8.count == yearLength, parts[1].utf8.count == 2, parts[2].utf8.count == 2,
      parts.allSatisfy({ $0.utf8.allSatisfy { (0x30...0x39).contains($0) } }),
      let yearDigits = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]),
      (1...12).contains(month), (1...31).contains(day),
      // V8 rejects "-000000", the one year with two spellings.
      yearSign == 1 || yearDigits != 0
    else {
      return nil
    }
    let days =
      OrgCalendar.daysFromCivil(year: yearSign * yearDigits, month: month, day: 1) + day - 1
    let noon = days * OrgCalendar.millisecondsPerDay + 12 * OrgCalendar.millisecondsPerHour
    guard abs(noon) <= JSParity.maxTime else {
      return nil
    }
    return JSParity.date(time: noon)
  }
}

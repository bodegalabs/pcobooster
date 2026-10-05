import Foundation
import PCOBoosterCore
import Testing

/// Replays the `calendar.*` fixtures that scripts/parity/calendar.parity.ts writes from
/// packages/planning-center-models/src/calendar.ts, schedule-constants.ts, and
/// `formatTimeOfDay`.
struct OrgCalendarParityTests {
  struct InstantInput: Decodable, Sendable {
    let instant: Date
    let timeZone: String
  }

  struct WallTimeInput: Decodable, Sendable {
    let dateKey: String
    let timeValue: String
    let timeZone: String
  }

  struct AddDaysInput: Decodable, Sendable {
    let dayKey: String
    let deltaDays: Int
  }

  struct DayKeyPairInput: Decodable, Sendable {
    let itemDayKey: String
    let refDayKey: String
  }

  struct InstantPairInput: Decodable, Sendable {
    let a: Date
    let b: Date
    let timeZone: String
  }

  struct WeeksInput: Decodable, Sendable {
    let weeks: Int?
  }

  @Test(arguments: Parity.cases("calendar.dayKey", InstantInput.self, String.self))
  func dayKey(_ parity: ParityCase<InstantInput, String>) {
    let input = parity.input
    #expect(OrgCalendar.dayKey(input.instant, timeZone: input.timeZone) == parity.output)
  }

  @Test(arguments: Parity.cases("calendar.wallTime", InstantInput.self, ZonedWallTime.self))
  func wallTime(_ parity: ParityCase<InstantInput, ZonedWallTime>) {
    let input = parity.input
    #expect(OrgCalendar.wallTime(input.instant, timeZone: input.timeZone) == parity.output)
  }

  @Test(arguments: Parity.cases("calendar.timeOfDay", InstantInput.self, String.self))
  func timeOfDay(_ parity: ParityCase<InstantInput, String>) {
    let input = parity.input
    #expect(OrgCalendar.timeOfDay(input.instant, timeZone: input.timeZone) == parity.output)
  }

  @Test(arguments: Parity.cases("calendar.label", InstantInput.self, [String: String].self))
  func label(_ parity: ParityCase<InstantInput, [String: String]>) {
    let input = parity.input
    #expect(parity.output.count == CalendarDateLabelStyle.allCases.count)
    for style in CalendarDateLabelStyle.allCases {
      #expect(
        OrgCalendar.label(input.instant, timeZone: input.timeZone, style: style)
          == parity.output[style.rawValue],
        "\(style)")
    }
  }

  @Test(arguments: Parity.cases("calendar.utcInstant", WallTimeInput.self, Date?.self))
  func utcInstant(_ parity: ParityCase<WallTimeInput, Date?>) {
    let input = parity.input
    let instant = OrgCalendar.utcInstant(
      dateKey: input.dateKey, timeValue: input.timeValue, timeZone: input.timeZone)
    #expect(instant.map(epochMilliseconds) == parity.output.map(epochMilliseconds))
  }

  @Test(arguments: Parity.cases("calendar.addDays", AddDaysInput.self, String.self))
  func addDays(_ parity: ParityCase<AddDaysInput, String>) {
    let input = parity.input
    #expect(
      OrgCalendar.addDays(to: input.dayKey, input.deltaDays)
        == parity.output)
  }

  @Test(arguments: Parity.cases("calendar.daysRefMinusItem", DayKeyPairInput.self, Int.self))
  func daysRefMinusItem(_ parity: ParityCase<DayKeyPairInput, Int>) {
    let input = parity.input
    #expect(
      OrgCalendar.daysRefMinusItem(itemDayKey: input.itemDayKey, refDayKey: input.refDayKey)
        == parity.output)
  }

  @Test(arguments: Parity.cases("calendar.daysBetween", InstantPairInput.self, Int.self))
  func daysBetween(_ parity: ParityCase<InstantPairInput, Int>) {
    let input = parity.input
    #expect(OrgCalendar.daysBetween(input.a, input.b, timeZone: input.timeZone) == parity.output)
  }

  @Test(arguments: Parity.cases("calendar.scheduleConstants", String.self, [String: Int].self))
  func scheduleConstants(_ parity: ParityCase<String, [String: Int]>) {
    #expect(
      parity.output == [
        "planHistoryHalfRangeDays": ScheduleConstants.planHistoryHalfRangeDays,
        "planHistoryHalfRangeWeeks": ScheduleConstants.planHistoryHalfRangeWeeks,
        "rehearsalWindowMarginDays": ScheduleConstants.rehearsalWindowMarginDays,
      ])
  }

  @Test(
    arguments: Parity.cases("calendar.planHistoryHalfRangeWeeksLabel", WeeksInput.self, String.self)
  )
  func halfRangeWeeksLabel(_ parity: ParityCase<WeeksInput, String>) {
    let label =
      parity.input.weeks.map { ScheduleConstants.halfRangeWeeksLabel($0) }
      ?? ScheduleConstants.halfRangeWeeksLabel()
    #expect(label == parity.output)
  }
}

/// Whole milliseconds, so dates compare the way `toISOString()` writes them.
private func epochMilliseconds(_ date: Date) -> Int {
  Int((date.timeIntervalSince1970 * 1000).rounded())
}

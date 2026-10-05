import Foundation
import PCOBoosterCore
import Testing

/// Behavior the parity fixtures can't pin: where the TypeScript throws or returns NaN, the
/// Swift port answers instead, and zone lookups are shared across threads.
struct OrgCalendarTests {
  /// Wednesday September 9, 2026, 7:00 PM in Los Angeles; Thursday in UTC.
  private static let latePacificEvening = Date(timeIntervalSince1970: 1_789_005_600)

  @Test func unknownZonesFallBackToUTC() {
    let instant = Self.latePacificEvening
    #expect(!OrgCalendar.isValidTimeZone("Not/AZone"))
    #expect(OrgCalendar.dayKey(instant, timeZone: "Not/AZone") == "2026-09-10")
    #expect(OrgCalendar.label(instant, timeZone: "Not/AZone", style: .monthDay) == "Sep 10")
  }

  @Test func zoneNamesMatchIgnoringCaseLikeIntl() {
    #expect(OrgCalendar.isValidTimeZone("America/Los_Angeles"))
    #expect(OrgCalendar.isValidTimeZone("america/los_angeles"))
    #expect(OrgCalendar.isValidTimeZone("utc"))
    #expect(OrgCalendar.isValidTimeZone(""))
    #expect(
      OrgCalendar.label(Self.latePacificEvening, timeZone: "america/los_angeles", style: .monthDay)
        == "Sep 9")
  }

  @Test func malformedKeysAnswerInsteadOfThrowing() {
    #expect(OrgCalendar.addDays(to: "not-a-day", 3) == "not-a-day")
    #expect(OrgCalendar.addDays(to: "2026-05", 3) == "2026-05")
    #expect(OrgCalendar.daysRefMinusItem(itemDayKey: "garbage", refDayKey: "2026-09-25") == 0)
    #expect(
      OrgCalendar.utcInstant(dateKey: "2026-05-24", timeValue: "nine", timeZone: "UTC") == nil)
    #expect(
      OrgCalendar.utcInstant(dateKey: "999999999-01-01", timeValue: "00:00", timeZone: "UTC") == nil
    )
  }

  @Test func shiftsBeyondTheDateRangeLeaveTheKeyAlone() {
    #expect(OrgCalendar.addDays(to: "2026-09-25", .max) == "2026-09-25")
    #expect(OrgCalendar.addDays(to: "2026-09-25", .min) == "2026-09-25")
    #expect(OrgCalendar.addDays(to: "2026-09-25", 100_000_000) == "2026-09-25")
  }

  @Test func instantsBefore1970() throws {
    let instant = try #require(JSONCoding.parseISODate("1969-12-31T23:59:59.999Z"))
    #expect(OrgCalendar.dayKey(instant, timeZone: "UTC") == "1969-12-31")
    #expect(
      OrgCalendar.label(instant, timeZone: "UTC", style: .weekdayMonthDayYear)
        == "Wed, Dec 31, 1969")
    #expect(
      OrgCalendar.wallTime(instant, timeZone: "UTC")
        == ZonedWallTime(dateKey: "1969-12-31", timeValue: "23:59"))
  }

  @Test func skippedAndRepeatedTimesLandLikeTheWeb() throws {
    // 2:30 AM doesn't exist on spring-forward day; it moves ahead to 3:30 AM daylight time.
    let skipped = try #require(
      OrgCalendar.utcInstant(
        dateKey: "2026-03-08", timeValue: "02:30", timeZone: "America/Los_Angeles"))
    #expect(JSONCoding.isoString(skipped) == "2026-03-08T10:30:00.000Z")
    // 1:30 AM happens twice on fall-back day; the first, daylight one wins.
    let repeated = try #require(
      OrgCalendar.utcInstant(
        dateKey: "2026-11-01", timeValue: "01:30", timeZone: "America/Los_Angeles"))
    #expect(JSONCoding.isoString(repeated) == "2026-11-01T08:30:00.000Z")
  }

  @Test(arguments: [
    "America/Los_Angeles", "Pacific/Auckland", "Pacific/Chatham", "America/St_Johns",
    "Asia/Kolkata",
  ])
  func wallTimesRoundTripOnOrdinaryDays(timeZone: String) throws {
    for hour in stride(from: 0, to: 24, by: 3) {
      let wallTime = ZonedWallTime(
        dateKey: "2026-06-15", timeValue: String(format: "%02d:45", hour))
      let instant = try #require(
        OrgCalendar.utcInstant(
          dateKey: wallTime.dateKey, timeValue: wallTime.timeValue, timeZone: timeZone))
      #expect(OrgCalendar.wallTime(instant, timeZone: timeZone) == wallTime)
    }
  }

  @Test func zoneLookupsAreSafeAcrossTasks() async {
    let zones = ["America/Los_Angeles", "Asia/Tokyo", "Pacific/Auckland", "Europe/London", "UTC"]
    let expected = zones.map { OrgCalendar.dayKey(Self.latePacificEvening, timeZone: $0) }
    let results = await withTaskGroup(of: [String].self) { group in
      for _ in 0..<32 {
        group.addTask {
          zones.map { OrgCalendar.dayKey(Self.latePacificEvening, timeZone: $0) }
        }
      }
      return await group.reduce(into: []) { $0.append($1) }
    }
    #expect(results.count == 32)
    #expect(results.allSatisfy { $0 == expected })
  }

  @Test func scheduleConstantLabels() {
    #expect(ScheduleConstants.halfRangeWeeksLabel() == "4 weeks")
    #expect(ScheduleConstants.halfRangeWeeksLabel(1) == "1 week")
  }
}

struct PlanDatesTests {
  @Test func dateRangeFiltersMatchTheWebOptions() {
    #expect(DateRangeFilter.allCases.map(\.rawValue) == ["all", "14", "30", "60"])
    #expect(
      DateRangeFilter.allCases.map(\.label)
        == ["All dates", "Next 14 days", "Next 30 days", "Next 60 days"])
    #expect(DateRangeFilter.allCases.map(\.days) == [nil, 14, 30, 60])
  }

  @Test func aucklandWindowEndsOnTheLastOrgDay() throws {
    let now = try #require(JSONCoding.parseISODate("2026-12-16T20:00:00.000Z"))
    let lastDay = try #require(JSONCoding.parseISODate("2026-12-31T06:00:00.000Z"))
    let followingDay = try #require(JSONCoding.parseISODate("2026-12-31T21:00:00.000Z"))
    #expect(
      isInDateWindow(
        lastDay, range: .next14Days, timeZone: "Pacific/Auckland", now: now))
    #expect(
      !isInDateWindow(
        followingDay, range: .next14Days, timeZone: "Pacific/Auckland",
        now: now))
  }

  @Test func groupingKeepsRowsAndOrder() throws {
    struct Row: Equatable {
      let id: String
      let date: Date
    }
    let rows = try [
      "2026-10-31T16:00:00.000Z", "2026-11-01T02:00:00.000Z", "2026-11-01T17:00:00.000Z",
    ]
    .enumerated().map { index, iso in
      Row(id: "plan-\(index)", date: try #require(JSONCoding.parseISODate(iso)))
    }
    let months = groupPlansByMonthAndDay(rows, timeZone: "America/Los_Angeles", sortDate: \.date)
    #expect(months.map(\.heading) == ["October 2026", "November 2026"])
    #expect(months[0].days.map(\.rows) == [[rows[0], rows[1]]])
    #expect(months[1].days.map(\.dayKey) == ["2026-11-01"])
  }
}

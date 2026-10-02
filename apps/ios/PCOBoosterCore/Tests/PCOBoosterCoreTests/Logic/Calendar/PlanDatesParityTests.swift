import Foundation
import PCOBoosterCore
import Testing

/// Replays the plan list date fixtures that scripts/parity/calendar.parity.ts writes from
/// apps/web/src/lib/service-plan-selection.ts.
struct PlanDatesParityTests {
  struct InstantInput: Decodable, Sendable {
    let instant: Date
    let timeZone: String
  }

  struct RelativeDayInput: Decodable, Sendable {
    let date: Date
    let now: Date
    let timeZone: String
  }

  struct DateWindowInput: Decodable, Sendable {
    let date: Date
    let now: Date
    let range: DateRangeFilter
    let timeZone: String
  }

  struct GroupRow: Decodable, Sendable, Equatable {
    let planId: String
    let sortDate: Date
  }

  struct GroupPlansInput: Decodable, Sendable {
    let rows: [GroupRow]
    let timeZone: String
  }

  struct GroupedDay: Decodable, Sendable, Equatable {
    let date: Date
    let dayKey: String
    let planIds: [String]
  }

  struct GroupedMonth: Decodable, Sendable, Equatable {
    let days: [GroupedDay]
    let heading: String
  }

  @Test(arguments: Parity.cases("calendar.formatPlanDate", InstantInput.self, String.self))
  func planDate(_ parity: ParityCase<InstantInput, String>) {
    let input = parity.input
    #expect(formatPlanDate(input.instant, timeZone: input.timeZone) == parity.output)
  }

  @Test(arguments: Parity.cases("calendar.formatPlanMonthHeading", InstantInput.self, String.self))
  func planMonthHeading(_ parity: ParityCase<InstantInput, String>) {
    let input = parity.input
    #expect(formatPlanMonthHeading(input.instant, timeZone: input.timeZone) == parity.output)
  }

  @Test(
    arguments: Parity.cases("calendar.formatPlanDateTile", InstantInput.self, PlanDateTile.self))
  func planDateTile(_ parity: ParityCase<InstantInput, PlanDateTile>) {
    let input = parity.input
    #expect(formatPlanDateTile(input.instant, timeZone: input.timeZone) == parity.output)
  }

  @Test(
    arguments: Parity.cases("calendar.formatPlanRelativeDay", RelativeDayInput.self, String?.self))
  func planRelativeDay(_ parity: ParityCase<RelativeDayInput, String?>) {
    let input = parity.input
    #expect(
      formatPlanRelativeDay(input.date, now: input.now, timeZone: input.timeZone) == parity.output)
  }

  @Test(arguments: Parity.cases("calendar.isInDateWindow", DateWindowInput.self, Bool.self))
  func dateWindow(_ parity: ParityCase<DateWindowInput, Bool>) {
    let input = parity.input
    #expect(
      isInDateWindow(input.date, range: input.range, timeZone: input.timeZone, now: input.now)
        == parity.output)
  }

  @Test(
    arguments: Parity.cases(
      "calendar.groupPlansByMonthAndDay", GroupPlansInput.self, [GroupedMonth].self))
  func groupPlans(_ parity: ParityCase<GroupPlansInput, [GroupedMonth]>) {
    let groups = groupPlansByMonthAndDay(
      parity.input.rows, timeZone: parity.input.timeZone, sortDate: \.sortDate)
    let summary = groups.map { month in
      GroupedMonth(
        days: month.days.map { day in
          GroupedDay(date: day.date, dayKey: day.dayKey, planIds: day.rows.map(\.planId))
        },
        heading: month.heading)
    }
    #expect(summary == parity.output)
  }
}

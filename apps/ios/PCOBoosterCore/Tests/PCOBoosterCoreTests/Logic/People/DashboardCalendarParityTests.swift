import Foundation
import Testing

@testable import PCOBoosterCore

/// Replays `people.calendar.*`, `people.placeholder.cachedPersonDetail`, and
/// `people.localeCompare` from scripts/parity/people.parity.ts.
struct DashboardCalendarParityTests {
  struct StatusInput: Decodable, Sendable {
    let kind: PeopleDashboardDayKind
    let status: String?
  }

  struct StatusOutput: Decodable, Sendable, Equatable {
    let isConfirmedStatus: Bool
    let commitmentDot: CommitmentDot
    let commitmentCellTone: MonthGridDayTone
    let commitmentStatusLabel: String
    let engagementLabel: String
  }

  @Test(arguments: Parity.cases("people.calendar.status", StatusInput.self, StatusOutput.self))
  func status(_ c: ParityCase<StatusInput, StatusOutput>) {
    let (kind, status) = (c.input.kind, c.input.status)
    let output = StatusOutput(
      isConfirmedStatus: DashboardCalendar.isConfirmedStatus(status),
      commitmentDot: DashboardCalendar.commitmentDot(kind: kind, status: status),
      commitmentCellTone: DashboardCalendar.cellTone(kind: kind, status: status),
      commitmentStatusLabel: DashboardCalendar.statusLabel(status),
      engagementLabel: DashboardCalendar.engagementLabel(kind: kind, status: status)
    )
    #expect(output == c.output)
  }

  @Test(
    arguments: Parity.cases(
      "people.calendar.pickCalendarMarker", [PeopleDashboardMonthDay].self,
      PeopleDashboardMonthDay?.self))
  func marker(_ c: ParityCase<[PeopleDashboardMonthDay], PeopleDashboardMonthDay?>) {
    #expect(DashboardCalendar.pickMarker(c.input) == c.output)
  }

  struct CellsInput: Decodable, Sendable {
    let startsOnWeekday: Int
    let daysInMonth: Int
  }

  struct CellView: Decodable, Sendable, Equatable {
    let day: Int?
    let key: String
  }

  @Test(
    arguments: Parity.cases(
      "people.calendar.buildCalendarCells", CellsInput.self, [CellView].self))
  func cells(_ c: ParityCase<CellsInput, [CellView]>) {
    let cells = DashboardCalendar.cells(
      startsOnWeekday: c.input.startsOnWeekday, daysInMonth: c.input.daysInMonth)
    #expect(cells.map { CellView(day: $0.day, key: $0.key) } == c.output)
    let month = PeopleDashboardMonth(
      year: 2026, monthIndex: 0, label: "", daysInMonth: Double(c.input.daysInMonth),
      startsOnWeekday: Double(c.input.startsOnWeekday))
    #expect(DashboardCalendar.cells(for: month) == cells)
  }

  struct MonthDayInput: Decodable, Sendable {
    let year: Double
    let monthIndex: Double
    let day: Int
  }

  struct MonthDayLabels: Decodable, Sendable, Equatable {
    let monthDay: String
    let weekdayMonthDay: String
    let weekday: String
  }

  @Test(
    arguments: Parity.cases(
      "people.calendar.formatMonthDay", MonthDayInput.self, MonthDayLabels.self))
  func monthDayLabels(_ c: ParityCase<MonthDayInput, MonthDayLabels>) {
    let month = PeopleDashboardMonth(
      year: c.input.year, monthIndex: c.input.monthIndex, label: "", daysInMonth: 31,
      startsOnWeekday: 0)
    let labels = MonthDayLabels(
      monthDay: DashboardCalendar.formatMonthDay(month, day: c.input.day),
      weekdayMonthDay: DashboardCalendar.formatWeekdayMonthDay(month, day: c.input.day),
      weekday: DashboardCalendar.formatWeekday(month, day: c.input.day)
    )
    #expect(labels == c.output)
  }

  struct HeatInput: Decodable, Sendable {
    let serviceCount: Int
    let rehearsalCount: Int?
  }

  @Test(
    arguments: Parity.cases("people.calendar.heatLevelTone", HeatInput.self, MonthGridDayTone.self))
  func heat(_ c: ParityCase<HeatInput, MonthGridDayTone>) {
    let tone =
      c.input.rehearsalCount.map {
        DashboardCalendar.heatLevel(serviceCount: c.input.serviceCount, rehearsalCount: $0)
      } ?? DashboardCalendar.heatLevel(serviceCount: c.input.serviceCount)
    #expect(tone == c.output)
  }

  struct PlaceholderInput: Decodable, Sendable {
    let dashboards: [PeopleDashboardParityTests.AssembleInput]
    let personId: String
    let month: String?
  }

  @Test(
    arguments: Parity.cases(
      "people.placeholder.cachedPersonDetail", PlaceholderInput.self,
      PeopleDashboardPersonDetail?.self))
  func placeholder(_ c: ParityCase<PlaceholderInput, PeopleDashboardPersonDetail?>) {
    let detail = cachedPersonDetail(
      from: c.input.dashboards.map(\.dashboard), personId: c.input.personId,
      month: c.input.month)
    #expect(detail == c.output)
  }

  /// Every pair of strings, so the comparator the sorts use is pinned to `localeCompare`.
  @Test(arguments: Parity.cases("people.localeCompare", [String].self, [[Int]].self))
  func localeCompare(_ c: ParityCase<[String], [[Int]]>) {
    var mismatches: [String] = []
    for (row, a) in c.input.enumerated() {
      for (column, b) in c.input.enumerated() {
        let expected = c.output[row][column]
        let actual = PeopleText.localeCompare(a, b)
        if actual != expected {
          mismatches.append(
            "\(a.debugDescription) vs \(b.debugDescription): \(actual), not \(expected)")
        }
      }
    }
    #expect(mismatches.isEmpty, "\(mismatches.prefix(20).joined(separator: "\n"))")
  }
}

import Foundation
import Testing

@testable import PCOBoosterCore

/// Edge cases of the People ports the parity fixtures do not reach: JavaScript number
/// strings, Final_Sigma, UTF-16 search, stable sorting, fallbacks where the TypeScript would
/// hang or throw, and scope coding.
struct PeopleTextTests {
  @Test(arguments: [
    (0.0, "0"), (-0.0, "0"), (1, "1"), (-3, "-3"), (2.5, "2.5"), (0.1, "0.1"),
    (1e21, "1e+21"), (1e20, "100000000000000000000"),
    (1.2345678901234568e20, "123456789012345680000"),
    (1e-7, "1e-7"), (1.5e-7, "1.5e-7"), (0.000001, "0.000001"), (0.00123, "0.00123"),
    (5e-324, "5e-324"), (1.7976931348623157e308, "1.7976931348623157e+308"),
    (9.007199254740994e15, "9007199254740994"), (Double.nan, "NaN"),
    (Double.infinity, "Infinity"), (-Double.infinity, "-Infinity"), (12.000001, "12.000001"),
  ])
  func formatsNumbersLikeJavaScript(value: Double, expected: String) {
    #expect(PeopleText.number(value) == expected)
  }

  @Test func lowercasesFinalSigma() {
    #expect(PeopleText.lowercased("ΟΔΥΣΣΕΥΣ") == "οδυσσευς")
    #expect(PeopleText.lowercased("ΣΑΣ ΚΑΙ") == "σας και")
    #expect(PeopleText.lowercased("Σ") == "σ")
    #expect(PeopleText.lowercased("ΑΣ'Β") == "ασ'β")
    #expect(PeopleText.lowercased("ΑΣ\u{0301}") == "ας\u{0301}")
    #expect(PeopleText.lowercased("İSTANBUL") == "i\u{0307}stanbul")
    #expect(PeopleText.lowercased("Band") == "band")
  }

  @Test func searchesByCodeUnit() {
    #expect(PeopleText.includes("jose\u{0301}", "jose"))
    #expect(PeopleText.includes("abc", ""))
    #expect(!PeopleText.includes("", "a"))
    #expect(PeopleText.includes("🙏 grace", "🙏"))
    #expect(!PeopleText.includes("ab", "abc"))
    #expect(PeopleText.includes("aaab", "aab"))
  }

  @Test func sortsStably() {
    let sorted = PeopleText.stableSorted([3, 1, 2, 1, 3, 2]) { _, _ in 0 }
    #expect(sorted == [3, 1, 2, 1, 3, 2])
    let byParity = PeopleText.stableSorted(Array(0..<10)) { a, b in a % 2 - b % 2 }
    #expect(byParity == [0, 2, 4, 6, 8, 1, 3, 5, 7, 9])
  }

  @Test func ordersNamesLikeLocaleCompare() {
    #expect(PeopleText.localeCompare("a", "B") == -1)
    #expect(PeopleText.localeCompare("a", "A") == -1)
    #expect(PeopleText.localeCompare("é", "e\u{0301}") == 0)
    #expect(PeopleText.localeCompare("Lee Chan", "Lee\u{00A0}Chan") == -1)
    #expect(PeopleText.localeCompare("ab\u{00AD}", "ab") == 0)
    #expect(PeopleText.localeCompare("fi", "\u{FB01}") == -1)
    #expect(PeopleText.isCollationIgnorable("\u{200D}"))
    #expect(!PeopleText.isCollationIgnorable("a"))
    #expect(PeopleText.isCollationIgnorable("\u{E0001}"))
  }

  @Test func chunksWithAtLeastOnePerBatch() {
    // The TypeScript loops forever on a batch size below 1.
    #expect(chunkPersonIds(["a", "b"], batchSize: 0) == [["a"], ["b"]])
    #expect(chunkPersonIds(["a", "b"], batchSize: -4) == [["a"], ["b"]])
    #expect(chunkPersonIds([], batchSize: 16).isEmpty)
  }

  @Test func readsMonthFieldsAsNumbers() {
    let fractional = PeopleDashboardMonth(
      year: 2026, monthIndex: 4, label: "May 2026", daysInMonth: 2.9, startsOnWeekday: 1.5)
    #expect(
      DashboardCalendar.cells(for: fractional).map(\.key) == ["blank-start-0", "day-1", "day-2"])
    let broken = PeopleDashboardMonth(
      year: .nan, monthIndex: 0, label: "", daysInMonth: .infinity, startsOnWeekday: -1)
    #expect(DashboardCalendar.formatMonthDay(broken, day: 1) == "")
    #expect(DashboardCalendar.cells(startsOnWeekday: -2, daysInMonth: 0).isEmpty)
  }

  @Test func codesScopesAsTheirRawValue() throws {
    let scopes: [PeopleDashboardScope] = [.mine, .all, .team("42")]
    let data = try JSONEncoder().encode(scopes)
    #expect(String(decoding: data, as: UTF8.self) == #"["mine","all","team:42"]"#)
    #expect(try JSONDecoder().decode([PeopleDashboardScope].self, from: data) == scopes)
    #expect(throws: DecodingError.self) {
      try JSONDecoder().decode(PeopleDashboardScope.self, from: Data(#""team:""#.utf8))
    }
    #expect(PeopleDashboardScope(rawValue: "team:\u{0301}x") == .team("\u{0301}x"))
    #expect(PeopleDashboardMode(parsing: nil) == .health)
  }

  /// A day kind a newer API sends reads as a service, as the web treats anything but
  /// "rehearsal" (the parity fixtures only hold contract-valid kinds).
  @Test func treatsUnknownDayKindsAsServices() {
    let workshop = PeopleDashboardDayKind(rawValue: "workshop")
    #expect(DashboardCalendar.commitmentDot(kind: workshop, status: "C") == .confirmed)
    #expect(DashboardCalendar.cellTone(kind: workshop, status: "U") == .scheduled)
    #expect(DashboardCalendar.engagementLabel(kind: workshop, status: nil) == "Pending service")
    let entries = [
      PeopleDashboardMonthDay(day: 4, kind: workshop, status: "C"),
      PeopleDashboardMonthDay(day: 4, kind: .rehearsal),
    ]
    // Not a service for the marker or the day counts, which look for `.service` itself.
    #expect(DashboardCalendar.pickMarker(entries) == entries[0])
    #expect(buildMonthDays(monthDays: [entries])[3].serviceCount == 0)
  }

  @Test func keepsSignalKindsAlignedWithTheWeb() {
    #expect(
      PersonSignalKind.allCases.map(\.rawValue)
        == ["waiting", "declining", "drifting", "overloaded", "due"])
    #expect(OverloadBasis.teamPace.rawValue == "team-pace")
    #expect(
      PersonSignal.checkIn(.drifting(lastServedOn: "2026-01-01", typicalGapDays: nil)).kind
        == .drifting)
  }
}

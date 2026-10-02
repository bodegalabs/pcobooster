import Foundation
import Testing

@testable import PCOBoosterMock

struct MockFixturesTests {
  /// `appContract` has 49 procedures; `scripts/ios/fixtures.test.ts` checks the names.
  @Test func bundlesOneFixturePerProcedure() {
    let paths = MockFixtures.procedurePaths
    #expect(paths.count == 49)
    #expect(paths.contains("health"))
    #expect(paths.contains("people/positionCandidates"))
    #expect(Set(paths).count == paths.count)
  }

  @Test(arguments: MockFixtures.procedurePaths)
  func fixtureLoadsAndRoundTrips(_ path: String) throws {
    let file = try #require(try MockFixtures.load(path))
    let reparsed = try MockJSON.parse(file.defaultOutput.encoded())
    #expect(reparsed == file.defaultOutput)
    for entry in file.cases {
      #expect(entry.match.object?.isEmpty == false)
      #expect(try MockJSON.parse(entry.output.encoded()) == entry.output)
    }
  }

  @Test func fixturesHoldNoLongDashes() throws {
    for path in MockFixtures.procedurePaths {
      let url = try #require(MockFixtures.url(for: path))
      let text = try String(contentsOf: url, encoding: .utf8)
      #expect(!text.contains("\u{2013}") && !text.contains("\u{2014}"), "\(path)")
    }
  }

  @Test func chordChartPDFIsAValidDocument() throws {
    let file = try #require(try MockFixtures.load("chordCharts/pdf"))
    let encoded = try #require(file.defaultOutput["data"]?.string)
    let pdf = try #require(Data(base64Encoded: encoded))
    let text = String(decoding: pdf, as: UTF8.self)
    #expect(text.hasPrefix("%PDF-1.4"))
    #expect(text.hasSuffix("%%EOF\n"))
    #expect(text.contains("Morning Light"))
    #expect(text.contains("/Type /Page "))
  }

  @Test func matchesAreSubsetsCountingDatesByInstant() {
    let input = MockJSON.object([
      "planId": .string("881261004"),
      "date": .string("2026-10-04T16:00:00Z"),
      "continuation": .object(["serviceTypeIds": .array([.string("1103")])]),
    ])
    #expect(MockJSON.object(["planId": .string("881261004")]).matches(input))
    #expect(MockJSON.object(["date": .string("2026-10-04T16:00:00.000Z")]).matches(input))
    #expect(
      MockJSON.object(["continuation": .object(["serviceTypeIds": .array([.string("1103")])])])
        .matches(input))
    #expect(!MockJSON.object(["planId": .string("881261011")]).matches(input))
    #expect(!MockJSON.object(["positionId": .string("3301")]).matches(input))
    #expect(
      !MockJSON.object(["continuation": .object(["serviceTypeIds": .array([])])]).matches(input))
  }
}

import Foundation
import Synchronization

/// The bundled fictional API fixtures (`Fixtures/<namespace>.<procedure>.json`), written by
/// `scripts/ios/fixtures.test.ts` from the typed data in `scripts/ios/fixtures/`. Every date in
/// them is written around ``anchorSunday``; ``MockTransport`` moves them to the coming Sunday.
public enum MockFixtures {
  /// The showcase Sunday the fixtures are written around, in ``timeZone``.
  public static let anchorSunday = "2026-10-04"

  /// When the fixtures were "read": Thursday, October 1, 2026, 10:00 AM in ``timeZone``. A
  /// ``MockTransport`` whose clock reads this instant serves every fixture date unchanged.
  public static let anchorNow = Date(timeIntervalSince1970: 1_790_874_000)

  /// The fictional organization's calendar zone, which `catalog.organization` returns.
  public static let timeZone = TimeZone(identifier: "America/Los_Angeles")!

  /// Ids worth deep linking to in previews, UI tests, and screenshots.
  public enum Showcase {
    /// "Sunday Gathering".
    public static let serviceTypeId = "1101"
    /// "Deep Roots" on the anchor Sunday: confirmed, pending, declined, and unsent people,
    /// open slots, a plan member, a needed position, songs with keys, a media item, and times.
    public static let planId = "881261004"
    /// Frankie Turner: acoustic guitar and alto, carrying a heavy load, with blockouts.
    public static let personId = "4100104"
    /// "Morning Light", with a chord chart, two keys, and an archived arrangement.
    public static let songId = "5501"
    public static let arrangementId = "55011"
    /// The Youth Night in the showcase week ("Youth Night" service type `1102`).
    public static let youthPlanId = "882261007"
    /// "Baptism Night", two weeks out ("Special Events" service type `1103`).
    public static let eventPlanId = "883261018"
    /// Jordan Hale, the signed-in worship pastor.
    public static let viewerPersonId = "4100114"
  }

  public static func url(for procedurePath: String) -> URL? {
    let name = procedurePath.replacingOccurrences(of: "/", with: ".")
    return Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")
  }

  /// Every bundled fixture's procedure path, for example `people/positionCandidates`.
  public static var procedurePaths: [String] {
    let urls =
      Bundle.module.urls(forResourcesWithExtension: "json", subdirectory: "Fixtures") ?? []
    return urls.map { $0.deletingPathExtension().lastPathComponent }
      .map { $0.replacingOccurrences(of: ".", with: "/") }
      .sorted()
  }

  /// The parsed fixture, read from the bundle once per process: previews create transports
  /// often, and the largest files take a few milliseconds to parse.
  static func load(_ procedurePath: String) throws -> MockFixtureFile? {
    if let cached = parsedFixtures.withLock({ $0[procedurePath] }) {
      return cached
    }
    guard let url = url(for: procedurePath) else { return nil }
    let file = try MockFixtureFile(json: MockJSON.parse(Data(contentsOf: url)))
    parsedFixtures.withLock { $0[procedurePath] = file }
    return file
  }
}

private let parsedFixtures = Mutex<[String: MockFixtureFile]>([:])

/// One procedure's fixture: `{"default": <output>, "cases": [{"match", "output"}]}`.
struct MockFixtureFile: Sendable, Equatable {
  struct Case: Sendable, Equatable {
    let match: MockJSON
    let output: MockJSON
  }

  let defaultOutput: MockJSON
  let cases: [Case]

  init(defaultOutput: MockJSON, cases: [Case]) {
    self.defaultOutput = defaultOutput
    self.cases = cases
  }

  init(json: MockJSON) throws {
    guard let defaultOutput = json["default"] else {
      throw MockFixtureError.missingDefault
    }
    self.defaultOutput = defaultOutput
    cases = try (json["cases"]?.array ?? []).map { entry in
      guard let match = entry["match"], let output = entry["output"] else {
        throw MockFixtureError.malformedCase
      }
      return Case(match: match, output: output)
    }
  }

  /// The first case whose `match` is a subset of `input`, else the default.
  func output(for input: MockJSON) -> MockJSON {
    cases.first { $0.match.matches(input) }?.output ?? defaultOutput
  }

  /// The same fixture with every date moved by `calendar`.
  func shifted(by calendar: MockCalendar) -> MockFixtureFile {
    MockFixtureFile(
      defaultOutput: calendar.shift(defaultOutput),
      cases: cases.map { Case(match: calendar.shift($0.match), output: calendar.shift($0.output)) })
  }
}

enum MockFixtureError: Error, Equatable {
  case missingDefault
  case malformedCase
}

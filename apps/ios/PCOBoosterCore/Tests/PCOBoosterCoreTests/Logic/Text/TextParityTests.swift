import Foundation
import PCOBoosterCore
import Testing

/// Replays the `text.*` fixtures that scripts/parity/text.parity.ts writes.
struct TextParityTests {
  struct MiddleTruncateInput: Decodable, Sendable {
    let maxWidth: Double
    let measure: String
    let text: String
  }

  struct AgoInput: Decodable, Sendable {
    let at: Date
    let reference: Date
  }

  struct SongSearchInput: Decodable, Sendable {
    let now: Date
    let query: String
    let song: SearchableSong
  }

  struct PositionIconInput: Decodable, Sendable {
    let positionName: String
    let teamName: String
  }

  @Test(arguments: Parity.cases("text.formatDuration", Double.self, String?.self))
  func duration(_ parity: ParityCase<Double, String?>) {
    #expect(formatDuration(seconds: parity.input) == parity.output)
  }

  @Test(arguments: Parity.cases("text.middleTruncate", MiddleTruncateInput.self, String.self))
  func middleTruncation(_ parity: ParityCase<MiddleTruncateInput, String>) throws {
    let input = parity.input
    let measure = try #require(Measure(rawValue: input.measure))
    #expect(
      middleTruncate(input.text, maxWidth: input.maxWidth, measure: measure.width) == parity.output)
  }

  @Test(arguments: Parity.cases("text.initials", String.self, String.self))
  func avatarInitials(_ parity: ParityCase<String, String>) {
    #expect(initials(parity.input) == parity.output)
  }

  @Test(arguments: Parity.cases("text.describeSignInError", String?.self, String?.self))
  func signInError(_ parity: ParityCase<String?, String?>) {
    #expect(describeSignInError(parity.input) == parity.output)
  }

  @Test(arguments: Parity.cases("text.formatCompactAgo", AgoInput.self, String.self))
  func compactAgo(_ parity: ParityCase<AgoInput, String>) {
    #expect(formatCompactAgo(parity.input.at, reference: parity.input.reference) == parity.output)
  }

  @Test(arguments: Parity.cases("text.formatPlayedAgo", AgoInput.self, String.self))
  func playedAgo(_ parity: ParityCase<AgoInput, String>) {
    #expect(formatPlayedAgo(parity.input.at, now: parity.input.reference) == parity.output)
  }

  @Test(arguments: Parity.cases("text.describeCadence", Double.self, String.self))
  func cadence(_ parity: ParityCase<Double, String>) {
    #expect(TeamHealthText.describeCadence(typicalGapDays: parity.input) == parity.output)
  }

  @Test(arguments: Parity.cases("text.describeDaysAgo", Int.self, String.self))
  func daysAgo(_ parity: ParityCase<Int, String>) {
    #expect(TeamHealthText.describeDaysAgo(parity.input) == parity.output)
  }

  @Test(arguments: Parity.cases("text.formatDayKey", String.self, String.self))
  func dayKeyLabel(_ parity: ParityCase<String, String>) {
    #expect(TeamHealthText.formatDayKey(parity.input) == parity.output)
  }

  @Test(arguments: Parity.cases("text.formatWeekdayDayKey", String.self, String.self))
  func weekdayDayKeyLabel(_ parity: ParityCase<String, String>) {
    #expect(TeamHealthText.formatWeekdayDayKey(parity.input) == parity.output)
  }

  @Test(arguments: Parity.cases("text.scoreSongSearch", SongSearchInput.self, Int.self))
  func songSearch(_ parity: ParityCase<SongSearchInput, Int>) {
    let input = parity.input
    #expect(scoreSongSearch(input.song, query: input.query, now: input.now) == parity.output)
  }

  @Test(arguments: Parity.cases("text.positionIcon", PositionIconInput.self, PositionIconId.self))
  func positionIcon(_ parity: ParityCase<PositionIconInput, PositionIconId>) {
    let input = parity.input
    #expect(
      resolvePositionIconId(positionName: input.positionName, teamName: input.teamName)
        == parity.output)
  }
}

extension TextParityTests {
  /// The text widths text.parity.ts measures with, per UTF-16 code unit.
  enum Measure: String {
    case monospace
    case proportional

    func width(_ text: String) -> Double {
      switch self {
      case .monospace:
        Double(text.utf16.count * 10)
      case .proportional:
        Double(text.utf16.reduce(0) { $0 + Self.proportionalWidth($1) })
      }
    }

    private static func proportionalWidth(_ unit: UTF16.CodeUnit) -> Int {
      switch unit {
      case 0x2026: 12
      case 0x20, 0x69, 0x6C, 0x2E, 0x2C, 0x27, 0x7C, 0x21: 3  // space i l . , ' | !
      case 0x6D, 0x77, 0x4D, 0x57: 13  // m w M W
      case 0x41...0x5A: 10  // A to Z
      case 0x30...0x39: 8  // 0 to 9
      case 0x61...0x7A: 7  // a to z
      default: 11
      }
    }
  }
}

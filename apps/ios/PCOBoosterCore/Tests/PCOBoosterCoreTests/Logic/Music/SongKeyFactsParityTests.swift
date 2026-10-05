import Foundation
import PCOBoosterCore
import Testing

/// Replays `music.songLibrary.*` from scripts/parity/music.parity.ts.
struct SongKeyFactsParityTests {
  struct KeyPair: Decodable, Sendable {
    let from: String
    let to: String
  }

  @Test(
    arguments: Parity.cases("music.songLibrary.describeKeyChange", KeyPair.self, String?.self))
  func describeKeyChange(_ c: ParityCase<KeyPair, String?>) {
    #expect(PCOBoosterCore.describeKeyChange(from: c.input.from, to: c.input.to) == c.output)
  }

  struct TempoInput: Decodable, Sendable {
    struct Arrangement: Decodable, Sendable {
      let bpm: Double?
      let meter: String?
    }

    /// `nil` stands for an arrangement the web passes as `undefined`.
    let arrangement: Arrangement?
  }

  @Test(arguments: Parity.cases("music.songLibrary.tempoLabel", TempoInput.self, String.self))
  func tempoLabel(_ c: ParityCase<TempoInput, String>) {
    let arrangement = c.input.arrangement
    #expect(PCOBoosterCore.tempoLabel(bpm: arrangement?.bpm, meter: arrangement?.meter) == c.output)
  }
}

import Foundation
import PCOBoosterCore
import Testing

/// Replays `music.keyTheory.*` from scripts/parity/music.parity.ts.
struct KeyTheoryParityTests {
  struct ParseInput: Decodable, Sendable {
    let value: String?
    let minorOverride: Bool?
  }

  @Test(arguments: Parity.cases("music.keyTheory.parse", ParseInput.self, SpelledKey?.self))
  func parse(_ c: ParityCase<ParseInput, SpelledKey?>) {
    #expect(KeyTheory.parse(c.input.value, minorOverride: c.input.minorOverride) == c.output)
  }

  struct ChordView: Decodable, Sendable, Equatable {
    let root: SpelledNote
    let quality: String
    let numeral: String
    let name: String
  }

  struct KeyOutput: Decodable, Sendable, Equatable {
    let name: String
    let noteName: String
    let pitch: Int
    let parallel: SpelledKey
    let scale: [SpelledNote]
    let diatonicTriads: [ChordView]
    let predominant: ChordView
    let dominantSeventh: ChordView
  }

  @Test(arguments: Parity.cases("music.keyTheory.key", SpelledKey.self, KeyOutput.self))
  func key(_ c: ParityCase<SpelledKey, KeyOutput>) {
    let key = c.input
    let output = KeyOutput(
      name: KeyTheory.name(key),
      noteName: KeyTheory.noteName(key),
      pitch: KeyTheory.pitch(key),
      parallel: KeyTheory.parallel(key),
      scale: KeyTheory.scale(key),
      diatonicTriads: KeyTheory.diatonicTriads(key).map(ChordView.init),
      predominant: ChordView(KeyTheory.predominant(of: key)),
      dominantSeventh: ChordView(KeyTheory.dominantSeventh(of: key)))
    #expect(output == c.output)
  }

  struct KeyPair: Decodable, Sendable {
    let from: String
    let to: String
  }

  struct PairOutput: Decodable, Sendable, Equatable {
    let semitonesUp: Int
    let circleOfFifthsDistance: Int
    let homeChordIsIn: Bool
    let dominantIsIn: Bool
    let commonTones: String
    let pivotChords: String
    let commonToneChords: String
  }

  @Test(arguments: Parity.cases("music.keyTheory.pairs", KeyPair.self, PairOutput.self))
  func pairs(_ c: ParityCase<KeyPair, PairOutput>) throws {
    let from = try spelledKey(c.input.from)
    let to = try spelledKey(c.input.to)
    let output = PairOutput(
      semitonesUp: KeyTheory.semitonesUp(from: from, to: to),
      circleOfFifthsDistance: KeyTheory.circleOfFifthsDistance(from, to),
      homeChordIsIn: KeyTheory.homeChordIsIn(from: from, to: to),
      dominantIsIn: KeyTheory.dominantIsIn(from: from, to: to),
      commonTones: KeyTheory.commonTones(from: from, to: to).map(KeyTheory.noteName)
        .joined(separator: " "),
      pivotChords: KeyTheory.pivotChords(from: from, to: to).map(pivotText)
        .joined(separator: ", "),
      commonToneChords: KeyTheory.commonToneChords(from: from, to: to).map(commonToneText)
        .joined(separator: "; "))
    #expect(output == c.output)
  }

  @Test func readsSharpsFlatsAndMinorKeys() throws {
    #expect(KeyTheory.name(try spelledKey("Eb")) == "Eb")
    #expect(KeyTheory.name(try spelledKey("F#m")) == "F#m")
    #expect(KeyTheory.name(try spelledKey("Bbmin")) == "Bbm")
    #expect(KeyTheory.parse("(Female Lead) John") == nil)
    #expect(KeyTheory.parse("A", minorOverride: true)?.minor == true)
    #expect(KeyTheory.name(try spelledKey("A#")) == "Bb")
  }
}

func spelledKey(_ spelling: String) throws -> SpelledKey {
  try #require(KeyTheory.parse(spelling), "\(spelling) is not a key")
}

extension KeyTheoryParityTests.ChordView {
  init(_ chord: Chord) {
    self.init(
      root: chord.root, quality: chord.quality.rawValue, numeral: chord.numeral,
      name: KeyTheory.chordName(chord))
  }
}

/// `Em ii` or `Fm ii borrowed`, as the parity suite writes pivot chords.
private func pivotText(_ pivot: PivotChord) -> String {
  "\(KeyTheory.chordName(pivot.chord)) \(pivot.chord.numeral)\(pivot.borrowed ? " borrowed" : "")"
}

/// `A/A t:F:I>f:D:I`, as the parity suite writes common tone chords.
private func commonToneText(_ shared: CommonToneChord) -> String {
  let held = "\(KeyTheory.noteName(shared.tone))/\(KeyTheory.noteName(shared.fromTone))"
  let from =
    "\(shared.fromRole.rawValue.prefix(1)):\(KeyTheory.chordName(shared.from)):\(shared.from.numeral)"
  let to =
    "\(shared.toRole.rawValue.prefix(1)):\(KeyTheory.chordName(shared.to)):\(shared.to.numeral)"
  return "\(held) \(from)>\(to)"
}

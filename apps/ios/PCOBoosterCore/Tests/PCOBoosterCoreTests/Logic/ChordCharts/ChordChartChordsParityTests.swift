import Foundation
import PCOBoosterCore
import Testing

/// Replays `chordcharts.chords.*` from scripts/parity/chord-charts.parity.ts.
struct ChordChartChordsParityTests {
  struct Constants: Decodable, Sendable {
    let chartKeys: [String]
    let columnBreak: String
    let pageBreak: String
  }

  @Test(arguments: Parity.cases("chordcharts.chords.constants", Int?.self, Constants.self))
  func constants(_ c: ParityCase<Int?, Constants>) {
    #expect(ChordChords.chartKeys == c.output.chartKeys)
    #expect(ChordChart.columnBreak == c.output.columnBreak)
    #expect(ChordChart.pageBreak == c.output.pageBreak)
  }

  struct KeyNameInput: Decodable, Sendable {
    let pitch: Int
    let minor: Bool
  }

  @Test(arguments: Parity.cases("chordcharts.chords.keyName", KeyNameInput.self, String.self))
  func keyName(_ c: ParityCase<KeyNameInput, String>) {
    #expect(ChordChords.keyName(pitch: c.input.pitch, minor: c.input.minor) == c.output)
  }

  @Test(arguments: Parity.cases("chordcharts.chords.parseKey", String?.self, ChartKey?.self))
  func parseKey(_ c: ParityCase<String?, ChartKey?>) {
    #expect(ChordChords.parseKey(c.input) == c.output)
  }

  struct TransposeKeyInput: Decodable, Sendable {
    let key: String
    let semitones: Int
  }

  @Test(
    arguments: Parity.cases(
      "chordcharts.chords.transposeKey", TransposeKeyInput.self, ChartKey.self))
  func transposeKey(_ c: ParityCase<TransposeKeyInput, ChartKey>) throws {
    #expect(ChordChords.transposeKey(try chartKey(c.input.key), by: c.input.semitones) == c.output)
  }

  struct KeyPair: Decodable, Sendable {
    let from: String
    let to: String
  }

  @Test(arguments: Parity.cases("chordcharts.chords.semitonesBetween", KeyPair.self, Int.self))
  func semitonesBetween(_ c: ParityCase<KeyPair, Int>) throws {
    let between = ChordChords.semitonesBetween(try chartKey(c.input.from), try chartKey(c.input.to))
    #expect(between == c.output)
  }

  struct ParseChordOutput: Decodable, Sendable, Equatable {
    let chord: ParsedChord?
    let isChord: Bool
  }

  @Test(
    arguments: Parity.cases("chordcharts.chords.parseChord", String.self, ParseChordOutput.self))
  func parseChord(_ c: ParityCase<String, ParseChordOutput>) {
    let output = ParseChordOutput(
      chord: ChordChords.parseChord(c.input), isChord: ChordChords.isChord(c.input))
    #expect(output == c.output)
  }

  struct TransposeTextInput: Decodable, Sendable {
    let text: String
    let semitones: Int
    let target: String?
  }

  @Test(
    arguments: Parity.cases(
      "chordcharts.chords.transposeChordText", TransposeTextInput.self, String.self))
  func transposeChordText(_ c: ParityCase<TransposeTextInput, String>) throws {
    let target = try c.input.target.map(chartKey)
    let transposed = ChordChords.transposeChordText(
      c.input.text, semitones: c.input.semitones, target: target)
    #expect(transposed == c.output)
  }

  @Test func namesEnharmonicKeysThePlanningCenterWay() {
    #expect(ChordChords.parseKey("C#")?.name == "Db")
    #expect(ChordChords.parseKey("D#m")?.name == "Ebm")
    #expect(ChordChords.parseKey("A\u{266D}") == ChartKey(pitch: 8, minor: false))
    #expect(ChordChords.chartKeys.count == 24)
  }
}

func chartKey(_ name: String) throws -> ChartKey {
  try #require(ChordChords.parseKey(name), "\(name) is not a chart key")
}

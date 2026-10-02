import Foundation
import PCOBoosterCore
import Testing

/// Replays `chordcharts.chart.*`, `chordcharts.import.*`, and
/// `chordcharts.lyricsSearchQuery` from scripts/parity/chord-charts.parity.ts.
struct ChordChartParityTests {
  @Test(arguments: Parity.cases("chordcharts.chart.isSectionHeading", String.self, Bool.self))
  func isSectionHeading(_ c: ParityCase<String, Bool>) {
    #expect(ChordChart.isSectionHeading(c.input) == c.output)
  }

  @Test(arguments: Parity.cases("chordcharts.chart.isChordLine", String.self, Bool.self))
  func isChordLine(_ c: ParityCase<String, Bool>) {
    #expect(ChordChart.isChordLine(c.input) == c.output)
  }

  struct TransposeChartInput: Decodable, Sendable {
    let text: String
    let from: String
    let to: String
  }

  @Test(
    arguments: Parity.cases(
      "chordcharts.chart.transposeChordChartText", TransposeChartInput.self, String.self))
  func transpose(_ c: ParityCase<TransposeChartInput, String>) throws {
    let transposed = ChordChart.transpose(
      c.input.text, from: try chartKey(c.input.from), to: try chartKey(c.input.to))
    #expect(transposed == c.output)
  }

  struct MergeInput: Decodable, Sendable {
    let chordLine: String
    let lyricLine: String
  }

  @Test(
    arguments: Parity.cases(
      "chordcharts.import.mergeChordsIntoLyrics", MergeInput.self, String.self)
      + Parity.cases("chordcharts.fuzz.merges", MergeInput.self, String.self))
  func mergeChordsIntoLyrics(_ c: ParityCase<MergeInput, String>) {
    let merged = ChordChart.mergeChordsIntoLyrics(
      chordLine: c.input.chordLine, lyricLine: c.input.lyricLine)
    #expect(merged == c.output)
  }

  struct ImportOutput: Decodable, Sendable, Equatable {
    let detected: ChordChartImportFormat
    let imported: ChordChartImport
  }

  @Test(
    arguments: Parity.cases("chordcharts.import.importChordChart", String.self, ImportOutput.self))
  func importText(_ c: ParityCase<String, ImportOutput>) {
    let output = ImportOutput(
      detected: ChordChart.detectFormat(c.input), imported: ChordChart.importText(c.input))
    #expect(output == c.output)
  }

  @Test(arguments: Parity.cases("chordcharts.import.lyricsToChordChart", String.self, String.self))
  func lyricsToChart(_ c: ParityCase<String, String>) {
    #expect(ChordChart.lyricsToChart(c.input) == c.output)
  }

  struct QueryInput: Decodable, Sendable {
    let title: String
    let author: String
  }

  @Test(arguments: Parity.cases("chordcharts.lyricsSearchQuery", QueryInput.self, String.self))
  func lyricsSearchQuery(_ c: ParityCase<QueryInput, String>) {
    #expect(
      PCOBoosterCore.lyricsSearchQuery(title: c.input.title, author: c.input.author) == c.output)
  }

  struct FuzzLineOutput: Decodable, Sendable, Equatable {
    let sectionHeading: Bool
    let chordLine: Bool
    let chord: ParsedChord?
    let transposed: String
    let query: String
  }

  @Test(arguments: Parity.cases("chordcharts.fuzz.lines", String.self, FuzzLineOutput.self))
  func fuzzLines(_ c: ParityCase<String, FuzzLineOutput>) throws {
    let line = c.input
    let output = FuzzLineOutput(
      sectionHeading: ChordChart.isSectionHeading(line),
      chordLine: ChordChart.isChordLine(line),
      chord: ChordChords.parseChord(line),
      transposed: ChordChords.transposeChordText(line, semitones: 3, target: try chartKey("E")),
      query: PCOBoosterCore.lyricsSearchQuery(title: line, author: line))
    #expect(output == c.output)
  }

  struct FuzzChartOutput: Decodable, Sendable, Equatable {
    let imported: ChordChartImport
    let lyricsChart: String
    let transposed: String
    let tokens: [HighlightTokenView]
  }

  @Test(arguments: Parity.cases("chordcharts.fuzz.charts", String.self, FuzzChartOutput.self))
  func fuzzCharts(_ c: ParityCase<String, FuzzChartOutput>) throws {
    let text = c.input
    let output = FuzzChartOutput(
      imported: ChordChart.importText(text),
      lyricsChart: ChordChart.lyricsToChart(text),
      transposed: ChordChart.transpose(text, from: try chartKey("E"), to: try chartKey("Ab")),
      tokens: ChordChart.highlight(text).map(HighlightTokenView.init))
    #expect(output == c.output)
  }

  @Test func keepsTrailingSpacesAndWindowsLineEndingsOnChordLines() throws {
    let transposed = ChordChart.transpose(
      "E    B  \r\n[E]Beyond\r\n", from: try chartKey("E"), to: try chartKey("G"))
    #expect(transposed == "G    D  \r\n[G]Beyond\r\n")
  }
}

/// A highlight token as the parity suite writes it.
struct HighlightTokenView: Decodable, Sendable, Equatable {
  let kind: ChordChartHighlightToken.Kind
  let start: Int
  let end: Int

  init(_ token: ChordChartHighlightToken) {
    kind = token.kind
    start = token.start
    end = token.end
  }
}

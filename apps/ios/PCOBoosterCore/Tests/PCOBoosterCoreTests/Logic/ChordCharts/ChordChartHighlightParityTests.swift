import Foundation
import PCOBoosterCore
import Testing

/// Replays `chordcharts.highlight` from scripts/parity/chord-charts.parity.ts.
struct ChordChartHighlightParityTests {
  @Test(arguments: Parity.cases("chordcharts.highlight", String.self, [HighlightTokenView].self))
  func highlight(_ c: ParityCase<String, [HighlightTokenView]>) {
    #expect(ChordChart.highlight(c.input).map(HighlightTokenView.init) == c.output)
  }

  @Test(arguments: Parity.cases("chordcharts.highlight", String.self, [HighlightTokenView].self))
  func tokensCoverEveryCharacterButNewlines(_ c: ParityCase<String, [HighlightTokenView]>) throws {
    let text = c.input
    var covered: [Unicode.Scalar] = []
    for token in ChordChart.highlight(text) {
      // Token edges can fall inside a grapheme ("]" then a combining mark), so
      // read by code point; `String` subscripts round to whole characters.
      let range = try #require(token.range(in: text))
      covered += text.unicodeScalars[range]
    }
    #expect(covered == text.unicodeScalars.filter { $0 != "\n" })
  }

  @Test func colorsEachKindOfLine() {
    let text = "VERSE 1\n[G]Amazing grace\nG    C\n{ Softly }\nCOLUMN_BREAK"
    let kinds = ChordChart.highlight(text).map(\.kind)
    #expect(kinds == [.sectionHeading, .inlineChord, .lyric, .chordLine, .note, .code])
  }
}

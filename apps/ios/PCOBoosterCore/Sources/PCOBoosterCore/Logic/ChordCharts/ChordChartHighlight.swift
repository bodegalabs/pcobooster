// Port of apps/web/src/components/songs/chord-chart-highlight.tsx as data,
// pinned by the `chordcharts.highlight` and `chordcharts.fuzz.charts` parity
// suites (scripts/parity/chord-charts.parity.ts). The editor turns the tokens
// into an `AttributedString`; this file stays free of UI frameworks.

/// One colored piece of a chord chart in the editor.
public struct ChordChartHighlightToken: Hashable, Sendable {
  public enum Kind: String, Sendable, Codable, CaseIterable {
    /// A Services code line: `{{ chart note }}`, `COLUMN_BREAK`, `PAGE_BREAK`,
    /// `TRANSPOSE KEY +2`, or `REDEFINE KEY -1` (the web's `text-chart-4`).
    case code
    /// A `{ note }` line (muted).
    case note
    /// A section heading such as `VERSE 1` (the web's scheduled status color).
    case sectionHeading = "section-heading"
    /// A line of chords written above the lyrics (info blue).
    case chordLine = "chord-line"
    /// An inline `[G]` chord, brackets included (info blue).
    case inlineChord = "inline-chord"
    /// Lyrics and anything else, in the default text color.
    case lyric
  }

  public let kind: Kind
  /// UTF-16 offset of the token's first code unit, as `NSRange` and JavaScript count.
  public let start: Int
  /// UTF-16 offset just past the token.
  public let end: Int

  public init(kind: Kind, start: Int, end: Int) {
    self.kind = kind
    self.start = start
    self.end = end
  }

  /// The token's UTF-16 range.
  public var range: Range<Int> { start..<end }

  /// The token's range in `text`, the chart it was made from.
  public func range(in text: String) -> Range<String.Index>? {
    let utf16 = text.utf16
    guard start >= 0, start <= end,
      let lower = utf16.index(utf16.startIndex, offsetBy: start, limitedBy: utf16.endIndex),
      let upper = utf16.index(lower, offsetBy: end - start, limitedBy: utf16.endIndex)
    else {
      return nil
    }
    return lower..<upper
  }
}

extension ChordChart {
  /// Colors a chart for the editor without changing a single character. Every
  /// character except the newlines between lines belongs to exactly one
  /// token, in order; empty pieces are left out.
  public static func highlight(_ text: String) -> [ChordChartHighlightToken] {
    var tokens: [ChordChartHighlightToken] = []
    var offset = 0
    for line in MusicText.split(text, separator: "\n") {
      let scalars = MusicText.scalars(line)
      let length = line.utf16.count
      if let kind = lineKind(line, scalars) {
        if length > 0 {
          tokens.append(ChordChartHighlightToken(kind: kind, start: offset, end: offset + length))
        }
      } else {
        tokens += inlineChordTokens(scalars, offset: offset)
      }
      offset += length + 1
    }
    return tokens
  }

  /// The kind that colors a whole line, or `nil` for lyrics with inline chords.
  private static func lineKind(_ line: String, _ scalars: [Unicode.Scalar])
    -> ChordChartHighlightToken.Kind?
  {
    if isCodeLine(scalars) {
      return .code
    }
    if isNoteLine(scalars) {
      return .note
    }
    if isSectionHeading(line) {
      return .sectionHeading
    }
    if isChordLine(line) {
      return .chordLine
    }
    return nil
  }

  /// `/\[[^\]\n]*\]/gu` splits the line into lyrics and inline chords.
  private static func inlineChordTokens(_ scalars: [Unicode.Scalar], offset: Int)
    -> [ChordChartHighlightToken]
  {
    var tokens: [ChordChartHighlightToken] = []
    var cursor = offset
    var position = offset
    func add(_ kind: ChordChartHighlightToken.Kind, from start: Int, to end: Int) {
      if end > start {
        tokens.append(ChordChartHighlightToken(kind: kind, start: start, end: end))
      }
    }
    var index = 0
    while index < scalars.count {
      if scalars[index] == "[",
        let close = scalars[(index + 1)...].firstIndex(where: { $0 == "]" || $0 == "\n" }),
        scalars[close] == "]"
      {
        let chordLength = MusicText.utf16Count(scalars[index...close])
        add(.lyric, from: cursor, to: position)
        add(.inlineChord, from: position, to: position + chordLength)
        position += chordLength
        cursor = position
        index = close + 1
      } else {
        position += scalars[index].utf16.count
        index += 1
      }
    }
    add(.lyric, from: cursor, to: position)
    return tokens
  }

  /// `CODE_LINE_PATTERN`, case-insensitively:
  /// `^\s*(?:\{\{.*\}\}|COLUMN_BREAK|PAGE_BREAK|(?:TRANSPOSE|REDEFINE)\s+KEY\s+[+-]?\s*\d+)\s*$`.
  private static func isCodeLine(_ scalars: [Unicode.Scalar]) -> Bool {
    let start = MusicText.whitespaceEnd(scalars, from: 0)
    let trailing = MusicText.trailingWhitespaceStart(scalars)
    if braced(scalars, from: start, opening: 2) {
      return true
    }
    for word in ["column_break", "page_break"] {
      let literal = MusicText.scalars(word)
      if MusicText.matchesFolded(scalars, at: start, literal), start + literal.count >= trailing {
        return true
      }
    }
    for word in ["transpose", "redefine"] {
      let literal = MusicText.scalars(word)
      guard MusicText.matchesFolded(scalars, at: start, literal) else { continue }
      var index = start + literal.count
      let afterCommand = MusicText.whitespaceEnd(scalars, from: index)
      guard afterCommand > index,
        MusicText.matchesFolded(scalars, at: afterCommand, ["k", "e", "y"])
      else { continue }
      index = afterCommand + 3
      let afterKey = MusicText.whitespaceEnd(scalars, from: index)
      guard afterKey > index else { continue }
      index = afterKey
      if index < scalars.count, scalars[index] == "+" || scalars[index] == "-" {
        index = MusicText.whitespaceEnd(scalars, from: index + 1)
      }
      let digitsStart = index
      while index < scalars.count, MusicText.isDigit(scalars[index]) {
        index += 1
      }
      if index > digitsStart, index >= trailing {
        return true
      }
    }
    return false
  }

  /// `NOTE_LINE_PATTERN`, `/^\s*\{.*\}\s*$/u`.
  private static func isNoteLine(_ scalars: [Unicode.Scalar]) -> Bool {
    braced(scalars, from: MusicText.whitespaceEnd(scalars, from: 0), opening: 1)
  }

  /// Whether the line holds `opening` braces at `start`, then `.*` (no line
  /// terminators), then as many closing braces, then only spaces to the end.
  private static func braced(_ scalars: [Unicode.Scalar], from start: Int, opening: Int) -> Bool {
    guard start + opening <= scalars.count,
      scalars[start..<(start + opening)].allSatisfy({ $0 == "{" })
    else {
      return false
    }
    let bodyStart = start + opening
    let bodyLimit =
      scalars[bodyStart...].firstIndex(where: MusicText.isLineTerminator) ?? scalars.count
    let trailing = MusicText.trailingWhitespaceStart(scalars)
    // `.*` may stop anywhere before the first line terminator; the closing
    // braces must follow it and leave only spaces after them.
    for closeStart in bodyStart..<max(bodyStart, bodyLimit) {
      let closeEnd = closeStart + opening
      guard closeEnd <= bodyLimit,
        scalars[closeStart..<closeEnd].allSatisfy({ $0 == "}" }),
        closeEnd >= trailing
      else { continue }
      return true
    }
    return false
  }
}

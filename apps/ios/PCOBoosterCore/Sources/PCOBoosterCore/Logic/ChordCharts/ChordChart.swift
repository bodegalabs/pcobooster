// Port of packages/planning-center-models/src/chord-chart.ts, pinned by the
// `chordcharts.chart.*` parity suites (scripts/parity/chord-charts.parity.ts).

/// Reads Planning Center's Lyrics & Chords text (`Arrangement.chord_chart`):
/// ChordPro inline chords (`[G]Amazing grace`), chords written on their own
/// line above the lyrics, and Services' section headings and codes. Services
/// renders the chart itself; these helpers color it for editing, transpose it,
/// and import pasted text into it.
public enum ChordChart {
  public static let columnBreak = "COLUMN_BREAK"
  public static let pageBreak = "PAGE_BREAK"

  /// Section names Planning Center formats as headings, optionally numbered (`VERSE 2`).
  private static let sectionNames: [[Unicode.Scalar]] = [
    "intro", "verse", "pre-chorus", "prechorus", "pre chorus", "chorus", "post-chorus",
    "postchorus", "post chorus", "refrain", "bridge", "tag", "interlude", "instrumental",
    "turnaround", "vamp", "breakdown", "ending", "outro", "coda", "misc", "spoken", "solo",
    "rap", "hook", "channel",
  ].map { MusicText.scalars($0) }

  /// Whether a line is a section heading such as `VERSE 1`, `Chorus 2x`, or `Bridge (softly):`.
  public static func isSectionHeading(_ line: String) -> Bool {
    let scalars = MusicText.scalars(line)
    return !scalars.contains("[") && matchesSectionPattern(Array(MusicText.trimmed(scalars)))
  }

  /// A line of chords written above lyrics, such as `G    D/F#   Em`.
  public static func isChordLine(_ line: String) -> Bool {
    let scalars = MusicText.scalars(line)
    if scalars.contains("[") || hasPlainTextTag(scalars) {
      return false
    }
    var chords = 0
    for token in words(scalars) {
      if ChordChords.isChord(MusicText.string(token.scalars)) {
        chords += 1
      } else if !isChordLineSymbol(token.scalars) {
        return false
      }
    }
    return chords > 0
  }

  /// The chart's written key moved to another key: rewrites the chords in the
  /// text itself. Chords on their own line stay over the lyric column they
  /// started on (columns counted in UTF-16, as the web counts them).
  public static func transpose(_ text: String, from: ChartKey, to: ChartKey) -> String {
    let semitones = ChordChords.semitonesBetween(from, to)
    if semitones == 0 {
      return text
    }
    return MusicText.split(text, separator: "\n")
      .map { line in
        isChordLine(line)
          ? transposeChordLine(line, semitones: semitones, to: to)
          : transposeBracketedChords(line, semitones: semitones, to: to)
      }
      .joined(separator: "\n")
  }

  // MARK: Tokens

  /// A `\S+` run and its position, in code points and in UTF-16 code units.
  struct Word {
    var scalars: ArraySlice<Unicode.Scalar>
    var utf16Offset: Int
  }

  /// `line.matchAll(/\S+/gu)`.
  static func words(_ scalars: [Unicode.Scalar]) -> [Word] {
    var words: [Word] = []
    var index = 0
    var utf16Offset = 0
    while index < scalars.count {
      guard !MusicText.isWhitespace(scalars[index]) else {
        utf16Offset += scalars[index].utf16.count
        index += 1
        continue
      }
      let start = index
      let startOffset = utf16Offset
      while index < scalars.count, !MusicText.isWhitespace(scalars[index]) {
        utf16Offset += scalars[index].utf16.count
        index += 1
      }
      words.append(Word(scalars: scalars[start..<index], utf16Offset: startOffset))
    }
    return words
  }

  /// `/<t>/iu`: Planning Center's plain text tag.
  private static func hasPlainTextTag(_ scalars: [Unicode.Scalar]) -> Bool {
    guard scalars.count >= 3 else { return false }
    for index in 0...(scalars.count - 3)
    where scalars[index] == "<" && MusicText.folded(scalars[index + 1]) == "t"
      && scalars[index + 2] == ">"
    {
      return true
    }
    return false
  }

  /// Chord-line tokens that are not chords: bar lines, repeats, and rests.
  /// `CHORD_LINE_SYMBOL_PATTERN`: one of `|`, `||`, `/`, `-`, an en dash, `%`,
  /// `.`, `:`, `(`, `)`; a repeat count (`x2`, `(×3)`); `N.C.`; or anything
  /// without spaces in parentheses, compared case-insensitively.
  static func isChordLineSymbol(_ token: ArraySlice<Unicode.Scalar>) -> Bool {
    let symbols = ["|", "||", "/", "-", "\u{2013}", "%", ".", ":", "(", ")"]
    if symbols.contains(where: { MusicText.equals(token, $0) }) {
      return true
    }
    let scalars = Array(token)
    return isRepeatCount(scalars) || isNoChord(scalars) || isParenthesized(scalars)
  }

  /// `\(?[x×]\d+\)?`, which also covers `[x×]\d+`.
  private static func isRepeatCount(_ scalars: [Unicode.Scalar]) -> Bool {
    var index = 0
    if index < scalars.count, scalars[index] == "(" {
      index += 1
    }
    guard index < scalars.count, isTimes(scalars[index]) else { return false }
    index += 1
    let digitsStart = index
    while index < scalars.count, MusicText.isDigit(scalars[index]) {
      index += 1
    }
    guard index > digitsStart else { return false }
    if index < scalars.count, scalars[index] == ")" {
      index += 1
    }
    return index == scalars.count
  }

  /// `[x×]` with the `i` flag.
  static func isTimes(_ scalar: Unicode.Scalar) -> Bool {
    MusicText.folded(scalar) == "x" || scalar == "\u{D7}"
  }

  /// `N\.?C\.?` with the `i` flag.
  private static func isNoChord(_ scalars: [Unicode.Scalar]) -> Bool {
    var index = 0
    guard index < scalars.count, MusicText.folded(scalars[index]) == "n" else { return false }
    index += 1
    if index < scalars.count, scalars[index] == "." {
      index += 1
    }
    guard index < scalars.count, MusicText.folded(scalars[index]) == "c" else { return false }
    index += 1
    if index < scalars.count, scalars[index] == "." {
      index += 1
    }
    return index == scalars.count
  }

  /// `\(\S*\)`.
  private static func isParenthesized(_ scalars: [Unicode.Scalar]) -> Bool {
    scalars.count >= 2 && scalars.first == "(" && scalars.last == ")"
      && !scalars[1..<(scalars.count - 1)].contains(where: MusicText.isWhitespace)
  }

  // MARK: Section headings

  /// `SECTION_PATTERN`, tested on a trimmed line:
  /// `^(?:names)(?:\s*\d+[a-z]?)?(?:\s*[(]?\s*[x×]\s*\d+\s*[)]?)?(?:\s*[(][^)]*[)])?\s*:?$`
  /// with the `iu` flags. The pattern has no captures, so this follows every
  /// way it can match at once: each step maps the positions reachable so far
  /// to the positions reachable after it, and the line matches when its end is
  /// reachable.
  private static func matchesSectionPattern(_ scalars: [Unicode.Scalar]) -> Bool {
    let reach = SectionReach(scalars: scalars)
    let named = Set(
      sectionNames.filter { MusicText.matchesFolded(scalars, at: 0, $0) }.map(\.count))
    // (?:\s*\d+[a-z]?)?
    let numbered = named.union(
      reach.optional(MusicText.isFoldedLetter, reach.digits(reach.whitespace(named))))
    // (?:\s*[(]?\s*[x×]\s*\d+\s*[)]?)?
    let opened = reach.whitespace(reach.optional({ $0 == "(" }, reach.whitespace(numbered)))
    let counted = reach.whitespace(
      reach.digits(reach.whitespace(reach.single(isTimes, opened))))
    let repeated = numbered.union(reach.optional({ $0 == ")" }, counted))
    // (?:\s*[(][^)]*[)])?
    let noted = repeated.union(reach.parenthetical(reach.whitespace(repeated)))
    // \s*:?$
    let ends = reach.optional({ $0 == ":" }, reach.whitespace(noted))
    return ends.contains(scalars.count)
  }

  /// Steps of `matchesSectionPattern`, each from a set of positions to the next.
  private struct SectionReach {
    let scalars: [Unicode.Scalar]

    /// `\s*`.
    func whitespace(_ positions: Set<Int>) -> Set<Int> {
      var reached = Set<Int>()
      for position in positions {
        reached.formUnion(position...MusicText.whitespaceEnd(scalars, from: position))
      }
      return reached
    }

    /// `\d+`.
    func digits(_ positions: Set<Int>) -> Set<Int> {
      var reached = Set<Int>()
      for position in positions {
        var index = position
        while index < scalars.count, MusicText.isDigit(scalars[index]) {
          index += 1
          reached.insert(index)
        }
      }
      return reached
    }

    /// One code point matching `test`.
    func single(_ test: (Unicode.Scalar) -> Bool, _ positions: Set<Int>) -> Set<Int> {
      Set(positions.filter { $0 < scalars.count && test(scalars[$0]) }.map { $0 + 1 })
    }

    /// An optional code point matching `test`.
    func optional(_ test: (Unicode.Scalar) -> Bool, _ positions: Set<Int>) -> Set<Int> {
      positions.union(single(test, positions))
    }

    /// `[(][^)]*[)]`: from an opening parenthesis through the first closing one.
    func parenthetical(_ positions: Set<Int>) -> Set<Int> {
      var reached = Set<Int>()
      for position in positions where position < scalars.count && scalars[position] == "(" {
        if let close = scalars[(position + 1)...].firstIndex(of: ")") {
          reached.insert(close + 1)
        }
      }
      return reached
    }
  }

  // MARK: Transposing

  /// Transposes a chord line, keeping each chord over the lyric column it
  /// started on. Trailing spaces and a Windows `\r` stay as they were, so only
  /// the chords change.
  private static func transposeChordLine(_ line: String, semitones: Int, to: ChartKey) -> String {
    let scalars = MusicText.scalars(line)
    var result: [UInt16] = []
    for word in words(scalars) {
      let column = max(word.utf16Offset, result.count + (result.isEmpty ? 0 : 1))
      if result.count < column {
        result.append(contentsOf: repeatElement(0x20, count: column - result.count))
      }
      let transposed = ChordChords.transposeChordText(
        MusicText.string(word.scalars), semitones: semitones, target: to)
      result.append(contentsOf: transposed.utf16)
    }
    let trailing = scalars[MusicText.trailingWhitespaceStart(scalars)...]
    return String(decoding: result, as: UTF16.self) + MusicText.string(trailing)
  }

  /// `line.replaceAll(/\[(?<chord>[^\]]*)\]/gu, ...)`: transposes each `[chord]`.
  private static func transposeBracketedChords(_ line: String, semitones: Int, to: ChartKey)
    -> String
  {
    let scalars = MusicText.scalars(line)
    var result = String.UnicodeScalarView()
    var index = 0
    while index < scalars.count {
      if scalars[index] == "[", let close = scalars[(index + 1)...].firstIndex(of: "]") {
        let chord = MusicText.string(scalars[(index + 1)..<close])
        result.append("[")
        result.append(
          contentsOf: ChordChords.transposeChordText(chord, semitones: semitones, target: to)
            .unicodeScalars)
        result.append("]")
        index = close + 1
      } else {
        result.append(scalars[index])
        index += 1
      }
    }
    return String(result)
  }
}

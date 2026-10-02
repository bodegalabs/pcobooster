// Port of packages/planning-center-models/src/chord-chart-import.ts, pinned by
// the `chordcharts.import.*` and `chordcharts.fuzz.*` parity suites
// (scripts/parity/chord-charts.parity.ts).

/// What pasted text looked like.
public enum ChordChartImportFormat: String, Sendable, Codable, CaseIterable {
  /// A ChordPro file, such as a SongSelect download (`{title: ...}`, `{soc}`).
  case chordproFile = "chordpro-file"
  /// Chords written on their own line above the lyrics.
  case chordsOverLyrics = "chords-over-lyrics"
  /// Lyrics with `[G]` chords already inline.
  case inlineChords = "inline-chords"
  /// Plain lyrics.
  case lyrics
}

/// What a ChordPro file said about the song. A directive present with no
/// value reads as `""`, not `nil`.
public struct ChordChartImportMetadata: Hashable, Sendable, Codable {
  public var title: String?
  public var artist: String?
  public var key: String?
  public var tempo: String?
  public var time: String?

  public init(
    title: String? = nil, artist: String? = nil, key: String? = nil, tempo: String? = nil,
    time: String? = nil
  ) {
    self.title = title
    self.artist = artist
    self.key = key
    self.tempo = tempo
    self.time = time
  }
}

/// Pasted text as Planning Center Lyrics & Chords text.
public struct ChordChartImport: Hashable, Sendable, Codable {
  public var format: ChordChartImportFormat
  /// The chart, with inline ChordPro chords so they stay aligned when Services transposes them.
  public var chart: String
  public var metadata: ChordChartImportMetadata

  public init(format: ChordChartImportFormat, chart: String, metadata: ChordChartImportMetadata) {
    self.format = format
    self.chart = chart
    self.metadata = metadata
  }
}

/// Turns pasted text into Planning Center Lyrics & Chords text: ChordPro files
/// (such as a SongSelect download), chords written above lyrics, or plain
/// lyrics copied from anywhere.
extension ChordChart {
  /// Section directives and the heading each prints when it names no label.
  private static let sectionDirectives: [String: String] = [
    "soc": "CHORUS",
    "start_of_chorus": "CHORUS",
    "sov": "VERSE",
    "start_of_verse": "VERSE",
    "sob": "BRIDGE",
    "start_of_bridge": "BRIDGE",
  ]
  private static let commentDirectives: Set<String> = [
    "c", "comment", "ci", "comment_italic", "cb", "comment_box", "highlight",
  ]
  private static let pageBreakDirectives: Set<String> = ["np", "new_page", "npp"]
  private static let columnBreakDirectives: Set<String> = ["column_break", "colb"]

  /// The metadata a directive sets, such as `{title: ...}` or `{a: ...}`.
  private static func metadataField(_ name: String) -> WritableKeyPath<
    ChordChartImportMetadata, String?
  >? {
    switch name {
    case "t", "title": \.title
    case "artist", "a": \.artist
    case "key": \.key
    case "tempo": \.tempo
    case "time": \.time
    default: nil
    }
  }

  /// Places each chord of a chord line into the lyric line below it as
  /// `[Chord]`, at the same UTF-16 column the web uses.
  public static func mergeChordsIntoLyrics(chordLine: String, lyricLine: String) -> String {
    let chords = words(MusicText.scalars(chordLine))
    let lastColumn = chords.last?.utf16Offset ?? 0
    var lyric = Array(lyricLine.utf16)
    if lyric.count < lastColumn {
      lyric.append(contentsOf: repeatElement(0x20, count: lastColumn - lyric.count))
    }
    for chord in chords.reversed() {
      let inserted = Array("[\(MusicText.string(chord.scalars))]".utf16)
      lyric.insert(contentsOf: inserted, at: chord.utf16Offset)
    }
    // A column inside a surrogate pair splits it; JavaScript keeps the halves,
    // Swift strings cannot, so decoding writes U+FFFD for each.
    return MusicText.trimEnd(String(decoding: lyric, as: UTF16.self))
  }

  /// Which kind of text `text` is.
  public static func detectFormat(_ text: String) -> ChordChartImportFormat {
    let lines = MusicText.splitLines(text)
    if lines.contains(where: { directive(MusicText.trimmed(MusicText.scalars($0))) != nil }) {
      return .chordproFile
    }
    if lines.contains(where: isChordLine) {
      return .chordsOverLyrics
    }
    if lines.contains(where: { hasBracketedText(MusicText.scalars($0)) && heading($0) == nil }) {
      return .inlineChords
    }
    return .lyrics
  }

  /// Converts pasted text into a chart, dropping copyright and license footers.
  public static func importText(_ text: String) -> ChordChartImport {
    let source = dropFooter(text)
    let format = detectFormat(source)
    switch format {
    case .chordproFile:
      let (chart, metadata) = convertChordProFile(source)
      return ChordChartImport(format: format, chart: tidy(chart), metadata: metadata)
    case .chordsOverLyrics:
      return ChordChartImport(
        format: format, chart: tidy(convertChordsOverLyrics(source)),
        metadata: ChordChartImportMetadata())
    case .inlineChords, .lyrics:
      return ChordChartImport(
        format: format, chart: tidy(normalizeHeadings(source)),
        metadata: ChordChartImportMetadata())
    }
  }

  /// Plain lyrics, such as a lyrics site's, as a starting chart. Stanzas that
  /// repeat become choruses and print once, the rest become numbered verses,
  /// as Services charts are usually written; the arrangement's sequence gives
  /// the order. Lyrics that already name their sections, or have no stanza
  /// breaks to go by, keep their own shape.
  public static func lyricsToChart(_ text: String) -> String {
    let source = dropFooter(replacingCRLF(text))
    let stanzas = toStanzas(source)
    let labelled = MusicText.split(source, separator: "\n").contains { heading($0) != nil }
    if labelled || stanzas.count < 2 {
      return importText(source).chart
    }
    // Keys compare code point by code point, as JavaScript's Map does; Swift
    // strings would merge canonically equivalent ones (composed and decomposed Hangul).
    var keys: [[Unicode.Scalar]] = []
    var counts: [[Unicode.Scalar]: Int] = [:]
    for stanza in stanzas {
      let key = stanzaKey(stanza)
      if counts[key] == nil {
        keys.append(key)
      }
      counts[key, default: 0] += 1
    }
    let repeated = keys.filter { (counts[$0] ?? 0) > 1 }
    var printed = Set<[Unicode.Scalar]>()
    var lines: [String] = []
    var verse = 0
    for stanza in stanzas {
      let key = stanzaKey(stanza)
      guard printed.insert(key).inserted else { continue }
      if let chorus = repeated.firstIndex(of: key) {
        lines.append(repeated.count == 1 ? "CHORUS" : "CHORUS \(chorus + 1)")
      } else {
        verse += 1
        lines.append("VERSE \(verse)")
      }
      lines.append(stanza)
      lines.append("")
    }
    return tidy(lines.joined(separator: "\n"))
  }

  // MARK: Lines

  /// `text.replace(/[ \t]+$/gmu, "").replace(/\n{3,}/gu, "\n\n").trim()`, plus a final newline.
  private static func tidy(_ text: String) -> String {
    let scalars = MusicText.scalars(text)
    var withoutTrailingSpaces: [Unicode.Scalar] = []
    var index = 0
    while index < scalars.count {
      guard scalars[index] == " " || scalars[index] == "\t" else {
        withoutTrailingSpaces.append(scalars[index])
        index += 1
        continue
      }
      var end = index
      while end < scalars.count, scalars[end] == " " || scalars[end] == "\t" {
        end += 1
      }
      // With the `m` flag, `$` holds at the end and before any line terminator.
      if end < scalars.count, !MusicText.isLineTerminator(scalars[end]) {
        withoutTrailingSpaces.append(contentsOf: scalars[index..<end])
      }
      index = end
    }
    var collapsed: [Unicode.Scalar] = []
    var newlines = 0
    for scalar in withoutTrailingSpaces {
      if scalar == "\n" {
        newlines += 1
        continue
      }
      collapsed.append(contentsOf: repeatElement("\n", count: newlines >= 3 ? 2 : newlines))
      newlines = 0
      collapsed.append(scalar)
    }
    collapsed.append(contentsOf: repeatElement("\n", count: newlines >= 3 ? 2 : newlines))
    return MusicText.string(MusicText.trimmed(collapsed)) + "\n"
  }

  /// `Verse 1`, `[Chorus]`, and `(Bridge):` become Planning Center headings: `VERSE 1`.
  static func heading(_ line: String) -> String? {
    let trimmed = MusicText.trimmed(MusicText.scalars(line))
    let candidate = bracketedLabel(Array(trimmed)) ?? MusicText.string(trimmed)
    guard isSectionHeading(candidate) else { return nil }
    let withoutColon =
      candidate.unicodeScalars.last == ":"
      ? String(candidate.unicodeScalars.dropLast()) : candidate
    return MusicText.uppercased(MusicText.trim(withoutColon))
  }

  /// `/^[[(](?<label>[^\])]+)[\])]:?$/u`.
  private static func bracketedLabel(_ scalars: [Unicode.Scalar]) -> String? {
    guard let first = scalars.first, first == "[" || first == "(" else { return nil }
    guard
      let close = scalars.indices.dropFirst().first(where: {
        scalars[$0] == "]" || scalars[$0] == ")"
      }),
      close > 1
    else {
      return nil
    }
    let rest = scalars[(close + 1)...]
    guard rest.isEmpty || MusicText.equals(rest, ":") else { return nil }
    return MusicText.string(scalars[1..<close])
  }

  /// Headings get a blank line above them, as Services spaces sections.
  private static func pushHeading(_ lines: inout [String], _ heading: String) {
    if let last = lines.last, !last.isEmpty {
      lines.append("")
    }
    lines.append(heading)
  }

  /// `/\[[^\]]+\]/u`: a bracket pair with something inside.
  private static func hasBracketedText(_ scalars: [Unicode.Scalar]) -> Bool {
    for (index, scalar) in scalars.enumerated() where scalar == "[" {
      if let close = scalars[(index + 1)...].firstIndex(of: "]"), close > index + 1 {
        return true
      }
    }
    return false
  }

  // MARK: ChordPro

  /// `DIRECTIVE_PATTERN`, `/^\{(?<name>[a-z_]+)(?:\s*[:\s]\s*(?<value>.*?))?\s*\}$/iu`,
  /// on a trimmed line. `value` is `nil` when the directive has no separator.
  private static func directive(_ line: ArraySlice<Unicode.Scalar>)
    -> (name: String, value: String?)?
  {
    let scalars = Array(line)
    guard scalars.count >= 3, scalars.first == "{", scalars.last == "}" else { return nil }
    let close = scalars.count - 1
    // `[a-z_]+` with `iu` also admits the long s and the Kelvin sign.
    var nameEnd = 1
    while nameEnd < close, MusicText.isFoldedLetter(scalars[nameEnd]) || scalars[nameEnd] == "_" {
      nameEnd += 1
    }
    guard nameEnd > 1 else { return nil }
    let name = MusicText.string(scalars[1..<nameEnd])
    if let value = directiveValue(scalars, from: nameEnd, close: close) {
      return (name, value)
    }
    guard scalars[nameEnd..<close].allSatisfy(MusicText.isWhitespace) else { return nil }
    return (name, nil)
  }

  /// The optional `\s*[:\s]\s*(?<value>.*?)` group, matched the way JavaScript
  /// backtracks: the separator is a colon after any spaces, else the last of
  /// those spaces; the value is lazy, so it stops at the spaces before the
  /// closing brace, and `.` refuses line terminators.
  private static func directiveValue(_ scalars: [Unicode.Scalar], from start: Int, close: Int)
    -> String?
  {
    let spaced = MusicText.whitespaceEnd(scalars, from: start)
    let afterSeparator: Int
    if scalars[spaced] == ":" {
      afterSeparator = spaced + 1
    } else if spaced > start {
      afterSeparator = spaced
    } else {
      return nil
    }
    let valueStart = MusicText.whitespaceEnd(scalars, from: afterSeparator)
    var trailingSpaces = close
    while trailingSpaces > 0, MusicText.isWhitespace(scalars[trailingSpaces - 1]) {
      trailingSpaces -= 1
    }
    let valueEnd = max(valueStart, trailingSpaces)
    let value = scalars[valueStart..<valueEnd]
    guard !value.contains(where: MusicText.isLineTerminator) else { return nil }
    return MusicText.string(value)
  }

  private static func convertChordProFile(_ text: String) -> (String, ChordChartImportMetadata) {
    var metadata = ChordChartImportMetadata()
    var lines: [String] = []
    for rawLine in MusicText.splitLines(text) {
      let line = MusicText.trimEnd(rawLine)
      if line.unicodeScalars.first == "#" {
        continue
      }
      guard let directive = directive(MusicText.trimmed(MusicText.scalars(line))) else {
        lines.append(heading(line) ?? line)
        continue
      }
      let name = MusicText.lowercased(directive.name)
      let value = MusicText.trim(directive.value ?? "")
      if let field = metadataField(name) {
        metadata[keyPath: field] = value
      } else if let sectionHeading = sectionDirectives[name] {
        pushHeading(&lines, value.isEmpty ? sectionHeading : MusicText.uppercased(value))
      } else if commentDirectives.contains(name) {
        if let heading = heading(value) {
          pushHeading(&lines, heading)
        } else {
          lines.append("{ \(value) }")
        }
      } else if pageBreakDirectives.contains(name) {
        lines.append(pageBreak)
      } else if columnBreakDirectives.contains(name) {
        lines.append(columnBreak)
      }
      // Every other directive (`{eoc}`, `{ccli}`, `{capo}`) would print as a
      // note in Services, so it is dropped.
    }
    return (lines.joined(separator: "\n"), metadata)
  }

  // MARK: Chords over lyrics and plain lyrics

  private static func convertChordsOverLyrics(_ text: String) -> String {
    let source = MusicText.splitLines(text)
    var lines: [String] = []
    var index = 0
    while index < source.count {
      let line = MusicText.trimEnd(source[index])
      if let heading = heading(line) {
        pushHeading(&lines, heading)
        index += 1
        continue
      }
      let next = index + 1 < source.count ? source[index + 1] : nil
      if let next, !MusicText.trim(next).isEmpty, !isChordLine(next), heading(next) == nil,
        isChordLine(line)
      {
        lines.append(mergeChordsIntoLyrics(chordLine: line, lyricLine: MusicText.trimEnd(next)))
        index += 2
        continue
      }
      lines.append(line)
      index += 1
    }
    return lines.joined(separator: "\n")
  }

  private static func normalizeHeadings(_ text: String) -> String {
    var lines: [String] = []
    for line in MusicText.splitLines(text) {
      if let heading = heading(line) {
        pushHeading(&lines, heading)
      } else {
        lines.append(line)
      }
    }
    return lines.joined(separator: "\n")
  }

  /// Copyright and license lines SongSelect and lyric sites append; Services prints its own.
  private static func dropFooter(_ text: String) -> String {
    MusicText.splitLines(text)
      .filter { !isFooter(Array(MusicText.trimmed(MusicText.scalars($0)))) }
      .joined(separator: "\n")
  }

  /// `FOOTER_PATTERN`, a case-insensitive prefix test:
  /// `/^(?:ccli\s+(?:song|licen[cs]e)|©|\(c\)|copyright\b|for use solely with the songselect|note:\s*reproduction|www\.ccli\.com|songselect\b)/iu`.
  private static func isFooter(_ scalars: [Unicode.Scalar]) -> Bool {
    func literal(_ text: String, at index: Int) -> Int? {
      let expected = MusicText.scalars(text)
      return MusicText.matchesFolded(scalars, at: index, expected) ? index + expected.count : nil
    }
    func wordEnds(at index: Int) -> Bool {
      index == scalars.count || !MusicText.isFoldedWordCharacter(scalars[index])
    }
    if let afterCCLI = literal("ccli", at: 0) {
      let afterSpace = MusicText.whitespaceEnd(scalars, from: afterCCLI)
      if afterSpace > afterCCLI {
        if literal("song", at: afterSpace) != nil {
          return true
        }
        if let afterLicen = literal("licen", at: afterSpace), afterLicen + 1 < scalars.count,
          ["c", "s"].contains(MusicText.folded(scalars[afterLicen])),
          MusicText.folded(scalars[afterLicen + 1]) == "e"
        {
          return true
        }
      }
    }
    if scalars.first == "\u{A9}" || literal("(c)", at: 0) != nil {
      return true
    }
    if let end = literal("copyright", at: 0), wordEnds(at: end) {
      return true
    }
    if literal("for use solely with the songselect", at: 0) != nil
      || literal("www.ccli.com", at: 0) != nil
    {
      return true
    }
    if let afterNote = literal("note:", at: 0),
      literal("reproduction", at: MusicText.whitespaceEnd(scalars, from: afterNote)) != nil
    {
      return true
    }
    if let end = literal("songselect", at: 0), wordEnds(at: end) {
      return true
    }
    return false
  }

  private static func replacingCRLF(_ text: String) -> String {
    let scalars = MusicText.scalars(text)
    var result = String.UnicodeScalarView()
    var index = 0
    while index < scalars.count {
      if scalars[index] == "\r", index + 1 < scalars.count, scalars[index + 1] == "\n" {
        result.append("\n")
        index += 2
      } else {
        result.append(scalars[index])
        index += 1
      }
    }
    return String(result)
  }

  /// `text.split(/\n\s*\n/u)`, each stanza's lines trimmed and blank ones dropped.
  private static func toStanzas(_ text: String) -> [String] {
    let scalars = MusicText.scalars(text)
    var pieces: [ArraySlice<Unicode.Scalar>] = []
    var pieceStart = 0
    var index = 0
    while index < scalars.count {
      // A break runs from a newline through the last newline of the spaces
      // after it, as the greedy `\s*` backtracks to the final `\n`.
      if scalars[index] == "\n" {
        let spacesEnd = MusicText.whitespaceEnd(scalars, from: index + 1)
        if let lastNewline = scalars[(index + 1)..<spacesEnd].lastIndex(of: "\n") {
          pieces.append(scalars[pieceStart..<index])
          pieceStart = lastNewline + 1
          index = lastNewline + 1
          continue
        }
      }
      index += 1
    }
    pieces.append(scalars[pieceStart...])
    return pieces.compactMap { piece in
      let stanza = MusicText.split(MusicText.string(piece), separator: "\n")
        .map(MusicText.trim)
        .filter { !$0.isEmpty }
        .joined(separator: "\n")
      return stanza.isEmpty ? nil : stanza
    }
  }

  /// A stanza's letters and digits, lowercased, to spot repeats.
  private static func stanzaKey(_ stanza: String) -> [Unicode.Scalar] {
    MusicText.lowercased(stanza).unicodeScalars.filter(isLetterOrNumber)
  }

  /// `[\p{L}\p{N}]`.
  private static func isLetterOrNumber(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.properties.generalCategory {
    case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter,
      .decimalNumber, .letterNumber, .otherNumber:
      true
    default:
      false
    }
  }
}

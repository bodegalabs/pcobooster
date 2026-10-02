// Port of packages/planning-center-models/src/chord-chart-chords.ts, pinned by
// the `chordcharts.chords.*` parity suites (scripts/parity/chord-charts.parity.ts).

/// A chord chart's key (`MusicalKey` in chord-chart-chords.ts): a pitch class
/// and mode, named the way Planning Center lists keys for `chord_chart_key`.
/// Distinct from `SpelledKey`, which set flow advice spells letter by letter.
public struct ChartKey: Hashable, Sendable, Codable {
  /// Pitch class of the tonic, 0 (C) through 11 (B).
  public let pitch: Int
  public let minor: Bool
  /// Planning Center's name for the key, such as `Bb` or `F#m`.
  public let name: String

  /// The key on `pitch` (any integer, taken modulo 12), named as Planning Center lists it.
  public init(pitch: Int, minor: Bool) {
    let pitchClass = ChordChords.mod12(pitch)
    self.pitch = pitchClass
    self.minor = minor
    self.name = ChordChords.keyName(pitch: pitchClass, minor: minor)
  }
}

/// A chord read from chart text: its root, quality as written, and bass note.
public struct ParsedChord: Hashable, Sendable, Codable {
  public let pitch: Int
  /// Everything between the root and the bass, as written: `m7`, `sus4`, `(add9)`.
  public let quality: String
  public let bassPitch: Int?

  public init(pitch: Int, quality: String, bassPitch: Int?) {
    self.pitch = pitch
    self.quality = quality
    self.bassPitch = bassPitch
  }
}

/// Chord and key arithmetic for Planning Center chord charts
/// (`Arrangement.chord_chart`): reading keys and chords and transposing chords
/// into another key.
public enum ChordChords {
  private static let semitones = 12
  private static let minorThird = 3

  /// Planning Center's own scale for keys without a sharp or flat preference.
  private static let neutralNames = [
    "C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B",
  ]
  private static let sharpNames = [
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
  ]
  private static let flatNames = [
    "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
  ]
  /// Major key names by pitch, as Planning Center lists them.
  private static let majorKeyNames = neutralNames
  private static let minorKeyNames = [
    "Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm",
  ]
  /// Relative-major pitches whose key signatures use sharps and flats.
  private static let sharpKeyPitches: Set<Int> = [7, 2, 9, 4, 11, 6, 1]
  private static let flatKeyPitches: Set<Int> = [5, 10, 3, 8]

  /// Every key Planning Center accepts for `chord_chart_key`, majors then minors.
  public static let chartKeys: [String] = majorKeyNames + minorKeyNames

  static func mod12(_ value: Int) -> Int {
    ((value % semitones) + semitones) % semitones
  }

  /// `[#b♯♭]` as a semitone offset.
  static func accidentalOffset(_ scalar: Unicode.Scalar) -> Int? {
    switch scalar {
    case "#", "\u{266F}": 1
    case "b", "\u{266D}": -1
    default: nil
    }
  }

  /// The pitch of a letter and accidental, as chord-chart-chords.ts's table
  /// lists all 21 spellings (B# is C, Fb is E).
  private static func pitch(_ letter: NoteLetter, _ accidental: Int) -> Int {
    mod12(letter.pitch + accidental)
  }

  /// The Planning Center name of a key, such as `Bb` or `F#m`.
  public static func keyName(pitch: Int, minor: Bool) -> String {
    (minor ? minorKeyNames : majorKeyNames)[mod12(pitch)]
  }

  /// Reads a key such as `F#`, `Bbm`, `A♭`, `Cmin`, or `E-`; `nil` for anything else.
  public static func parseKey(_ value: String?) -> ChartKey? {
    // /^(?<root>[A-G])(?<accidental>[#b♯♭]?)(?<minor>m|min|-)?$/u on the trimmed value
    let scalars = Array(MusicText.trimmed(MusicText.scalars(value ?? "")))
    guard let first = scalars.first, let root = NoteLetter(scalar: first) else { return nil }
    var index = 1
    var accidental = 0
    if index < scalars.count, let offset = accidentalOffset(scalars[index]) {
      accidental = offset
      index += 1
    }
    let mode = scalars[index...]
    let minor: Bool
    if mode.isEmpty {
      minor = false
    } else if MusicText.equals(mode, "m") || MusicText.equals(mode, "min")
      || MusicText.equals(mode, "-")
    {
      minor = true
    } else {
      return nil
    }
    return ChartKey(pitch: pitch(root, accidental), minor: minor)
  }

  public static func transposeKey(_ key: ChartKey, by semitones: Int) -> ChartKey {
    ChartKey(pitch: key.pitch + semitones, minor: key.minor)
  }

  /// Semitones to move from one key to another, choosing the smaller direction.
  public static func semitonesBetween(_ from: ChartKey, _ to: ChartKey) -> Int {
    let up = mod12(to.pitch - from.pitch)
    return up > semitones / 2 ? up - semitones : up
  }

  /// Note names that read naturally in a key: sharps in G, flats in F, Planning Center's in C.
  private static func noteNames(for key: ChartKey?) -> [String] {
    guard let key else { return neutralNames }
    let relativeMajor = key.minor ? mod12(key.pitch + minorThird) : key.pitch
    if sharpKeyPitches.contains(relativeMajor) {
      return sharpNames
    }
    if flatKeyPitches.contains(relativeMajor) {
      return flatNames
    }
    return neutralNames
  }

  // MARK: Chords

  /// Chord qualities: `m7`, `sus4`, `maj7`, `add9`, `7(b9)`, `°`, `ø`, `∆`, `2`, and so on.
  private static let qualityTokens: [[Unicode.Scalar]] = [
    "maj", "min", "dim", "aug", "sus", "add", "alt", "omit", "no", "m", "M", "\u{B0}", "\u{F8}",
    "\u{2206}", "\u{394}", "+", "-", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "b", "#",
    "\u{266D}", "\u{266F}", "(", ")", ",",
  ].map { MusicText.scalars($0) }

  /// `QUALITY_PATTERN`: whether the quality splits into known pieces, by
  /// finding every position a sequence of pieces can reach.
  private static func isQuality(_ scalars: ArraySlice<Unicode.Scalar>) -> Bool {
    let quality = Array(scalars)
    var reachable = [Bool](repeating: false, count: quality.count + 1)
    reachable[0] = true
    for start in quality.indices where reachable[start] {
      for token in qualityTokens
      where start + token.count <= quality.count
        && quality[start..<(start + token.count)].elementsEqual(token)
      {
        reachable[start + token.count] = true
      }
    }
    return reachable[quality.count]
  }

  /// Reads a chord such as `C#m7`, `G/B`, `Bb(add9)`, or `F#m7b5`; `nil` for
  /// words and anything else.
  public static func parseChord(_ value: String) -> ParsedChord? {
    // /^(?<root>[A-G])(?<accidental>[#b♯♭]?)(?<quality>[^/]*?)(?:\/(?<bassRoot>[A-G])(?<bassAccidental>[#b♯♭]?))?$/u
    let scalars = MusicText.scalars(value)
    guard let first = scalars.first, let root = NoteLetter(scalar: first) else { return nil }
    var qualityStart = 1
    var accidental = 0
    if qualityStart < scalars.count, let offset = accidentalOffset(scalars[qualityStart]) {
      accidental = offset
      qualityStart += 1
    }
    // The quality cannot hold a "/", so it ends at the first one, and the rest
    // must be exactly a bass note.
    let slash = scalars[qualityStart...].firstIndex(of: "/")
    var bassPitch: Int?
    if let slash {
      let bassIndex = slash + 1
      guard bassIndex < scalars.count, let bass = NoteLetter(scalar: scalars[bassIndex]) else {
        return nil
      }
      var end = bassIndex + 1
      var bassAccidental = 0
      if end < scalars.count, let offset = accidentalOffset(scalars[end]) {
        bassAccidental = offset
        end += 1
      }
      guard end == scalars.count else { return nil }
      bassPitch = pitch(bass, bassAccidental)
    }
    let quality = scalars[qualityStart..<(slash ?? scalars.count)]
    guard isQuality(quality) else { return nil }
    return ParsedChord(
      pitch: pitch(root, accidental), quality: MusicText.string(quality), bassPitch: bassPitch)
  }

  public static func isChord(_ value: String) -> Bool {
    parseChord(value) != nil
  }

  /// `[^\s/|[\]{}]`: what a chord token may hold after its root.
  private static func isChordTokenBody(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar {
    case "/", "|", "[", "]", "{", "}": false
    default: !MusicText.isWhitespace(scalar)
    }
  }

  /// Rewrites every chord token in `text`, leaving anything that is not a chord untouched.
  private static func mapChordTokens(_ text: String, _ format: (ParsedChord) -> String) -> String {
    // /[A-G][#b♯♭]?[^\s/|[\]{}]*(?:\/[A-G][#b♯♭]?)?/gu
    let scalars = MusicText.scalars(text)
    var result = String.UnicodeScalarView()
    var index = 0
    while index < scalars.count {
      guard NoteLetter(scalar: scalars[index]) != nil else {
        result.append(scalars[index])
        index += 1
        continue
      }
      // The accidental is also a body character, so the body run covers it.
      var end = index + 1
      while end < scalars.count, isChordTokenBody(scalars[end]) {
        end += 1
      }
      if end + 1 < scalars.count, scalars[end] == "/", NoteLetter(scalar: scalars[end + 1]) != nil {
        end += 2
        if end < scalars.count, accidentalOffset(scalars[end]) != nil {
          end += 1
        }
      }
      let token = MusicText.string(scalars[index..<end])
      result.append(contentsOf: (parseChord(token).map(format) ?? token).unicodeScalars)
      index = end
    }
    return String(result)
  }

  /// Moves every chord in `text` by `semitones`, spelled for `target`
  /// (Planning Center's neutral names when `nil`).
  public static func transposeChordText(_ text: String, semitones: Int, target: ChartKey?)
    -> String
  {
    let names = noteNames(for: target)
    return mapChordTokens(text) { chord in
      let root = names[mod12(chord.pitch + semitones)]
      let bass = chord.bassPitch.map { "/\(names[mod12($0 + semitones)])" } ?? ""
      return "\(root)\(chord.quality)\(bass)"
    }
  }
}

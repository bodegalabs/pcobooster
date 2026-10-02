// Port of apps/web/src/lib/key-theory.ts, pinned by the `music.keyTheory.*`
// parity suites (scripts/parity/music.parity.ts).

/// A note's letter name, C through B.
public enum NoteLetter: String, CaseIterable, Sendable, Codable {
  case c = "C"
  case d = "D"
  case e = "E"
  case f = "F"
  case g = "G"
  case a = "A"
  case b = "B"

  /// Semitones above C.
  public var pitch: Int {
    switch self {
    case .c: 0
    case .d: 2
    case .e: 4
    case .f: 5
    case .g: 7
    case .a: 9
    case .b: 11
    }
  }

  /// Position from C, 0 through 6.
  var index: Int {
    switch self {
    case .c: 0
    case .d: 1
    case .e: 2
    case .f: 3
    case .g: 4
    case .a: 5
    case .b: 6
    }
  }

  /// The letter `steps` letters above this one, wrapping from B to C.
  func advanced(by steps: Int) -> NoteLetter {
    let letters = Self.allCases
    return letters[((index + steps) % letters.count + letters.count) % letters.count]
  }

  /// `[A-G]`.
  init?(scalar: Unicode.Scalar) {
    self.init(rawValue: String(scalar))
  }
}

/// A key spelled for set flow advice (`MusicalKey` in key-theory.ts): a tonic
/// letter and accidental, so the dominant of Db reads Ab7, never G#7. Distinct
/// from `ChartKey`, which chord charts use and which keeps only a pitch class.
public struct SpelledKey: Hashable, Sendable, Codable {
  public var letter: NoteLetter
  /// -1 flat, 0 natural, 1 sharp.
  public var accidental: Int
  public var minor: Bool

  public init(letter: NoteLetter, accidental: Int, minor: Bool) {
    self.letter = letter
    self.accidental = accidental
    self.minor = minor
  }
}

/// A scale degree or chord root, on its own letter.
public struct SpelledNote: Hashable, Sendable, Codable {
  public var letter: NoteLetter
  public var accidental: Int
  /// Pitch class, 0 (C) through 11 (B).
  public var pitch: Int

  public init(letter: NoteLetter, accidental: Int, pitch: Int) {
    self.letter = letter
    self.accidental = accidental
    self.pitch = pitch
  }
}

/// A chord's quality as its name writes it: `""`, `"m"`, `"dim"`, or `"7"`.
public enum ChordQuality: String, Sendable, Codable, CaseIterable {
  case major = ""
  case minor = "m"
  case diminished = "dim"
  case dominantSeventh = "7"
}

/// A chord spelled in a key.
public struct Chord: Hashable, Sendable {
  public var root: SpelledNote
  public var quality: ChordQuality
  /// Roman numeral within the key it was spelled in, such as "V7" or "vi".
  public var numeral: String

  public init(root: SpelledNote, quality: ChordQuality, numeral: String) {
    self.root = root
    self.quality = quality
    self.numeral = numeral
  }
}

/// A chord both keys share, spelled and numbered in the new key.
public struct PivotChord: Hashable, Sendable {
  public var chord: Chord
  /// Borrowed from the first key's parallel minor rather than found in the key itself.
  public var borrowed: Bool

  public init(chord: Chord, borrowed: Bool) {
    self.chord = chord
    self.borrowed = borrowed
  }
}

/// A note's place in a triad.
public enum ChordTone: String, Sendable, Codable, CaseIterable {
  case root
  case third
  case fifth
}

/// A note that rings from the first song's last chord into the next song's first one.
public struct CommonToneChord: Hashable, Sendable {
  /// The note to hold, spelled in the new key.
  public var tone: SpelledNote
  /// The same note as the band plays it on the first song's chord (Eb where the new key says D#).
  public var fromTone: SpelledNote
  /// The chord the first song ends on, spelled in its key: its home chord, or a close one.
  public var from: Chord
  /// What the held note is in that chord.
  public var fromRole: ChordTone
  /// The chord the note carries into: the new song's opening chord, or another to open on.
  public var to: Chord
  public var toRole: ChordTone

  public init(
    tone: SpelledNote, fromTone: SpelledNote, from: Chord, fromRole: ChordTone, to: Chord,
    toRole: ChordTone
  ) {
    self.tone = tone
    self.fromTone = fromTone
    self.from = from
    self.fromRole = fromRole
    self.to = to
    self.toRole = toRole
  }
}

/// Key and chord spelling for set flow suggestions. Every name is spelled from
/// the key's own scale, one letter per degree, so the dominant of Db is Ab7
/// (never G#7) and the third of F# major is A# (never Bb).
public enum KeyTheory {
  private static let octave = 12
  private static let fifthDegree = 4
  private static let majorSteps = [0, 2, 4, 5, 7, 9, 11]
  private static let naturalMinorSteps = [0, 2, 3, 5, 7, 8, 10]
  private static let majorQualities: [ChordQuality] = [
    .major, .minor, .minor, .major, .major, .minor, .diminished,
  ]
  private static let minorQualities: [ChordQuality] = [
    .minor, .diminished, .major, .minor, .minor, .major, .major,
  ]
  private static let majorNumerals = ["I", "ii", "iii", "IV", "V", "vi", "vii\u{B0}"]
  private static let minorNumerals = ["i", "ii\u{B0}", "III", "iv", "v", "VI", "VII"]
  /// Where a shared chord sits in the new key, best setup first (Hutchinson 22.4).
  private static let majorPivotNumerals = ["ii", "IV", "vi", "iii"]
  private static let minorPivotNumerals = ["iv", "VI", "III", "VII", "v"]
  /// Other chords a song can end on or open with: its IV, vi, and V (iv, VI, and V in minor).
  private static let alternateEndNumerals: Set<String> = ["IV", "vi", "V", "iv", "VI"]
  private static let chordTones: [ChordTone] = [.root, .third, .fifth]

  static func mod12(_ value: Int) -> Int {
    ((value % octave) + octave) % octave
  }

  private static func accidentalText(_ accidental: Int) -> String {
    accidental > 0
      ? String(repeating: "#", count: accidental) : String(repeating: "b", count: -accidental)
  }

  // MARK: Names and pitches

  public static func pitch(_ key: SpelledKey) -> Int {
    mod12(key.letter.pitch + key.accidental)
  }

  /// The tonic's name, such as "F#" or "Bb".
  public static func noteName(_ key: SpelledKey) -> String {
    "\(key.letter.rawValue)\(accidentalText(key.accidental))"
  }

  public static func noteName(_ note: SpelledNote) -> String {
    "\(note.letter.rawValue)\(accidentalText(note.accidental))"
  }

  /// "Eb", "F#m".
  public static func name(_ key: SpelledKey) -> String {
    "\(noteName(key))\(key.minor ? "m" : "")"
  }

  public static func chordName(_ chord: Chord) -> String {
    "\(noteName(chord.root))\(chord.quality.rawValue)"
  }

  /// Reads "Eb", "F#m", "Bbmin", or "C" from a Planning Center key field.
  /// `minorOverride` (Planning Center's minor flag) wins over the name when
  /// set. A#, D#, and G# major, which no band reads, come back as their flat
  /// names.
  public static func parse(_ value: String?, minorOverride: Bool? = nil) -> SpelledKey? {
    // /^\s*(?<letter>[A-G])(?<accidental>[#♯b♭]?)(?<minor>m(?!aj)|min)?/u
    guard let value else { return nil }
    let scalars = MusicText.scalars(value)
    var index = MusicText.whitespaceEnd(scalars, from: 0)
    guard index < scalars.count, let letter = NoteLetter(scalar: scalars[index]) else {
      return nil
    }
    index += 1
    var accidental = 0
    if index < scalars.count {
      switch scalars[index] {
      case "#", "\u{266F}":
        accidental = 1
        index += 1
      case "b", "\u{266D}":
        accidental = -1
        index += 1
      default:
        break
      }
    }
    // `m(?!aj)` matches an "m" not followed by "aj"; `min` can only match
    // where that already did, so it never changes the outcome.
    let followedByAj =
      index + 2 < scalars.count && scalars[index + 1] == "a" && scalars[index + 2] == "j"
    let namedMinor = index < scalars.count && scalars[index] == "m" && !followedByAj
    let minor = minorOverride ?? namedMinor
    if !minor, accidental == 1, let respelled = theoreticalMajorRespelling(letter) {
      return SpelledKey(letter: respelled, accidental: -1, minor: minor)
    }
    return SpelledKey(letter: letter, accidental: accidental, minor: minor)
  }

  private static func theoreticalMajorRespelling(_ letter: NoteLetter) -> NoteLetter? {
    switch letter {
    case .a: .b
    case .d: .e
    case .g: .a
    default: nil
    }
  }

  /// The same tonic in the other mode: C and Cm, Am and A.
  public static func parallel(_ key: SpelledKey) -> SpelledKey {
    SpelledKey(letter: key.letter, accidental: key.accidental, minor: !key.minor)
  }

  // MARK: Scales and chords

  /// The seven scale degrees of a key, each on its own letter.
  public static func scale(_ key: SpelledKey) -> [SpelledNote] {
    let tonicPitch = pitch(key)
    let steps = key.minor ? naturalMinorSteps : majorSteps
    return steps.enumerated().map { degree, step in
      let letter = key.letter.advanced(by: degree)
      let notePitch = mod12(tonicPitch + step)
      var accidental = mod12(notePitch - letter.pitch)
      if accidental > octave / 2 {
        accidental -= octave
      }
      return SpelledNote(letter: letter, accidental: accidental, pitch: notePitch)
    }
  }

  private static func tonicNote(_ key: SpelledKey) -> SpelledNote {
    SpelledNote(letter: key.letter, accidental: key.accidental, pitch: pitch(key))
  }

  /// The key's diatonic triads, spelled from its scale. Minor keys also get
  /// the major V their raised seventh makes, which is how bands actually play
  /// the dominant in minor.
  public static func diatonicTriads(_ key: SpelledKey) -> [Chord] {
    let notes = scale(key)
    let qualities = key.minor ? minorQualities : majorQualities
    let numerals = key.minor ? minorNumerals : majorNumerals
    var triads = notes.enumerated().map { degree, root in
      Chord(root: root, quality: qualities[degree], numeral: numerals[degree])
    }
    if key.minor {
      triads.append(Chord(root: notes[fifthDegree], quality: .major, numeral: "V"))
    }
    return triads
  }

  /// The chord that sets up the dominant: ii in a major key (Em in D), iv in minor (Dm in Am).
  public static func predominant(of key: SpelledKey) -> Chord {
    let notes = scale(key)
    return Chord(
      root: key.minor ? notes[3] : notes[1], quality: .minor, numeral: key.minor ? "iv" : "ii")
  }

  /// The dominant seventh that leads into a key: A7 into D, Ab7 into Db, E7 into Am.
  public static func dominantSeventh(of key: SpelledKey) -> Chord {
    Chord(root: scale(key)[fifthDegree], quality: .dominantSeventh, numeral: "V7")
  }

  private static func chordPitches(_ chord: Chord) -> [Int] {
    let root = chord.root.pitch
    switch chord.quality {
    case .minor: return [root, mod12(root + 3), mod12(root + 7)]
    case .diminished: return [root, mod12(root + 3), mod12(root + 6)]
    case .major, .dominantSeventh: return [root, mod12(root + 4), mod12(root + 7)]
    }
  }

  private static func tonicTriad(_ key: SpelledKey) -> Chord {
    diatonicTriads(key).first
      ?? Chord(
        root: tonicNote(key), quality: key.minor ? .minor : .major, numeral: key.minor ? "i" : "I")
  }

  // MARK: Moving between keys

  private static func sharedTriads(_ from: [Chord], _ to: SpelledKey) -> [Chord] {
    let allowed = to.minor ? minorPivotNumerals : majorPivotNumerals
    let shared = diatonicTriads(to).filter { chord in
      allowed.contains(chord.numeral)
        && from.contains { $0.root.pitch == chord.root.pitch && $0.quality == chord.quality }
    }
    return stableSorted(shared) { chord in allowed.firstIndex(of: chord.numeral) ?? -1 }
  }

  /// Chords in both keys that set up the new one, spelled and numbered in the
  /// new key. The new key's I is the arrival and its V is its own suggestion,
  /// so neither is listed. When a major first key shares nothing, its parallel
  /// minor's chords are tried as borrowed ones.
  public static func pivotChords(from: SpelledKey, to: SpelledKey) -> [PivotChord] {
    let direct = sharedTriads(diatonicTriads(from), to)
    if !direct.isEmpty || from.minor {
      return direct.map { PivotChord(chord: $0, borrowed: false) }
    }
    return sharedTriads(diatonicTriads(parallel(from)), to).map {
      PivotChord(chord: $0, borrowed: true)
    }
  }

  /// Whether the first key already has the new key's home chord (E, the V of Am, into E).
  public static func homeChordIsIn(from: SpelledKey, to: SpelledKey) -> Bool {
    guard let home = diatonicTriads(to).first else { return false }
    return diatonicTriads(from).contains {
      $0.root.pitch == home.root.pitch && $0.quality == home.quality
    }
  }

  /// Whether the new key's V chord is already a chord of the first key (F in C, into Bb).
  public static func dominantIsIn(from: SpelledKey, to: SpelledKey) -> Bool {
    let fifth = scale(to)[fifthDegree]
    return diatonicTriads(from).contains { $0.quality == .major && $0.root.pitch == fifth.pitch }
  }

  /// Notes both home chords share, spelled in the new key, for a held note or pad.
  public static func commonTones(from: SpelledKey, to: SpelledKey) -> [SpelledNote] {
    let fromPitches = Set(chordPitches(tonicTriad(from)))
    let toPitches = Set(chordPitches(tonicTriad(to)))
    return scale(to).filter { fromPitches.contains($0.pitch) && toPitches.contains($0.pitch) }
  }

  /// The new key's chords that set it up, best first: the pivot chords, then V.
  private static func setupChords(_ to: SpelledKey) -> [Chord] {
    let allowed = to.minor ? minorPivotNumerals : majorPivotNumerals
    let triads = diatonicTriads(to)
    let ranked = allowed.flatMap { numeral in triads.filter { $0.numeral == numeral } }
    guard let dominant = triads.first(where: { $0.numeral == "V" && $0.quality == .major }) else {
      return ranked
    }
    return ranked + [dominant]
  }

  private static func endingChords(_ key: SpelledKey) -> [Chord] {
    [tonicTriad(key)] + diatonicTriads(key).filter { alternateEndNumerals.contains($0.numeral) }
  }

  /// Notes that ring from the first song's last chord into the next song's
  /// first one, so the band can hold one note while the chords change under
  /// it: end on F, hold its third (A), and it becomes the fifth of the opening
  /// D. Home chords come first; then the next song opens on a setup chord,
  /// then the first song ends on its IV, vi, or V, and last, both step off
  /// their home chords (Bb into E: end on F, hold A, open on A). Within each of
  /// those, notes that land as the opening chord's root come first.
  public static func commonToneChords(from: SpelledKey, to: SpelledKey) -> [CommonToneChord] {
    // Later entries win in a JavaScript Map built from pairs; scale pitches are distinct anyway.
    let spellings = Dictionary(scale(to).map { ($0.pitch, $0) }, uniquingKeysWith: { $1 })
    let fromSpellings = Dictionary(scale(from).map { ($0.pitch, $0) }, uniquingKeysWith: { $1 })
    let homeEnd = tonicTriad(from)
    let otherEnds = Array(endingChords(from).dropFirst())
    let homeOpen = tonicTriad(to)
    let otherOpens = setupChords(to)
    // Tiers, in the order the TypeScript lists its pairs: both home chords,
    // a setup chord to open on, another chord to end on, then both changed.
    var pairs: [(tier: Int, from: Chord, to: Chord)] = [(0, homeEnd, homeOpen)]
    pairs += otherOpens.map { (1, homeEnd, $0) }
    pairs += otherEnds.map { (2, $0, homeOpen) }
    pairs += otherOpens.flatMap { open in otherEnds.map { (3, $0, open) } }

    var found: [(tier: Int, shared: CommonToneChord)] = []
    for pair in pairs {
      let fromPitches = chordPitches(pair.from)
      for (toIndex, pitch) in chordPitches(pair.to).enumerated() {
        guard let tone = spellings[pitch], let fromIndex = fromPitches.firstIndex(of: pitch)
        else { continue }
        let shared = CommonToneChord(
          tone: tone, fromTone: fromSpellings[pitch] ?? tone, from: pair.from,
          fromRole: chordTones[fromIndex], to: pair.to, toRole: chordTones[toIndex])
        found.append((pair.tier, shared))
      }
    }
    // Within a tier, a held note that is the opening chord's root comes first:
    // the band holds it in unison and the new chord lands right on it.
    return stableSorted(found) { entry in entry.tier * 2 + (entry.shared.toRole == .root ? 0 : 1) }
      .map(\.shared)
  }

  /// Semitones up from one key's tonic to another's, 0 to 11.
  public static func semitonesUp(from: SpelledKey, to: SpelledKey) -> Int {
    mod12(pitch(to) - pitch(from))
  }

  /// Steps apart on the circle of fifths, 0 to 6, comparing each key's major signature.
  public static func circleOfFifthsDistance(_ a: SpelledKey, _ b: SpelledKey) -> Int {
    func signaturePitch(_ key: SpelledKey) -> Int {
      mod12(pitch(key) + (key.minor ? 3 : 0))
    }
    let fifths = mod12((signaturePitch(b) - signaturePitch(a)) * 7)
    return min(fifths, octave - fifths)
  }

  /// JavaScript's stable `toSorted` by an integer key; Swift's `sorted` does
  /// not promise stability, so ties keep their original order explicitly.
  static func stableSorted<Element>(_ elements: [Element], by key: (Element) -> Int) -> [Element] {
    elements.enumerated()
      .map { (key: key($0.element), offset: $0.offset, element: $0.element) }
      .sorted { ($0.key, $0.offset) < ($1.key, $1.offset) }
      .map(\.element)
  }
}

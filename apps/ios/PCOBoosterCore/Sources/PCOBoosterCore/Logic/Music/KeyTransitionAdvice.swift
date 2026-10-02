// Port of apps/web/src/lib/key-transition-advice.ts, pinned by the
// `music.keyTransitionAdvice.*` parity suites (scripts/parity/music.parity.ts).
// Rating and advice for key changes between back-to-back songs, following
// docs/research/song-key-transitions.md. Every suggestion names real chords and
// keys ("Play a B7"), spelled in the key the band is heading into. The copy is
// user-facing and must stay identical to the web.

/// How a change straight from one key into another is likely to feel.
public enum KeyTransitionLevel: String, Sendable, Codable, CaseIterable {
  case smooth
  case worthALook = "worth-a-look"
  case rough
}

/// Which row of the research's table a key change falls in.
public enum KeyChangeKind: String, Sendable, Codable, CaseIterable {
  case same
  case parallel
  case relative
  case close
  case lift
  case mediant
  case stepDown = "step-down"
  case halfStepDown = "half-step-down"
  case tritone
  case distantMode = "distant-mode"
}

public struct KeyChangeRating: Hashable, Sendable {
  public var level: KeyTransitionLevel
  public var kind: KeyChangeKind
  public var reason: String

  public init(level: KeyTransitionLevel, kind: KeyChangeKind, reason: String) {
    self.level = level
    self.kind = kind
    self.reason = reason
  }
}

/// Suggestion text in pieces, so chord and key names can stand out.
public enum AdviceSegment: Hashable, Sendable {
  case text(String)
  case chord(String)

  public var text: String {
    switch self {
    case .text(let value), .chord(let value): value
    }
  }

  public var isChord: Bool {
    if case .chord = self { true } else { false }
  }
}

public struct TransitionSuggestion: Hashable, Sendable, Identifiable {
  /// Unique within one list: "dominant", "common-chord", "common-tone", and so on.
  public var id: String
  public var title: String
  public var segments: [AdviceSegment]

  public init(id: String, title: String, segments: [AdviceSegment]) {
    self.id = id
    self.title = title
    self.segments = segments
  }
}

/// The two songs a transition connects.
public struct TransitionSongs: Hashable, Sendable {
  public var fromTitle: String
  public var toTitle: String
  public var fromKey: SpelledKey
  public var toKey: SpelledKey

  public init(fromTitle: String, toTitle: String, fromKey: SpelledKey, toKey: SpelledKey) {
    self.fromTitle = fromTitle
    self.toTitle = toTitle
    self.fromKey = fromKey
    self.toKey = toKey
  }
}

/// Semitones a key may move to smooth a change without leaving the leader's range.
public let maxAlternateSemitones = 2

private let thirdNames: [Int: String] = [
  3: "Up a minor third",
  4: "Up a major third",
  8: "Down a major third",
  9: "Down a minor third",
]
private let wholeStepDown = 10
private let halfStepDown = 11
private let liftLimit = 2
private let distant = 3
private let octave = 12
private let fifthDegree = 4
/// The most suggestions one warning shows.
private let maxSuggestions = 4

private func rateSameMode(_ from: SpelledKey, _ to: SpelledKey, up: Int) -> KeyChangeRating {
  if up <= liftLimit {
    return KeyChangeRating(
      level: .smooth, kind: .lift, reason: "Lift up a \(up == 1 ? "half" : "whole") step")
  }
  if let third = thirdNames[up] {
    let shared = KeyTheory.commonTones(from: from, to: to).first
    return KeyChangeRating(
      level: .worthALook, kind: .mediant,
      reason: shared.map { "\(third): shares only \(KeyTheory.noteName($0))" } ?? third)
  }
  if up == wholeStepDown {
    return KeyChangeRating(level: .worthALook, kind: .stepDown, reason: "Down a whole step")
  }
  if up == halfStepDown {
    return KeyChangeRating(
      level: .rough, kind: .halfStepDown, reason: "Down a half step: sounds flat without a setup")
  }
  return KeyChangeRating(level: .rough, kind: .tritone, reason: "Tritone apart: no shared notes")
}

/// How a change straight from one key into another is likely to feel (rows 1 to 11).
public func rateKeyChange(from: SpelledKey, to: SpelledKey) -> KeyChangeRating {
  let up = KeyTheory.semitonesUp(from: from, to: to)
  let distance = KeyTheory.circleOfFifthsDistance(from, to)
  if up == 0 {
    return from.minor == to.minor
      ? KeyChangeRating(level: .smooth, kind: .same, reason: "Same key")
      : KeyChangeRating(
        level: .smooth, kind: .parallel,
        reason: "Parallel key: same tonic, \(to.minor ? "darker" : "brighter")")
  }
  if distance == 0 {
    return KeyChangeRating(
      level: .smooth, kind: .relative, reason: "Relative key: same key signature")
  }
  if distance == 1 {
    return KeyChangeRating(level: .smooth, kind: .close, reason: "Closely related key")
  }
  if from.minor == to.minor {
    return rateSameMode(from, to, up: up)
  }
  let effective = min(distance, KeyTheory.circleOfFifthsDistance(from, KeyTheory.parallel(to)) + 1)
  return KeyChangeRating(
    level: effective >= distant ? .rough : .worthALook, kind: .distantMode,
    reason: "Distant key with a mode change")
}

/// A suggestion's advice as one line for a plan item's notes: "End … on Gm, then C7 …".
public func suggestionNote(_ suggestion: TransitionSuggestion) -> String {
  suggestion.segments.map(\.text).joined()
}

/// Notes with `line` added on its own line; unchanged when they already have it.
public func appendNote(_ notes: String, line: String) -> String {
  if MusicText.contains(notes, line) {
    return notes
  }
  return MusicText.trim(notes).isEmpty ? line : "\(MusicText.trimEnd(notes))\n\(line)"
}

/// "B7" without its seventh: `replace(/7$/u, "")`.
private func droppingSeventh(_ name: String) -> String {
  name.unicodeScalars.last == "7" ? String(name.unicodeScalars.dropLast()) : name
}

private func keyName(_ key: SpelledKey) -> String {
  KeyTheory.name(key)
}

private func chordName(_ chord: Chord) -> String {
  KeyTheory.chordName(chord)
}

private func dominantSuggestion(_ songs: TransitionSongs, cold: Bool) -> TransitionSuggestion {
  let dominant = chordName(KeyTheory.dominantSeventh(of: songs.toKey))
  if !cold, KeyTheory.dominantIsIn(from: songs.fromKey, to: songs.toKey) {
    let dominantTriad = droppingSeventh(dominant)
    let endsHome = MusicText.equals(dominantTriad.unicodeScalars, keyName(songs.fromKey))
    return TransitionSuggestion(
      id: "dominant", title: "End on the chord that leads in",
      segments: [
        .text("End \(songs.fromTitle) on "),
        .chord(dominantTriad),
        .text(
          endsHome
            ? ", make it " : " (already a chord in \(keyName(songs.fromKey))), make it "),
        .chord(dominant),
        .text(", then start \(songs.toTitle) in "),
        .chord(keyName(songs.toKey)),
        .text("."),
      ])
  }
  return TransitionSuggestion(
    id: "dominant", title: cold ? "Stop, then set it up" : "Set up the new key",
    segments: [
      .text(
        cold ? "Stop fully after \(songs.fromTitle), then play " : "After \(songs.fromTitle), play "
      ),
      .chord(dominant),
      .text(" into \(songs.toTitle) in "),
      .chord(keyName(songs.toKey)),
      .text("."),
    ])
}

/// A chord both keys share: the next song's home chord or V, or a chord that sets it up.
private func commonChordSuggestion(_ songs: TransitionSongs) -> TransitionSuggestion? {
  let fromKey = songs.fromKey
  let toKey = songs.toKey
  if KeyTheory.homeChordIsIn(from: fromKey, to: toKey) {
    return TransitionSuggestion(
      id: "common-chord", title: "End on the next song's home chord",
      segments: [
        .text("End \(songs.fromTitle) on "),
        .chord(keyName(toKey)),
        .text(
          " (it's already a chord in \(keyName(fromKey))), then start \(songs.toTitle) right there."
        ),
      ])
  }
  if KeyTheory.dominantIsIn(from: fromKey, to: toKey) {
    return dominantSuggestion(songs, cold: false)
  }
  let pivots = KeyTheory.pivotChords(from: fromKey, to: toKey)
  guard let shared = pivots.first(where: { !$0.borrowed })?.chord else {
    return nil
  }
  return TransitionSuggestion(
    id: "common-chord", title: "End on a chord both keys share",
    segments: [
      .text("End \(songs.fromTitle) on "),
      .chord(chordName(shared)),
      .text(" (it's the \(shared.numeral) of \(keyName(toKey))), then "),
      .chord(chordName(KeyTheory.dominantSeventh(of: toKey))),
      .text(" into \(songs.toTitle)."),
    ])
}

private func isHome(_ chord: Chord) -> Bool {
  chord.numeral == "I" || chord.numeral == "i"
}

/// The chord that follows an opening chord into the new key: plain V after IV
/// (IV-V-I), V7 otherwise.
private func leadInto(_ opening: CommonToneChord, _ toKey: SpelledKey) -> String {
  let dominant = chordName(KeyTheory.dominantSeventh(of: toKey))
  return opening.to.numeral == "IV" ? droppingSeventh(dominant) : dominant
}

private func commonToneSuggestion(
  _ songs: TransitionSongs, _ shared: CommonToneChord, first: Bool
) -> TransitionSuggestion {
  let ending: [AdviceSegment] =
    isHome(shared.from)
    ? [.text("End \(songs.fromTitle) on "), .chord(chordName(shared.from))]
    : [
      .text("End \(songs.fromTitle) on "),
      .chord(chordName(shared.from)),
      .text(" (its \(shared.from.numeral)) instead of "),
      .chord(keyName(songs.fromKey)),
    ]
  let opening: [AdviceSegment] =
    isHome(shared.to)
    ? [
      .text("\(songs.toTitle)'s opening "),
      .chord(chordName(shared.to)),
      .text(" chord."),
    ]
    : [
      .chord(chordName(shared.to)),
      .text(": open \(songs.toTitle) on "),
      .chord(chordName(shared.to)),
      .text(" (its \(shared.to.numeral)), then "),
      .chord(leadInto(shared, songs.toKey)),
      .text(" to land in "),
      .chord(keyName(songs.toKey)),
      .text("."),
    ]
  let heldName = KeyTheory.noteName(shared.fromTone)
  let newName = KeyTheory.noteName(shared.tone)
  let fromRole = shared.fromRole.rawValue
  let toRole = shared.toRole.rawValue
  let becomes =
    MusicText.equals(heldName.unicodeScalars, newName)
    ? " (its \(fromRole)). It becomes the \(toRole) of "
    : " (its \(fromRole)). As \(newName), it becomes the \(toRole) of "
  return TransitionSuggestion(
    id: first ? "common-tone" : "common-tone-alternate",
    title: first ? "Hold a note across" : "Or hold it into \(chordName(shared.to))",
    segments: ending + [.text(", but hold the "), .chord(heldName), .text(becomes)] + opening)
}

/// A held note: end on a chord but keep one of its notes ringing, and let it
/// become part of the next song's first chord. When the home chords share
/// nothing, the first song can end on a nearby chord instead, or the next can
/// open on a different one. When the next song must open on another chord,
/// offers two, root-held first.
private func commonToneSuggestions(_ songs: TransitionSongs) -> [TransitionSuggestion] {
  let shared = KeyTheory.commonToneChords(from: songs.fromKey, to: songs.toKey)
  guard let best = shared.first else { return [] }
  // Another opening only competes when neither is the new home chord and both
  // hold a note from the same ending (from F into E: open on A or on F#m).
  let alternate =
    isHome(best.to)
    ? nil
    : shared.dropFirst().first { candidate in
      !isHome(candidate.to)
        && MusicText.equals(
          chordName(candidate.from).unicodeScalars, chordName(best.from))
        && !MusicText.equals(chordName(candidate.to).unicodeScalars, chordName(best.to))
    }
  guard let alternate else { return [commonToneSuggestion(songs, best, first: true)] }
  return [
    commonToneSuggestion(songs, best, first: true),
    commonToneSuggestion(songs, alternate, first: false),
  ]
}

/// A chord borrowed from the old key's parallel minor, when nothing is truly shared.
private func borrowedChordSuggestion(_ songs: TransitionSongs) -> TransitionSuggestion? {
  guard
    let borrowed = KeyTheory.pivotChords(from: songs.fromKey, to: songs.toKey)
      .first(where: \.borrowed)?.chord
  else {
    return nil
  }
  let parallelName = keyName(KeyTheory.parallel(songs.fromKey))
  return TransitionSuggestion(
    id: "borrowed-chord", title: "Borrow a chord",
    segments: [
      .text("End \(songs.fromTitle) on "),
      .chord(chordName(borrowed)),
      .text(
        " (borrowed from \(parallelName); the \(borrowed.numeral) of \(keyName(songs.toKey))), then "
      ),
      .chord(chordName(KeyTheory.dominantSeventh(of: songs.toKey))),
      .text(" into \(songs.toTitle)."),
    ])
}

private func padSuggestion(_ songs: TransitionSongs) -> TransitionSuggestion {
  TransitionSuggestion(
    id: "pad", title: "Reset under a prayer",
    segments: [
      .text("Put a short prayer or reading before \(songs.toTitle), with a pad moving to "),
      .chord(keyName(songs.toKey)),
      .text("."),
    ])
}

private func swapSuggestion(_ songs: TransitionSongs) -> TransitionSuggestion {
  TransitionSuggestion(
    id: "swap", title: "Swap them",
    segments: [
      .text(
        "Sing \(songs.toTitle) before \(songs.fromTitle), so the same change becomes a lift up.")
    ])
}

/// A whole-step lift through the chord both keys hang on: the old key's V is
/// the new key's IV, so Bb into C walks F, G, C (IV-V-I).
private func walkUpSuggestion(_ songs: TransitionSongs) -> TransitionSuggestion? {
  let fifth = KeyTheory.scale(songs.fromKey)[fifthDegree]
  guard
    let four = KeyTheory.diatonicTriads(songs.toKey).first(where: { candidate in
      candidate.numeral == "IV" && candidate.quality == .major
        && candidate.root.pitch == fifth.pitch
    })
  else {
    return nil
  }
  return TransitionSuggestion(
    id: "walk-up", title: "Walk up",
    segments: [
      .text("End \(songs.fromTitle) on "),
      .chord(keyName(songs.fromKey)),
      .text(", play "),
      .chord(chordName(four)),
      .text(
        " (the V of \(keyName(songs.fromKey)) and the IV of \(keyName(songs.toKey))), then "),
      .chord(droppingSeventh(chordName(KeyTheory.dominantSeventh(of: songs.toKey)))),
      .text(" into \(songs.toTitle) in "),
      .chord(keyName(songs.toKey)),
      .text("."),
    ])
}

/// The new key's ii-V as a short turnaround (Kauflin): Bb, Dm, G7, C.
private func turnaroundSuggestion(_ songs: TransitionSongs) -> TransitionSuggestion {
  TransitionSuggestion(
    id: "turnaround", title: "Turn it around",
    segments: [
      .text("End \(songs.fromTitle) on "),
      .chord(keyName(songs.fromKey)),
      .text(", play "),
      .chord(chordName(KeyTheory.predominant(of: songs.toKey))),
      .text(" then "),
      .chord(chordName(KeyTheory.dominantSeventh(of: songs.toKey))),
      .text(" into \(songs.toTitle) in "),
      .chord(keyName(songs.toKey)),
      .text("."),
    ])
}

/// A lift works cold: the jump up is the point (the truck driver's gear change).
private func jumpSuggestion(_ songs: TransitionSongs) -> TransitionSuggestion {
  TransitionSuggestion(
    id: "jump", title: "Or just go up",
    segments: [
      .text("End \(songs.fromTitle) cleanly and start \(songs.toTitle) in "),
      .chord(keyName(songs.toKey)),
      .text(" on the downbeat. A step up sounds intentional on its own."),
    ])
}

/// The same key needs nothing, but a turnaround gives the band a clean restart.
private func sameKeySuggestion(_ songs: TransitionSongs) -> TransitionSuggestion {
  TransitionSuggestion(
    id: "same-key", title: "Keep it going",
    segments: [
      .text("Stay in "),
      .chord(keyName(songs.toKey)),
      .text(" and go straight from \(songs.fromTitle) into \(songs.toTitle), or play "),
      .chord(chordName(KeyTheory.dominantSeventh(of: songs.toKey))),
      .text(" to lead back to the top."),
    ])
}

/// Suggestions for each case, most useful first
/// (docs/research/song-key-transitions.md). Smooth changes get optional ideas
/// (a shared chord, a walk up into a lift, row 5); rough ones get fixes, with a
/// held note wherever one connects the songs: first for thirds, where the keys
/// share a note, for half steps down, and for tritones, where it's the only
/// musical bridge.
private func suggestions(for kind: KeyChangeKind, _ songs: TransitionSongs)
  -> [TransitionSuggestion?]
{
  switch kind {
  case .same:
    return [sameKeySuggestion(songs)]
  case .parallel:
    return commonToneSuggestions(songs) + [
      commonChordSuggestion(songs), dominantSuggestion(songs, cold: false),
    ]
  case .relative, .close:
    return [commonChordSuggestion(songs)] + commonToneSuggestions(songs) + [
      dominantSuggestion(songs, cold: false)
    ]
  case .lift:
    return [walkUpSuggestion(songs), turnaroundSuggestion(songs), jumpSuggestion(songs)]
  case .mediant:
    return commonToneSuggestions(songs) + [
      commonChordSuggestion(songs), borrowedChordSuggestion(songs),
      dominantSuggestion(songs, cold: false), padSuggestion(songs),
    ]
  case .stepDown:
    return [commonChordSuggestion(songs)] + commonToneSuggestions(songs) + [
      swapSuggestion(songs), dominantSuggestion(songs, cold: false),
    ]
  case .halfStepDown:
    return commonToneSuggestions(songs) + [
      swapSuggestion(songs), padSuggestion(songs), dominantSuggestion(songs, cold: true),
    ]
  case .tritone:
    return commonToneSuggestions(songs) + [
      padSuggestion(songs), dominantSuggestion(songs, cold: true),
    ]
  case .distantMode:
    return [commonChordSuggestion(songs), borrowedChordSuggestion(songs)]
      + commonToneSuggestions(songs) + [
        dominantSuggestion(songs, cold: false), padSuggestion(songs),
      ]
  }
}

/// Concrete ways to connect two songs, most useful first, for the case the
/// rating found. Moving the next song to another key on its arrangement is
/// offered separately (`rankAlternateKeys`), because it needs that
/// arrangement's keys.
public func transitionSuggestions(_ songs: TransitionSongs, kind: KeyChangeKind)
  -> [TransitionSuggestion]
{
  var seen = Set<String>()
  var found: [TransitionSuggestion] = []
  // Ending on the new key's V can come from two builders; keep the first.
  for suggestion in suggestions(for: kind, songs).compactMap(\.self)
  where seen.insert(suggestion.id).inserted {
    found.append(suggestion)
  }
  return Array(found.prefix(maxSuggestions))
}

/// Other keys for the next song that come in smoothly and sit within a whole
/// step of the planned key, smallest move first, then the lower one (research,
/// section 4). Each candidate is a key and the value to return for it, such as
/// an arrangement key's id.
public func rankAlternateKeys<Value>(
  _ songs: (from: SpelledKey, to: SpelledKey), candidates: [(key: SpelledKey, value: Value)]
) -> [Value] {
  var ranked: [(value: Value, shift: Int)] = []
  for candidate in candidates {
    let up = KeyTheory.semitonesUp(from: songs.to, to: candidate.key)
    let shift = up > octave / 2 ? up - octave : up
    if shift != 0, abs(shift) <= maxAlternateSemitones,
      rateKeyChange(from: songs.from, to: candidate.key).level == .smooth
    {
      ranked.append((candidate.value, shift))
    }
  }
  // `abs(shift) * 2 + (shift < 0 ? 0 : 1)` orders by size, then lower first,
  // as the TypeScript comparator does for shifts of -2 through 2.
  return KeyTheory.stableSorted(ranked) { abs($0.shift) * 2 + ($0.shift < 0 ? 0 : 1) }
    .map(\.value)
}

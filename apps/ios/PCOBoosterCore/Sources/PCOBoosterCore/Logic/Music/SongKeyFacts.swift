// Port of the primitive-typed song facts in apps/web/src/lib/song-library.ts
// (`describeKeyChange`, `tempoLabel`), pinned by the `music.songLibrary.*`
// parity suites (scripts/parity/music.parity.ts). The functions there that take
// plan items, song history, or arrangements build on these.

private let intervalNames = [
  "",
  "a half step",
  "a whole step",
  "a minor 3rd",
  "a major 3rd",
  "a 4th",
  "a tritone",
]
private let relativeMinorSemitones = 9
private let relativeMajorSemitones = 3
private let octaveSemitones = 12

/// How one key sits against another, in plain terms: "same key", "up a whole
/// step", "down a 4th", "relative minor". Describes the change without judging
/// it; `nil` when either key can't be read.
public func describeKeyChange(from: String, to: String) -> String? {
  guard let fromKey = KeyTheory.parse(from), let toKey = KeyTheory.parse(to) else {
    return nil
  }
  let up = KeyTheory.semitonesUp(from: fromKey, to: toKey)
  if fromKey.minor != toKey.minor {
    if up == 0 {
      return toKey.minor ? "parallel minor" : "parallel major"
    }
    if !fromKey.minor, up == relativeMinorSemitones {
      return "relative minor"
    }
    if fromKey.minor, up == relativeMajorSemitones {
      return "relative major"
    }
  }
  if up == 0 {
    return "same key"
  }
  let tritone = intervalNames.count - 1
  var change = "a tritone away"
  if up < tritone {
    change = "up \(intervalNames[up])"
  } else if up > tritone {
    change = "down \(intervalNames[octaveSemitones - up])"
  }
  if fromKey.minor == toKey.minor {
    return change
  }
  return "\(change), to \(toKey.minor ? "minor" : "major")"
}

/// "78 bpm · 6/8" from an arrangement's tempo and time signature, or "" when it
/// sets neither. An empty meter still counts, as it does on the web.
public func tempoLabel(bpm: Double?, meter: String?) -> String {
  [bpm.map { "\(MusicText.numberString($0)) bpm" }, meter]
    .compactMap(\.self)
    .joined(separator: " \u{B7} ")
}

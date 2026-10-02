// Port of apps/web/src/lib/format/position-icon.ts. Pinned by the `text.positionIcon` parity
// suite.
//
// The TypeScript tests each label against `/\bword\b/u` patterns. Every pattern is a set of
// literal words (`livestreams?` is "livestream" or "livestreams"), matched here by hand with
// the same ASCII word boundaries (`\b` around [A-Za-z0-9_]) and the same code-point view of
// the text. `Regex` isn't `Sendable`, so it can't sit in a shared table.

/// An icon for a team position, named as on the web. Map each to an SF Symbol in the app.
public enum PositionIconId: String, CaseIterable, Codable, Sendable {
  case camera
  case cameraVideo = "camera-video"
  case drum
  case guitar
  case piano
  case livestream
  case micVocal = "mic-vocal"
  case sound
  case music
  case musicNote = "music-note"
}

/// The icon for a position from its name and team name: specific roles (livestream, camera,
/// lyrics, sound, video) by the position, then instruments and voices by position or team,
/// then the team's category; "music-note" when nothing matches.
public func resolvePositionIconId(positionName: String, teamName: String) -> PositionIconId {
  let position = PositionIconMatching.normalize(positionName)
  let team = PositionIconMatching.normalize(teamName)
  let combined = PositionIconMatching.normalize("\(positionName) \(teamName)")
  let roleContexts = PositionIconMatching.unique([position, combined].filter { !$0.isEmpty })
  let teamContexts = team.isEmpty ? [] : [team]
  let allContexts = PositionIconMatching.unique(roleContexts + teamContexts)

  for rule in PositionIconMatching.rules {
    let contexts =
      switch rule.contexts {
      case .role: roleContexts
      case .team: teamContexts
      case .all: allContexts
      }
    let texts = contexts.map { Array($0.unicodeScalars) }
    if rule.patterns.contains(where: { pattern in texts.contains { pattern.matches($0) } }) {
      return rule.icon
    }
  }
  return .musicNote
}

private enum PositionIconMatching {
  enum Contexts {
    /// The position name, and the position and team names together.
    case role
    /// The team name alone.
    case team
    /// Both of the above.
    case all
  }

  enum Pattern {
    /// Any of these, with a word boundary on each side.
    case words([String])
    /// `\bfirst\b.*\bsecond\b`.
    case inOrder(String, String)

    func matches(_ text: [Unicode.Scalar]) -> Bool {
      switch self {
      case .words(let words):
        words.contains { !boundedMatches(of: $0, in: text).isEmpty }
      case .inOrder(let first, let second):
        boundedMatches(of: first, in: text).contains { firstStart in
          boundedMatches(of: second, in: text).contains {
            $0 >= firstStart + first.unicodeScalars.count
          }
        }
      }
    }
  }

  struct Rule {
    let contexts: Contexts
    let patterns: [Pattern]
    let icon: PositionIconId
  }

  /// The TypeScript's checks, in order; the first match wins.
  static let rules: [Rule] = [
    Rule(
      contexts: .role,
      patterns: [.words(["livestream", "livestreams", "streaming", "broadcast", "broadcasting"])],
      icon: .livestream),
    Rule(
      contexts: .role, patterns: [.words(["photograph", "photographs", "photo", "photos"])],
      icon: .camera),
    Rule(
      contexts: .role,
      // `\bcam\s*[12]\b` after whitespace runs collapse to one space.
      patterns: [.words(["camera", "cameras", "cam1", "cam2", "cam 1", "cam 2", "cam"])],
      icon: .camera),
    Rule(
      contexts: .role,
      patterns: [
        .words([
          "lyric", "lyrics", "proclaim", "propresenter", "presentation", "presentations", "slide",
          "slides",
        ])
      ],
      icon: .musicNote),
    Rule(
      contexts: .role,
      patterns: [
        .words([
          "sound", "sounds", "foh", "audio engineer", "audio engineers", "monitor", "monitors",
          "a1", "a2",
        ])
      ],
      icon: .sound),
    Rule(
      contexts: .role,
      patterns: [.words(["video", "videos", "switcher", "switchers", "director", "directors"])],
      icon: .cameraVideo),
    Rule(
      contexts: .all,
      patterns: [
        .words([
          "guitar", "guitars", "bass", "ukulele", "ukuleles", "banjo", "banjos", "mandolin",
          "mandolins", "electric", "acoustic",
        ])
      ],
      icon: .guitar),
    Rule(
      contexts: .all,
      patterns: [
        .words([
          "drum", "drums", "percussion", "percussions", "cajon", "cajons", "caj\u{F3}n",
          "caj\u{F3}ns",
        ])
      ],
      icon: .drum),
    Rule(
      contexts: .all,
      patterns: [
        .words([
          "key", "keys", "keyboard", "keyboards", "piano", "pianos", "organ", "organs", "pad",
          "pads", "synth", "synths",
        ])
      ],
      icon: .piano),
    Rule(
      contexts: .all,
      patterns: [
        .words([
          "vocal", "vocals", "singer", "singers", "alto", "soprano", "tenor", "baritone",
          "worship leader", "worship leaders", "choir", "choirs", "microphone", "microphones",
          "mic", "mics", "lead", "leads",
        ])
      ],
      icon: .micVocal),
    Rule(
      contexts: .team,
      patterns: [.words(["vocal", "vocals", "choir", "choirs", "singer", "singers"])],
      icon: .micVocal),
    Rule(
      contexts: .team,
      patterns: [.words(["band", "bands", "music", "orchestra", "orchestras"])],
      icon: .music),
    Rule(
      contexts: .team,
      patterns: [
        .words(["a/v", "av"]),
        .inOrder("audio", "visual"),
        .words(["visual", "visuals", "media", "production", "tech"]),
      ],
      icon: .camera),
  ]

  /// `value.trim().toLowerCase().replaceAll(/\s+/gu, " ")`.
  static func normalize(_ value: String) -> String {
    JSParity.words(JSParity.trim(value).lowercased()).joined(separator: " ")
  }

  /// `[...new Set(values)]`: first occurrences, in order.
  static func unique(_ values: [String]) -> [String] {
    var seen = Set<String>()
    return values.filter { seen.insert($0).inserted }
  }

  /// `\w` in a JavaScript regular expression without the `i` flag: [A-Za-z0-9_].
  static func isWordScalar(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar {
    case "a"..."z", "A"..."Z", "0"..."9", "_": true
    default: false
    }
  }

  /// Start offsets where `word` appears in `text` with a word boundary on each side. Every
  /// word in the rules starts and ends with a word character, so a boundary means the
  /// neighbor is not one.
  static func boundedMatches(of word: String, in text: [Unicode.Scalar]) -> [Int] {
    let needle = Array(word.unicodeScalars)
    guard !needle.isEmpty, needle.count <= text.count else {
      return []
    }
    return (0...(text.count - needle.count)).filter { start in
      let end = start + needle.count
      return (start == 0 || !isWordScalar(text[start - 1]))
        && (end == text.count || !isWordScalar(text[end]))
        && text[start..<end].elementsEqual(needle)
    }
  }
}

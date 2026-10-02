import SwiftUI

/// A song's musical key as a quiet outlined chip ("G", "B♭", "F♯m"), like the web's key picker
/// trigger. Accidentals typed as `b` and `#` render as true flat and sharp signs, and VoiceOver
/// reads "B flat", "F sharp minor". A missing key shows "No key" in pending amber.
///
/// Facts only: never color a key by how well it fits (inform, don't recommend).
/// `KeyBadge("Bb")`, `KeyBadge(nil)`, `KeyBadge(from: "G", to: "A")`.
struct KeyBadge: View {
  private let keys: [String]

  /// A single key, or `nil` for "No key".
  init(_ key: String?) {
    keys = key.map { [$0] } ?? []
  }

  /// A key change between two songs, shown as "G → A".
  init(from: String, to: String) {
    keys = [from, to]
  }

  var body: some View {
    Group {
      if keys.isEmpty {
        Text("No key").foregroundStyle(.statusPendingText)
      } else {
        HStack(spacing: Spacing.xs) {
          ForEach(Array(keys.enumerated()), id: \.offset) { index, key in
            if index > 0 {
              Image(systemName: "arrow.right")
                .imageScale(.small)
                .foregroundStyle(.inkTertiary)
                .accessibilityHidden(true)
            }
            Text(verbatim: Self.display(key)).foregroundStyle(.ink)
          }
        }
      }
    }
    .font(.badgeLabel)
    .lineLimit(1)
    .padding(.horizontal, Spacing.sm)
    .frame(minWidth: 28, minHeight: 22)
    .hairlineBorder(.capsule)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(accessibilityLabel)
  }

  private var accessibilityLabel: Text {
    switch keys.count {
    case 0: Text("No key")
    case 1: Text("Key \(Self.spoken(keys[0]))")
    default: Text("Key change from \(Self.spoken(keys[0])) to \(Self.spoken(keys[1]))")
    }
  }

  /// "Bb" to "B♭", "F#m" to "F♯m". Only the accidental right after the note letter changes.
  nonisolated static func display(_ key: String) -> String {
    guard let parsed = parse(key) else { return key }
    let accidental = switch parsed.accidental {
    case "b": "\u{266D}"
    case "#": "\u{266F}"
    default: ""
    }
    return "\(parsed.letter)\(accidental)\(parsed.rest)"
  }

  /// "Bb" to "B flat", "F#m" to "F sharp minor".
  nonisolated static func spoken(_ key: String) -> String {
    guard let parsed = parse(key) else { return key }
    var words = [String(parsed.letter)]
    switch parsed.accidental {
    case "b": words.append("flat")
    case "#": words.append("sharp")
    default: break
    }
    let rest = parsed.rest.lowercased()
    if rest == "m" || rest.hasPrefix("min") {
      words.append("minor")
    } else if !parsed.rest.isEmpty {
      words.append(String(parsed.rest))
    }
    return words.joined(separator: " ")
  }

  private nonisolated static func parse(_ key: String) -> (letter: Character, accidental: Character?, rest: Substring)? {
    let trimmed = key.trimmingCharacters(in: .whitespaces)
    guard let letter = trimmed.first, "ABCDEFG".contains(letter) else { return nil }
    let afterLetter = trimmed.dropFirst()
    if let next = afterLetter.first, next == "b" || next == "#" {
      return (letter, next, afterLetter.dropFirst())
    }
    return (letter, nil, afterLetter)
  }
}

#Preview("Key badges") {
  HStack(spacing: Spacing.sm) {
    KeyBadge("G")
    KeyBadge("Bb")
    KeyBadge("F#m")
    KeyBadge(from: "G", to: "A")
    KeyBadge(nil)
  }
  .padding(Spacing.lg)
  .background(.surfaceCanvas)
}

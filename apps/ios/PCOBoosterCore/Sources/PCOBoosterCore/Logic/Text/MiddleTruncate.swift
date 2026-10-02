// Port of apps/web/src/lib/middle-truncate.ts. Pinned by the `text.middleTruncate` parity
// suite. Positions are UTF-16 code units and "characters" are grapheme clusters, as in the
// TypeScript (`String.length` and `Intl.Segmenter`).

/// The character `middleTruncate` puts in the gap, U+2026.
public let middleTruncateEllipsis = "\u{2026}"

/// Shortens `text` to fit `maxWidth` by removing its middle, keeping the start and a
/// meaningful ending ("Camera 3 Rig… AM", "Rehearsal f… PM service"). Each ending worth
/// keeping is tried: every run of whole trailing words that fits in half the width, or else
/// the last graphemes of one long word. The result showing the most whole words wins, then
/// the one showing the most characters, then the longer ending. Returns `text` unchanged
/// when it fits or when `maxWidth` is not positive (nothing has been measured yet).
///
/// `measure` returns a string's rendered width in the same unit as `maxWidth`.
public func middleTruncate(
  _ text: String, maxWidth: Double, measure: (String) -> Double
) -> String {
  if maxWidth <= 0 || measure(text) <= maxWidth {
    return text
  }

  var best = (display: "", wholeWords: -1, visible: -1)
  let tails = MiddleTruncation.tailOptions(
    text, maxTailWidth: maxWidth * MiddleTruncation.maxTailShare, measure: measure)
  for tail in tails {
    let suffix = "\(middleTruncateEllipsis)\(tail.joiner)\(tail.text)"
    let fullHead = JSParity.utf16Prefix(text, text.utf16.count - tail.text.utf16.count)
    let kept = MiddleTruncation.fitHead(
      MiddleTruncation.graphemes(fullHead), suffix: suffix, maxWidth: maxWidth, measure: measure)
    let tailWords = tail.joiner.isEmpty ? 0 : JSParity.split(tail.text, separator: " ").count
    let wholeWords = MiddleTruncation.countWholeWords(kept, fullHead: fullHead) + tailWords
    let visible = (kept + tail.text).count
    if wholeWords > best.wholeWords || (wholeWords == best.wholeWords && visible >= best.visible) {
      best = (kept.isEmpty ? JSParity.trim(suffix) : kept + suffix, wholeWords, visible)
    }
  }
  return best.display
}

private enum MiddleTruncation {
  /// The longest share of the width an ending may take.
  static let maxTailShare = 0.5

  static func graphemes(_ text: String) -> [String] {
    text.map(String.init)
  }

  /// Endings worth keeping, shortest first: each run of whole trailing words that fits in
  /// `maxTailWidth`, or the last graphemes of a single long word.
  static func tailOptions(
    _ text: String, maxTailWidth: Double, measure: (String) -> Double
  ) -> [(text: String, joiner: String)] {
    let words = JSParity.split(text, separator: " ")
    var options: [(text: String, joiner: String)] = []
    var index = words.count - 1
    while index > 0 {
      let candidate = words[index...].joined(separator: " ")
      if measure(candidate) > maxTailWidth {
        break
      }
      options.append((candidate, " "))
      index -= 1
    }
    if !options.isEmpty {
      return options
    }

    let characters = graphemes(text)
    var low = 0
    var high = characters.count / 2
    while low < high {
      let middle = (low + high + 1) / 2
      if measure(characters.suffix(middle).joined()) <= maxTailWidth {
        low = middle
      } else {
        high = middle - 1
      }
    }
    return [(low == 0 ? "" : characters.suffix(low).joined(), "")]
  }

  /// The longest start of `head` that fits beside `suffix`, without trailing whitespace.
  static func fitHead(
    _ head: [String], suffix: String, maxWidth: Double, measure: (String) -> Double
  ) -> String {
    var low = 0
    var high = head.count
    while low < high {
      let middle = (low + high + 1) / 2
      if measure(JSParity.trimEnd(head[..<middle].joined()) + suffix) <= maxWidth {
        low = middle
      } else {
        high = middle - 1
      }
    }
    return JSParity.trimEnd(head[..<low].joined())
  }

  /// Words of `kept` shown whole: the last one counts only when `kept` ends where it does in
  /// `fullHead`.
  static func countWholeWords(_ kept: String, fullHead: String) -> Int {
    if kept.isEmpty {
      return 0
    }
    let words = JSParity.split(kept, separator: " ").count
    let keptLength = kept.utf16.count
    let head = Array(fullHead.utf16)
    let endsOnBoundary =
      keptLength == head.count || (keptLength < head.count && head[keptLength] == 0x20)
    return endsOnBoundary ? words : words - 1
  }
}

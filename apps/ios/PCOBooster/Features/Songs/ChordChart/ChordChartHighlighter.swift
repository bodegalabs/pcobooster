import PCOBoosterCore
import UIKit

/// Colors a chart in the editor from `ChordChart.highlight` tokens, without changing a character
/// (the web's `highlightChordChart`): Services code lines in chart 4, `{ note }` lines muted,
/// section headings in the pending amber (semibold), and chords, whether on their own line or
/// inline in brackets, in info blue. Colors are the asset catalog tokens, so dark mode and
/// Increase Contrast follow automatically.
@MainActor
enum ChordChartHighlighter {
  /// The editor's text size before Dynamic Type (the web uses 16 px on phones).
  static let baseSize: CGFloat = 16

  static func font(weight: UIFont.Weight = .regular, traits: UITraitCollection) -> UIFont {
    UIFontMetrics(forTextStyle: .body).scaledFont(
      for: .monospacedSystemFont(ofSize: baseSize, weight: weight), compatibleWith: traits)
  }

  static func baseAttributes(traits: UITraitCollection) -> [NSAttributedString.Key: Any] {
    let paragraph = NSMutableParagraphStyle()
    paragraph.lineSpacing = 3
    return [
      .font: font(traits: traits),
      .foregroundColor: color("Ink"),
      .paragraphStyle: paragraph,
    ]
  }

  /// Re-colors every character of `storage` for the chart it holds.
  static func apply(to storage: NSTextStorage, traits: UITraitCollection) {
    let length = storage.length
    let base = baseAttributes(traits: traits)
    let tokens = ChordChart.highlight(storage.string)
    storage.beginEditing()
    storage.setAttributes(base, range: NSRange(location: 0, length: length))
    for token in tokens where token.kind != .lyric {
      let start = min(max(token.start, 0), length)
      let end = min(max(token.end, start), length)
      guard end > start else { continue }
      storage.addAttributes(attributes(for: token.kind, traits: traits), range: NSRange(location: start, length: end - start))
    }
    storage.endEditing()
  }

  private static func attributes(
    for kind: ChordChartHighlightToken.Kind, traits: UITraitCollection
  ) -> [NSAttributedString.Key: Any] {
    switch kind {
    case .code:
      [.foregroundColor: color("Chart4")]
    case .note:
      [.foregroundColor: color("InkSecondary")]
    case .sectionHeading:
      [.foregroundColor: color("StatusPendingText"), .font: font(weight: .semibold, traits: traits)]
    case .chordLine, .inlineChord:
      [.foregroundColor: color("StatusInfoText")]
    case .lyric:
      [:]
    }
  }

  /// A color token from `Assets.xcassets/Colors`, dynamic for light, dark, and contrast.
  static func color(_ token: String) -> UIColor {
    UIColor(named: "Colors/\(token)", in: .main, compatibleWith: nil) ?? .label
  }
}

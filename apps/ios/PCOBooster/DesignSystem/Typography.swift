import SwiftUI

/// The type scale. SF Pro and SF Mono with Dynamic Type, mapped from the web hierarchy
/// (Inter: page titles 20 to 24 semibold, card titles 16 medium, rows 14 medium, meta 12, mono 13).
/// Each style is a text style, so everything scales with the user's text size.
extension Font {
  /// Sign-in and empty-state headlines (web `text-xl` to `text-2xl` semibold, tracking tight).
  nonisolated static let heroTitle = Font.title.weight(.semibold)
  /// Inline page titles when a navigation title is not used (web page titles).
  nonisolated static let pageTitle = Font.title2.weight(.semibold)
  /// Card and sheet section titles (web `CardTitle`, 16 medium).
  nonisolated static let cardTitle = Font.headline
  /// Primary row text: names, song titles, positions.
  nonisolated static let rowTitle = Font.body
  /// Emphasized row text, such as the selected position or a person you are scheduling.
  nonisolated static let rowTitleEmphasized = Font.body.weight(.medium)
  /// Second line of a row and supporting copy.
  nonisolated static let rowDetail = Font.subheadline
  /// Metadata: dates, counts, hints (web `text-xs`).
  nonisolated static let meta = Font.footnote
  /// Quiet section labels, Linear style: sentence case, medium weight, secondary ink.
  nonisolated static let sectionLabel = Font.subheadline.weight(.medium)
  /// Badge and chip labels (web badge, 12 medium).
  nonisolated static let badgeLabel = Font.caption.weight(.medium)
  /// Small caps labels such as "DECLINED" and date-tile months (web `text-xs uppercase tracking-wide`).
  nonisolated static let capsLabel = Font.caption2.weight(.semibold)
  /// Numbers that line up in columns: scores, counts, times. Tabular digits.
  nonisolated static let numeric = Font.body.monospacedDigit()
  /// Small tabular numbers beside labels.
  nonisolated static let numericMeta = Font.footnote.monospacedDigit()
  /// Chord charts and code-like content (SF Mono replaces the web's Geist Mono).
  nonisolated static let mono = Font.system(.body, design: .monospaced)
  /// Compact mono for previews and inline chords.
  nonisolated static let monoCaption = Font.system(.footnote, design: .monospaced)
}

extension View {
  /// Tabular (monospaced) digits so numbers do not jitter as they change (web `tabular-nums`).
  func tabularNumbers() -> some View {
    monospacedDigit()
  }

  /// Small caps label treatment: uppercase, slightly tracked, semibold caption.
  func capsLabelStyle() -> some View {
    font(.capsLabel).textCase(.uppercase).tracking(0.6)
  }
}

/// A count that keeps tabular digits and rolls its digits when the value changes.
/// `CountText(9)` beside a section label, `CountText(openSlots, style: .numeric)`.
struct CountText: View {
  let value: Int
  var font: Font = .numericMeta

  init(_ value: Int, font: Font = .numericMeta) {
    self.value = value
    self.font = font
  }

  var body: some View {
    Text(value, format: .number)
      .font(font)
      .monospacedDigit()
      .contentTransition(.numericText(value: Double(value)))
      .animation(Motion.reveal, value: value)
  }
}

/// The "PCOBooster" wordmark: bold "PCO" and regular "Booster", as on the web sidebar and sign-in.
/// Product copy elsewhere says pcobooster.com; this is the in-product mark only.
struct Wordmark: View {
  enum Size {
    /// Toolbar and sidebar size (web 16 px).
    case regular
    /// Sign-in hero size (web 24 px, tracking tight).
    case large

    nonisolated var font: Font {
      switch self {
      case .regular: .headline.weight(.regular)
      case .large: .title2.weight(.regular)
      }
    }

    nonisolated var tracking: CGFloat {
      switch self {
      case .regular: -0.2
      case .large: -0.6
      }
    }
  }

  var size: Size = .regular

  /// "PCO" strongly emphasized (bold), "Booster" regular. Not localized: it is the product mark.
  private static let mark: AttributedString = {
    var pco = AttributedString("PCO")
    pco.inlinePresentationIntent = .stronglyEmphasized
    return pco + AttributedString("Booster")
  }()

  var body: some View {
    Text(Self.mark)
      .font(size.font)
      .tracking(size.tracking)
      .foregroundStyle(.ink)
      .lineLimit(1)
      .fixedSize()
      .accessibilityLabel(Text(verbatim: "PCOBooster"))
  }
}

#Preview("Type scale") {
  ScrollView {
    VStack(alignment: .leading, spacing: Spacing.md) {
      Wordmark(size: .large)
      Wordmark()
      Text("Sunday Services").font(.heroTitle)
      Text("Morning gathering").font(.pageTitle)
      Text("Readiness").font(.cardTitle)
      Text("Taylor Lane").font(.rowTitle)
      Text("Acoustic Guitar, 1 of 2").font(.rowDetail).foregroundStyle(.inkSecondary)
      Text("Sun, Sep 20 at 9:00 AM").font(.meta).foregroundStyle(.inkSecondary)
      Text("Declined").capsLabelStyle().foregroundStyle(.statusDeclinedText)
      HStack(spacing: Spacing.xs) {
        Text("Band").font(.sectionLabel).foregroundStyle(.inkSecondary)
        CountText(9).foregroundStyle(.inkTertiary)
      }
      Text("[G]Amazing [C]grace").font(.mono)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(Spacing.lg)
  }
  .background(.surfaceCanvas)
}

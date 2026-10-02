import PCOBoosterCore
import SwiftUI

/// A result title with the part that matches the query in semibold ink, so the eye lands on
/// why the row is here. Case and diacritics are ignored when finding the match.
struct HighlightedText: View {
  let text: String
  let query: String
  var font: Font = .rowTitle
  var color: Color = .ink

  var body: some View {
    Text(attributed)
      .font(font)
      .foregroundStyle(color)
  }

  private var attributed: AttributedString {
    var string = AttributedString(text)
    let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !needle.isEmpty,
      let range = string.range(of: needle, options: [.caseInsensitive, .diacriticInsensitive])
    else {
      return string
    }
    string[range].font = font.weight(.semibold)
    string[range].foregroundColor = .ink
    return string
  }
}

/// The plan date tile from the agenda: the org month over the day number, on a quiet tile.
struct SearchDateTile: View {
  let date: Date
  let timeZone: String
  var isToday = false
  @ScaledMetric(relativeTo: .body) private var size: CGFloat = 44

  var body: some View {
    let tile = formatPlanDateTile(date, timeZone: timeZone)
    VStack(spacing: 0) {
      Text(verbatim: tile.month)
        .font(.capsLabel)
        .textCase(.uppercase)
        .tracking(0.4)
        .foregroundStyle(isToday ? Color.onInkFill.opacity(0.8) : .inkSecondary)
      Text(verbatim: tile.day)
        .font(.headline.monospacedDigit())
        .foregroundStyle(isToday ? Color.onInkFill : .ink)
    }
    .lineLimit(1)
    .minimumScaleFactor(0.7)
    .frame(width: size, height: size)
    .background(
      isToday ? Color.inkFill : Color.surfaceMuted,
      in: .rect(cornerRadius: Radius.medium + 2, style: .continuous)
    )
    .accessibilityHidden(true)
  }
}

/// A square glyph tile for song rows, matching the date tile's footprint.
struct SearchGlyphTile: View {
  let symbol: AppSymbol
  @ScaledMetric(relativeTo: .body) private var size: CGFloat = 44

  var body: some View {
    symbol.image
      .font(.body.weight(.medium))
      .foregroundStyle(.inkSecondary)
      .frame(width: size, height: size)
      .background(.surfaceMuted, in: .rect(cornerRadius: Radius.medium + 2, style: .continuous))
      .accessibilityHidden(true)
  }
}

/// A quiet one-line status inside a section ("Type at least 2 characters.", "No people
/// found."), with an optional action such as Retry.
struct SearchStatusRow<Action: View>: View {
  private let message: Text
  private let action: Action

  init(_ message: LocalizedStringKey, @ViewBuilder action: () -> Action) {
    self.message = Text(message)
    self.action = action()
  }

  init(verbatim message: String, @ViewBuilder action: () -> Action) {
    self.message = Text(verbatim: message)
    self.action = action()
  }

  var body: some View {
    HStack(spacing: Spacing.md) {
      message
        .font(.rowDetail)
        .foregroundStyle(.inkSecondary)
        .frame(maxWidth: .infinity, alignment: .leading)
      action
        .buttonStyle(.pill(.outline, size: .small))
    }
    .padding(.vertical, Spacing.xxs)
    .cardRowBackground()
  }
}

extension SearchStatusRow where Action == EmptyView {
  init(_ message: LocalizedStringKey) {
    self.init(message) { EmptyView() }
  }

  init(verbatim message: String) {
    self.init(verbatim: message) { EmptyView() }
  }
}

/// Placeholder rows while a section's first answer loads.
struct SearchSkeletonRows: View {
  var count = 2
  var showsAvatar = true

  var body: some View {
    ForEach(0..<count, id: \.self) { index in
      SkeletonRow(
        showsAvatar: showsAvatar, titleWidth: [150, 120, 170][index % 3],
        detailWidth: [90, 110, 70][index % 3]
      )
      .cardRowBackground()
    }
  }
}

/// "Show All" in a section header of the All scope: switches to that section's scope.
struct ShowAllButton: View {
  let scope: SearchScope
  let model: SearchModel

  var body: some View {
    Button("Show All") { model.scope = scope }
      .buttonStyle(.borderless)
      .font(.sectionLabel)
      .foregroundStyle(.inkSecondary)
      .accessibilityLabel(Text("Show all \(Text(scope.title))"))
  }
}

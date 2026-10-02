import PCOBoosterCore
import SwiftUI

/// One recent search: a query (searches again) or something opened from Search (opens it
/// again), with the same leading tiles as results so the list reads at a glance.
struct RecentSearchRow: View {
  let item: RecentSearchItem
  @Environment(\.orgTimeZone) private var timeZone

  var body: some View {
    HStack(spacing: Spacing.md) {
      leading
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        Text(verbatim: title)
          .font(.rowTitle)
          .foregroundStyle(.ink)
          .lineLimit(1)
        if let detail {
          Text(verbatim: detail)
            .font(.meta)
            .foregroundStyle(.inkSecondary)
            .lineLimit(1)
        }
      }
      Spacer(minLength: Spacing.sm)
      if case .query = item {
        Image(systemName: "arrow.up.backward")
          .font(.footnote.weight(.medium))
          .foregroundStyle(.inkTertiary)
          .accessibilityHidden(true)
      }
    }
    .padding(.vertical, Spacing.xxs)
    .contentShape(.rect)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: [title, detail].compactMap { $0 }.joined(separator: ", ")))
    .accessibilityHint(hint)
  }

  @ViewBuilder private var leading: some View {
    switch item {
    case .query:
      SearchGlyphTile(symbol: .search)
    case .plan(_, _, _, _, let date):
      SearchDateTile(date: date, timeZone: timeZone)
    case .person(_, let name, let photo):
      PersonAvatar(name: name, photoURL: photo.flatMap(URL.init(string:)), size: .large)
        .frame(width: 44)
    case .song:
      SearchGlyphTile(symbol: .song)
    }
  }

  private var title: String {
    switch item {
    case .query(let text): text
    case .plan(_, _, let title, _, _): title
    case .person(_, let name, _): name
    case .song(_, let title, _): title
    }
  }

  private var detail: String? {
    switch item {
    case .query: nil
    case .plan(_, _, _, let detail, let date):
      [detail, formatPlanDate(date, timeZone: timeZone)].compactMap { $0 }.joined(separator: " \u{B7} ")
    case .person: String(localized: "Person")
    case .song(_, _, let author): author.flatMap { $0.isEmpty ? nil : $0 } ?? String(localized: "Song")
    }
  }

  private var hint: Text {
    if case .query = item { return Text("Searches again") }
    return Text("Opens it")
  }
}

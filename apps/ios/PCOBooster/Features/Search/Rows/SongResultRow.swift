import PCOBoosterCore
import SwiftUI

/// A song in Search: the title, the writers, and when it was last scheduled, as facts only
/// (never a suggestion or a ranking label).
struct SongResultRow: View {
  let song: SongCatalogEntry
  var query = ""
  @Environment(\.appClock) private var clock

  var body: some View {
    HStack(spacing: Spacing.md) {
      SearchGlyphTile(symbol: .song)
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        HighlightedText(text: song.title, query: query, font: .rowTitleEmphasized)
          .lineLimit(1)
        if !song.author.isEmpty {
          HighlightedText(text: song.author, query: query, font: .rowDetail, color: .inkSecondary)
            .lineLimit(1)
        }
      }
      Spacer(minLength: Spacing.sm)
      VStack(alignment: .trailing, spacing: Spacing.xxs) {
        Text(verbatim: lastUsed)
          .font(.meta)
          .foregroundStyle(.inkSecondary)
        if song.hidden {
          Text("Hidden")
            .font(.meta)
            .foregroundStyle(.inkTertiary)
        }
      }
      .lineLimit(1)
    }
    .padding(.vertical, Spacing.xxs)
    .contentShape(.rect)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(accessibilityLabel)
  }

  /// "3 wk ago", or "Never used".
  private var lastUsed: String {
    guard let last = song.lastScheduledAt else { return String(localized: "Never used") }
    return formatPlayedAgo(last, now: clock.now)
  }

  private var accessibilityLabel: Text {
    var parts = [song.title]
    if !song.author.isEmpty { parts.append(song.author) }
    parts.append(song.lastScheduledAt == nil ? String(localized: "Never used") : String(localized: "Last used \(lastUsed)"))
    if song.hidden { parts.append(String(localized: "Hidden")) }
    return Text(verbatim: parts.joined(separator: ", "))
  }
}

/// The long-press preview of a song: title, writers, themes, and when it was last scheduled.
struct SongResultPreview: View {
  let song: SongCatalogEntry
  @Environment(\.orgTimeZone) private var timeZone

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      SearchGlyphTile(symbol: .song)
      Text(verbatim: song.title)
        .font(.pageTitle)
        .foregroundStyle(.ink)
      if !song.author.isEmpty {
        Text(verbatim: song.author)
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
      }
      if !song.themes.isEmpty {
        Text(verbatim: song.themes)
          .font(.meta)
          .foregroundStyle(.inkSecondary)
      }
      Group {
        if let last = song.lastScheduledAt {
          Text("Last scheduled \(OrgCalendar.label(last, timeZone: timeZone, style: .monthDayYear))")
        } else {
          Text("Never scheduled")
        }
      }
      .font(.meta)
      .foregroundStyle(.inkSecondary)
      .padding(.top, Spacing.xs)
    }
    .padding(Spacing.xl)
    .frame(width: 300, alignment: .leading)
    .background(.surfaceCard)
  }
}

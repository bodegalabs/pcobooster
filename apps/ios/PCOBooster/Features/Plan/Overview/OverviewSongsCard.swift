import PCOBoosterCore
import SwiftUI

/// The songs in running order with their keys and lengths, and the service's total length
/// (`summarizeOrder`). Facts only: keys are shown as written, never judged.
struct OverviewSongsCard: View {
  let order: PlanOrder?
  let loadError: String?
  let onRetry: () -> Void
  let onOpenPlan: () -> Void

  var body: some View {
    OverviewCard(
      "Songs", systemImage: "music.note.list", summary: summary,
      isSummaryLoading: order == nil && loadError == nil
    ) {
      OverviewSegmentLink(segment: .plan, action: onOpenPlan)
    } content: {
      if let order {
        if order.songs.isEmpty {
          Text("No songs in the order of service yet.")
            .font(.rowDetail)
            .foregroundStyle(.inkSecondary)
        } else {
          VStack(spacing: 0) {
            ForEach(Array(order.songs.enumerated()), id: \.element.id) { index, song in
              if index > 0 {
                Hairline(color: .hairlineSubtle).padding(.leading, 28)
              }
              OverviewSongRow(number: index + 1, song: song)
            }
          }
        }
      } else if let loadError {
        OverviewLoadError(title: "Couldn't load songs", message: loadError, retry: onRetry)
      } else {
        OverviewRowsSkeleton(rows: 3)
      }
    }
  }

  /// "4 songs · 1:05:00 service" (`describeOrder`).
  private var summary: Text? {
    guard let order else { return nil }
    let songs = order.songs.count == 1 ? "1 song" : "\(order.songs.count) songs"
    guard let length = formatDuration(seconds: order.serviceLength) else {
      return Text(verbatim: songs)
    }
    return Text(verbatim: "\(songs) \u{B7} \(length) service")
  }
}

private struct OverviewSongRow: View {
  let number: Int
  let song: PlanSong

  var body: some View {
    HStack(spacing: Spacing.md) {
      Text(verbatim: "\(number)")
        .font(.footnote.monospacedDigit())
        .foregroundStyle(.inkTertiary)
        .frame(minWidth: 16, alignment: .trailing)
      Text(verbatim: song.title)
        .font(.rowTitle)
        .foregroundStyle(.ink)
        .lineLimit(2)
        .frame(maxWidth: .infinity, alignment: .leading)
      if let length = song.length, length > 0 {
        DurationText(seconds: Int(length))
          .font(.footnote.monospacedDigit())
          .foregroundStyle(.inkTertiary)
      }
      keyBadge
    }
    .frame(minHeight: Metrics.minimumTapTarget - 4)
    .accessibilityElement(children: .combine)
  }

  /// "G", or "G → A" for a song that modulates (`keyLabel` writes it "G to A").
  private var keyBadge: KeyBadge {
    guard let label = song.keyLabel else { return KeyBadge(nil) }
    let keys = label.components(separatedBy: " to ")
    return keys.count == 2 ? KeyBadge(from: keys[0], to: keys[1]) : KeyBadge(label)
  }
}

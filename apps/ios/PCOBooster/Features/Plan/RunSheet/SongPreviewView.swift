import PCOBoosterCore
import SwiftUI

/// What matters while choosing a song (`SongPreview` in `add-song-palette.tsx`): the keys it was
/// sung in (else its arrangements' keys), its tempos, how its latest key meets the song it would
/// follow, and where it was sung. The action sits at the bottom.
struct SongPreviewView: View {
  let song: SongCatalogEntry
  let request: SongPaletteRequest
  let serviceTypeId: String
  let planId: String
  let onChoose: (SongCatalogEntry) -> Void

  @ScreenModel private var options: SongOptionsModel
  @ScreenModel private var history: SongHistoryModel

  /// History rows shown before "Show all" (`PREVIEW_HISTORY_ROWS`).
  private static let historyRows = 8

  init(
    song: SongCatalogEntry, request: SongPaletteRequest, serviceTypeId: String, planId: String,
    onChoose: @escaping (SongCatalogEntry) -> Void
  ) {
    self.song = song
    self.request = request
    self.serviceTypeId = serviceTypeId
    self.planId = planId
    self.onChoose = onChoose
    _options = ScreenModel { app in
      SongOptionsModel(queries: app.queries, songId: song.id, serviceTypeId: serviceTypeId)
    }
    _history = ScreenModel { app in SongHistoryModel(queries: app.queries, songId: song.id) }
  }

  var body: some View {
    List {
      Section {
        VStack(alignment: .leading, spacing: Spacing.xxs) {
          Text(verbatim: song.title)
            .font(.pageTitle)
            .foregroundStyle(.ink)
          if !song.author.isEmpty {
            Text(verbatim: song.author)
              .font(.rowDetail)
              .foregroundStyle(.inkSecondary)
          }
          if request.planSongIds.contains(song.id) {
            Label("Already in this plan", symbol: .checkmark)
              .font(.meta)
              .foregroundStyle(.inkSecondary)
              .padding(.top, Spacing.xs)
          }
        }
        .listRowBackground(Color.clear)
        .listRowInsets(.horizontal, Spacing.xl)
      }
      Section {
        facts
      }
      .listRowBackground(Color.surfaceCard)
      Section {
        RunSheetSongHistorySection(
          songId: song.id, serviceTypeId: serviceTypeId, planId: planId,
          planDate: request.planDate, previewRows: Self.historyRows)
      } header: {
        SectionHeader("History")
      }
      .listRowBackground(Color.surfaceCard)
    }
    .listStyle(.insetGrouped)
    .canvasBackground()
    .navigationTitle(Text(verbatim: song.title))
    .navigationBarTitleDisplayMode(.inline)
    .bottomActionBar {
      Button {
        onChoose(song)
      } label: {
        Text(verbatim: request.actionTitle)
      }
      .accessibilityIdentifier("song-preview-choose")
    }
    .queryLifecycle(options.options, history.history)
  }

  @ViewBuilder private var facts: some View {
    if options.options.value == nil, options.options.isLoading {
      VStack(alignment: .leading, spacing: Spacing.md) {
        Skeleton(.text, width: 160)
        Skeleton(.text, width: 110)
      }
      .padding(.vertical, Spacing.xs)
    } else {
      let facts = songPreviewFacts(
        history: history.history.value, arrangements: options.options.value?.arrangements ?? [],
        serviceTypeId: serviceTypeId, previousSong: request.previousSong,
        planDate: request.planDate)
      if facts.keys.isEmpty, facts.tempos.isEmpty, facts.keyChange == nil {
        Text("No keys or tempo in Planning Center yet.")
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
      }
      if !facts.keys.isEmpty {
        LabeledContent {
          FlowLayout(spacing: Spacing.xs) {
            ForEach(facts.keys, id: \.self) { key in
              KeyBadge(key)
            }
          }
        } label: {
          Text("Keys")
        }
      }
      if !facts.tempos.isEmpty {
        LabeledContent("Tempo") {
          Text(verbatim: facts.tempos.joined(separator: ", "))
            .foregroundStyle(.ink)
        }
      }
      if let keyChange = facts.keyChange, let previous = request.previousSong {
        LabeledContent {
          Text(verbatim: "\(KeyBadge.display(keyChange.key)), \(keyChange.change)")
            .foregroundStyle(.ink)
        } label: {
          Text("After \(KeyBadge.display(previous.endKey))")
        }
      }
    }
  }
}

/// Lays children out in rows, wrapping to the next row when the width runs out, aligned to the
/// trailing edge (for key badges in a labeled row).
struct FlowLayout: Layout {
  var spacing: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let rows = arrange(subviews, width: proposal.width ?? .infinity)
    let width = rows.map(\.width).max() ?? 0
    let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(rows.count - 1, 0))
    return CGSize(width: width, height: height)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    var y = bounds.minY
    for row in arrange(subviews, width: bounds.width) {
      var x = bounds.maxX - row.width
      for index in row.indices {
        let size = subviews[index].sizeThatFits(.unspecified)
        subviews[index].place(
          at: CGPoint(x: x, y: y + (row.height - size.height) / 2), proposal: .unspecified)
        x += size.width + spacing
      }
      y += row.height + spacing
    }
  }

  private struct Row {
    var indices: [Int] = []
    var width: CGFloat = 0
    var height: CGFloat = 0
  }

  private func arrange(_ subviews: Subviews, width: CGFloat) -> [Row] {
    var rows: [Row] = []
    var current = Row()
    for index in subviews.indices {
      let size = subviews[index].sizeThatFits(.unspecified)
      let needed = current.indices.isEmpty ? size.width : current.width + spacing + size.width
      if needed > width, !current.indices.isEmpty {
        rows.append(current)
        current = Row()
      }
      current.width = current.indices.isEmpty ? size.width : current.width + spacing + size.width
      current.height = max(current.height, size.height)
      current.indices.append(index)
    }
    if !current.indices.isEmpty {
      rows.append(current)
    }
    return rows
  }
}

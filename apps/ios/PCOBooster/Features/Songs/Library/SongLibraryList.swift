import PCOBoosterCore
import SwiftUI

/// The library list: recently opened songs, a one-line summary, then every listed song (by
/// letter with a section index when sorted by title). Rows push the song on iPhone and select
/// it into the detail pane on iPad. Swipe or long press a row for its chord chart and its page
/// in Planning Center, where hiding a song happens.
struct SongLibraryList: View {
  @Bindable var model: SongLibraryModel
  /// The song shown in the iPad detail pane; nil pushes rows instead.
  var selection: Binding<String?>?
  let addSong: (String) -> Void

  @Environment(AppModel.self) private var app
  @Environment(AppRouter.self) private var router
  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.openURL) private var openURL

  var body: some View {
    Group {
      if let library = model.library.value {
        if model.rows.isEmpty, model.recentRows.isEmpty {
          emptyState(library: library)
        } else {
          list(library: library)
        }
      } else if model.library.status == .failure {
        errorState
      } else {
        SongLibrarySkeleton()
      }
    }
    .animation(.default, value: model.library.value == nil)
  }

  // MARK: List

  private func list(library: SongLibrary) -> some View {
    let sections = model.sections
    let themes = Dictionary(
      library.songs.map { ($0.id, $0.themes) }, uniquingKeysWith: { first, _ in first })
    return List {
      if !model.recentRows.isEmpty {
        Section {
          ForEach(model.recentRows) { row in
            rowView(row, themes: themes[row.id] ?? "")
          }
        } header: {
          SectionHeader("Recently opened")
        }
      }
      if let summary = model.summary(timeZone: timeZone) {
        Section {
          SummaryText(summary: summary, tidying: model.isTidying)
            .listRowBackground(Color.surfaceCanvas)
            .listRowSeparator(.hidden)
            .accessibilityAddTraits(.updatesFrequently)
        }
      }
      ForEach(sections) { section in
        Section {
          ForEach(section.rows) { row in
            rowView(row, themes: themes[row.id] ?? "")
          }
        } header: {
          if let letter = section.indexLabel {
            SectionHeader(verbatim: letter)
          } else if model.isSearching {
            SectionHeader("Matching songs", count: section.rows.count)
          } else if !model.recentRows.isEmpty {
            SectionHeader("All songs")
          }
        } footer: {
          if section.id == sections.last?.id, library.truncated {
            Text(
              "Planning Center sent the first \(library.songs.count.formatted()) visible songs, A to Z, so later titles aren\u{2019}t listed."
            )
            .font(.meta)
            .foregroundStyle(.inkSecondary)
          }
        }
        .sectionIndexLabel(section.indexLabel)
      }
    }
    .listStyle(.plain)
    .listSectionIndexVisibility(model.sort == .title && !model.isSearching ? .visible : .hidden)
    .scrollContentBackground(.hidden)
    .background(.surfaceCanvas)
    .refreshable { await model.library.refresh() }
  }

  @ViewBuilder private func rowView(_ row: SongRowData, themes: String) -> some View {
    let isSelected = selection?.wrappedValue == row.id
    Group {
      if let selection {
        Button {
          selection.wrappedValue = row.id
        } label: {
          SongRow(row: row, now: model.now)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
      } else {
        NavigationLink(value: AppRoute.song(id: row.id)) {
          SongRow(row: row, now: model.now)
        }
      }
    }
    .listRowBackground(isSelected ? Color.surfaceHighlight : Color.surfaceCanvas)
    .listRowSeparatorTint(.hairline)
    .swipeActions(edge: .leading, allowsFullSwipe: true) {
      Button {
        open(.chordChart(songId: row.id, arrangementId: nil))
      } label: {
        Label("Chord Chart", symbol: .chordChart)
      }
      .tint(.statusInfo)
    }
    .swipeActions(edge: .trailing, allowsFullSwipe: model.isTidying) {
      if let url = SongLinks.song(row.id) {
        Button {
          openURL(url)
        } label: {
          Label("Planning Center", symbol: .openExternal)
        }
        .tint(.inkSecondary)
      }
    }
    .contextMenu {
      Button {
        if let selection { selection.wrappedValue = row.id } else { open(.song(id: row.id)) }
      } label: {
        Label("Open", symbol: .song)
      }
      Button {
        open(.chordChart(songId: row.id, arrangementId: nil))
      } label: {
        Label("Chord Chart", symbol: .chordChart)
      }
      if let url = SongLinks.song(row.id) {
        Button {
          openURL(url)
        } label: {
          Label(model.isTidying ? "Hide in Planning Center" : "Open in Planning Center", symbol: .openExternal)
        }
      }
      Button {
        UIPasteboard.general.string = row.title
      } label: {
        Label("Copy Title", symbol: .copy)
      }
    } preview: {
      SongRowPreview(row: row, themes: themes, now: model.now)
        .environment(\.orgTimeZone, timeZone)
        .task { prefetchDetail(row.id) }
    }
  }

  private func open(_ route: AppRoute) {
    router.push(route)
  }

  /// A deliberate long press is clear intent: load what the song screen shows first, in the
  /// speculative lane.
  private func prefetchDetail(_ songId: String) {
    app.queries.prefetch(.songHistory(songId: songId), RPC.Songs.history, SongsHistoryInput(songId: songId))
    if app.capabilities.isEnabled(.chordCharts) {
      app.queries.prefetch(
        .chordChartSong(songId: songId), RPC.ChordCharts.song, ChordChartSongInput(songId: songId))
    }
  }

  // MARK: States

  private func emptyState(library: SongLibrary) -> some View {
    ScrollView {
      Group {
        if model.isSearching {
          EmptyState(
            "No songs match \u{201C}\(model.query)\u{201D}", artwork: .symbol(.search),
            description: Text(
              model.filter == .all
                ? "Add it to Planning Center to start its chart."
                : "Try All songs, or add it to Planning Center.")
          ) {
            Button {
              addSong(model.query)
            } label: {
              Label("Add Song", symbol: .add)
            }
            .buttonStyle(.pill(.primary))
          }
        } else if model.isTidying {
          EmptyState(
            "Nothing to tidy up", artwork: .rocket,
            description: Text("Every song has been on a plan in this time."))
        } else {
          EmptyState(
            "No songs yet", artwork: .symbol(.songs),
            description: Text("Add a song to Planning Center to write its chord chart.")
          ) {
            Button {
              addSong("")
            } label: {
              Label("Add Song", symbol: .add)
            }
            .buttonStyle(.pill(.primary))
          }
        }
      }
      .padding(.top, Spacing.huge)
    }
    .scrollBounceBehavior(.basedOnSize)
    .background(.surfaceCanvas)
    .refreshable { await model.library.refresh() }
  }

  private var errorState: some View {
    ScrollView {
      EmptyState(
        "Songs didn\u{2019}t load", artwork: .symbol(.alert),
        description: Text("Planning Center didn\u{2019}t send the song library.")
      ) {
        Button("Try again") { model.library.retry() }
          .buttonStyle(.pill(.secondary))
      }
      .padding(.top, Spacing.huge)
    }
    .scrollBounceBehavior(.basedOnSize)
    .background(.surfaceCanvas)
    .refreshable { await model.library.refresh() }
  }
}

/// The library's one-line summary, and in a tidy filter why hiding in Planning Center is safe.
private struct SummaryText: View {
  let summary: String
  let tidying: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.xs) {
      Text(verbatim: summary)
        .font(.rowDetail)
        .foregroundStyle(.inkSecondary)
        .contentTransition(.numericText())
      if tidying {
        Text("Hiding a song in Planning Center keeps its history and takes it out of search.")
          .font(.meta)
          .foregroundStyle(.inkTertiary)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.vertical, Spacing.xxs)
  }
}

/// Ten placeholder rows while the library loads for the first time.
struct SongLibrarySkeleton: View {
  private static let widths: [(CGFloat, CGFloat)] = [
    (180, 110), (140, 90), (200, 120), (120, 80), (170, 130), (150, 70), (190, 100), (130, 110),
    (160, 90), (110, 80),
  ]

  var body: some View {
    List {
      ForEach(Self.widths.indices, id: \.self) { index in
        HStack {
          SkeletonRow(showsAvatar: false, titleWidth: Self.widths[index].0, detailWidth: Self.widths[index].1)
          Skeleton(.text, width: 48, height: 10)
        }
        .listRowBackground(Color.surfaceCanvas)
      }
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .background(.surfaceCanvas)
    .scrollDisabled(true)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("Loading songs"))
  }
}

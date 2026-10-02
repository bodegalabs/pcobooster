import PCOBoosterCore
import SwiftUI

/// The chord chart editor for a song, on `arrangementId` or its first active arrangement (the
/// web's `ChordChartEditorPage`). Needs the `chordCharts` flag (the route shows "not available"
/// otherwise). Loads the song, says why when it can't, offers to create an arrangement when the
/// song has none, and otherwise opens the workspace for the chosen arrangement; switching
/// arrangements (the title menu) starts a fresh workspace.
struct ChordChartEditorView: View {
  let songId: String
  let arrangementId: String?

  @ScreenModel private var model: ChordChartEditorModel
  @Environment(AppModel.self) private var app

  init(songId: String, arrangementId: String?) {
    self.songId = songId
    self.arrangementId = arrangementId
    _model = ScreenModel { app in
      ChordChartEditorModel(queries: app.queries, songId: songId, arrangementId: arrangementId)
    }
  }

  var body: some View {
    content
      .background(.surfaceCanvas)
      .onChange(of: model.song.value?.song, initial: true) { _, song in
        guard let song else { return }
        RecentSongsStore.shared.remember(
          RecentSong(id: song.id, title: song.title, author: song.author), scope: app.queries.scope,
          persists: !app.configuration.usesMockData)
      }
      .queryLifecycle(model.song)
  }

  @ViewBuilder private var content: some View {
    if let output = model.song.value {
      if let arrangement = model.arrangement {
        ChordChartWorkspaceView(
          song: output.song, arrangement: arrangement, arrangements: output.arrangements,
          isReadOnOpen: model.isReadOnOpen,
          select: { model.selectedArrangementId = $0 },
          added: { model.added($0, queries: app.queries) }
        )
        .id(arrangement.id)
      } else {
        NoArrangementsView(song: output.song) { created in
          model.added(created, queries: app.queries)
        }
      }
    } else if let failure = model.loadFailure {
      SongLoadErrorView(failure: failure) { model.song.retry() }
        .navigationTitle("Chord Chart")
        .navigationBarTitleDisplayMode(.inline)
    } else {
      ChordChartEditorSkeleton()
    }
  }
}

/// The editor's first-load placeholder: a title and the chart's lines.
struct ChordChartEditorSkeleton: View {
  private static let widths: [CGFloat] = [72, 240, 200, 0, 88, 260, 180, 220, 0, 64, 230, 150]

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.md) {
      ForEach(Self.widths.indices, id: \.self) { index in
        if Self.widths[index] == 0 {
          Color.clear.frame(height: Spacing.sm)
        } else {
          Skeleton(.text, width: Self.widths[index], height: 14)
        }
      }
      Spacer()
    }
    .padding(.horizontal, Spacing.xl)
    .padding(.top, Spacing.xl)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .navigationTitle("Chord Chart")
    .navigationBarTitleDisplayMode(.inline)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("Loading chord chart"))
  }
}

/// A song without arrangements: chord charts belong to one, so editors can create it here
/// (`NoArrangements`).
private struct NoArrangementsView: View {
  let song: ChordChartSong
  let created: (ChordChartArrangement) -> Void

  @Environment(AppModel.self) private var app
  @Environment(AppRouter.self) private var router
  @State private var showsCreate = false

  private var access: ChordChartEditAccess {
    chordChartEditAccess(app.capabilities.access, demo: app.capabilities.isDemo)
  }

  var body: some View {
    EmptyState(
      "\(songDisplayTitle(song.title)) has no arrangements", artwork: .symbol(.chordChart),
      description: Text(
        access.canEdit
          ? "Chord charts belong to an arrangement. Create one to start writing."
          : "Chord charts belong to an arrangement, and this song has none yet.")
    ) {
      if access.canEdit {
        Button {
          showsCreate = true
        } label: {
          Label("Create Arrangement", symbol: .add)
        }
        .buttonStyle(.pill(.primary))
        .accessibilityIdentifier("chord-chart-create-arrangement")
      } else {
        Button("Back to Songs") {
          router.popToRoot(.songs)
          router.selectedTab = .songs
        }
        .buttonStyle(.pill(.secondary))
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .navigationTitle(songDisplayTitle(song.title))
    .navigationBarTitleDisplayMode(.inline)
    .sheet(isPresented: $showsCreate) {
      ChordChartArrangementSheet(
        songId: song.id, content: .empty, copyOf: nil,
        created: { arrangement in
          showsCreate = false
          created(arrangement)
        })
    }
  }
}

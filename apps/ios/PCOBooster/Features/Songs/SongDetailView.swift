import PCOBoosterCore
import SwiftUI

/// One song's facts: writers and themes, when it was last and next sung, how often, its keys,
/// its arrangements (keys, tempo, meter, length, sequence), every plan with it over the past
/// year, and with the `chordCharts` flag its chart as Planning Center prints it. Facts only,
/// never suggestions. Reachable from the run sheet without the flag; chart parts hide when it is
/// off. On iPad the library shows it beside the list (`embedded`).
struct SongDetailView: View {
  let songId: String
  /// Shown in the library's detail pane: the title sits in the content, actions in the header.
  let embedded: Bool

  @ScreenModel private var model: SongDetailModel
  @Environment(AppModel.self) private var app
  @Environment(AppRouter.self) private var router
  @Environment(\.openURL) private var openURL
  @State private var showsViewer = false
  @State private var width: CGFloat = 0
  @Namespace private var transitions

  init(songId: String) {
    self.init(songId: songId, embedded: false)
  }

  init(songId: String, embedded: Bool) {
    self.songId = songId
    self.embedded = embedded
    _model = ScreenModel { app in
      SongDetailModel(
        queries: app.queries, songId: songId,
        chartsEnabled: app.capabilities.isEnabled(.chordCharts), now: app.clock.now)
    }
  }

  private var chartsEnabled: Bool { app.capabilities.isEnabled(.chordCharts) }
  private var access: ChordChartEditAccess {
    chordChartEditAccess(app.capabilities.access, demo: app.capabilities.isDemo)
  }
  /// Wide enough for facts and history beside the chart and arrangements.
  private var isWide: Bool { width >= 760 }

  var body: some View {
    Group {
      if let failure = model.loadFailure {
        SongLoadErrorView(failure: failure) {
          model.history.retry()
          model.options?.retry()
          model.chart?.retry()
        }
      } else {
        scroll
      }
    }
    .background(.surfaceCanvas)
    .modifier(DetailChrome(
      embedded: embedded, title: model.title, songId: songId, chartsEnabled: chartsEnabled,
      openChart: { openChart(model.previewArrangement?.id) }))
    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
    .onAppear { model.setVisible(true) }
    .onDisappear { model.setVisible(false) }
    .task(id: model.history.value == nil) { await model.resolveOptions() }
    .onChange(of: model.title, initial: true) { _, title in
      guard let title else { return }
      RecentSongsStore.shared.remember(
        RecentSong(id: songId, title: title, author: model.author), scope: app.queries.scope,
        persists: !app.configuration.usesMockData)
    }
    .fullScreenCover(isPresented: $showsViewer) {
      ChordChartPDFViewer(
        songTitle: model.title ?? "", model: model.pdf, targets: model.previewTargets,
        select: { target in
          model.previewTarget = target
          model.showPreview()
        }
      )
      .navigationTransition(.zoom(sourceID: "chart-viewer", in: transitions))
    }
  }

  private var scroll: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: Spacing.xl) {
        header
        if isWide {
          HStack(alignment: .top, spacing: Spacing.xl) {
            VStack(alignment: .leading, spacing: Spacing.xl) {
              SongFactsCard(model: model)
              SongHistorySection(model: model)
            }
            .frame(maxWidth: .infinity)
            VStack(alignment: .leading, spacing: Spacing.xl) {
              chartCard
              SongArrangementsSection(model: model, chartsEnabled: chartsEnabled, openChart: openChart)
            }
            .frame(maxWidth: .infinity)
          }
        } else {
          SongFactsCard(model: model)
          chartCard
          SongArrangementsSection(model: model, chartsEnabled: chartsEnabled, openChart: openChart)
          SongHistorySection(model: model)
        }
      }
      .padding(.horizontal, embedded ? Spacing.xl : Spacing.lg)
      .padding(.top, embedded ? Spacing.lg : Spacing.xs)
      .padding(.bottom, Spacing.huge)
      .frame(maxWidth: isWide ? 1100 : 680)
      .frame(maxWidth: .infinity)
    }
    .refreshable { await model.refresh() }
  }

  @ViewBuilder private var chartCard: some View {
    if chartsEnabled {
      SongChartCard(
        model: model, access: access, transition: transitions,
        openViewer: { showsViewer = true }, openEditor: openChart)
    }
  }

  // MARK: Header

  private var header: some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      if embedded {
        if let title = model.title {
          Text(verbatim: songDisplayTitle(title))
            .font(.heroTitle)
            .foregroundStyle(.ink)
            .accessibilityAddTraits(.isHeader)
        } else {
          Skeleton(.text, width: 220, height: 26)
        }
      }
      if !model.author.isEmpty {
        Text(verbatim: model.author)
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
      } else if model.title == nil {
        Skeleton(.text, width: 160, height: 12)
      }
      if !model.themes.isEmpty || model.isHidden {
        SongFlowLayout(spacing: Spacing.xs) {
          if model.isHidden {
            StatusBadge("Hidden in Planning Center", tone: .neutral, symbol: .locked)
          }
          ForEach(model.themes, id: \.self) { theme in
            Text(verbatim: theme)
              .font(.badgeLabel)
              .foregroundStyle(.inkSecondary)
              .padding(.horizontal, Spacing.sm)
              .padding(.vertical, Spacing.xxs + 1)
              .background(.surfaceSecondary, in: .capsule)
          }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text("Themes: \(model.themes.joined(separator: ", "))"))
      }
      if embedded {
        HStack(spacing: Spacing.sm) {
          if chartsEnabled {
            Button {
              openChart(model.previewArrangement?.id)
            } label: {
              Label("Chord Chart", symbol: .chordChart)
            }
            .buttonStyle(.pill(.secondary, size: .small))
          }
          if let url = SongLinks.song(songId) {
            Button {
              openURL(url)
            } label: {
              Label("Planning Center", symbol: .openExternal)
            }
            .buttonStyle(.pill(.outline, size: .small))
          }
        }
        .padding(.top, Spacing.xs)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func openChart(_ arrangementId: String?) {
    router.push(.chordChart(songId: songId, arrangementId: arrangementId))
  }
}

/// The navigation title and toolbar of a pushed song screen (an embedded one has neither).
private struct DetailChrome: ViewModifier {
  let embedded: Bool
  let title: String?
  let songId: String
  let chartsEnabled: Bool
  let openChart: () -> Void
  @Environment(\.openURL) private var openURL

  func body(content: Content) -> some View {
    if embedded {
      content
    } else {
      content
        .navigationTitle(title.map(songDisplayTitle) ?? String(localized: "Song"))
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
          if chartsEnabled {
            ToolbarItem(placement: .topBarTrailing) {
              Button(action: openChart) {
                Label("Chord Chart", symbol: .chordChart)
              }
              .accessibilityIdentifier("song-open-chart")
            }
          }
          ToolbarItem(placement: .topBarTrailing) {
            Menu {
              if let url = SongLinks.song(songId) {
                Button {
                  openURL(url)
                } label: {
                  Label("Open in Planning Center", symbol: .openExternal)
                }
              }
              if let title {
                Button {
                  UIPasteboard.general.string = songDisplayTitle(title)
                } label: {
                  Label("Copy Title", symbol: .copy)
                }
              }
            } label: {
              Label("More", symbol: .more)
            }
          }
        }
    }
  }
}

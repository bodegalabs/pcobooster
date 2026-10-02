import PCOBoosterCore
import SwiftUI

/// The Songs tab root: the organization's song library (`songs.library`), shown only with the
/// `chordCharts` flag. Search ranks by relevance; the filter finds songs no plan has used in a
/// while, to hide in Planning Center; the sort orders by recent use, title (with a section
/// index), or longest unused. On iPad the library sits beside the selected song's facts.
struct SongsHomeView: View {
  @ScreenModel private var model: SongLibraryModel
  @Environment(AppModel.self) private var app
  @Environment(AppRouter.self) private var router
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @SceneStorage("songs.filter") private var storedFilter = SongLibraryFilter.default.rawValue
  @SceneStorage("songs.sort") private var storedSort = SongLibrarySort.default.rawValue
  @State private var selectedSongId: String?
  @State private var addSongTitle: AddSongRequest?
  @Namespace private var transitions

  /// What the Add Song sheet starts with: usually the search that found nothing.
  private struct AddSongRequest: Identifiable {
    let id = UUID()
    let title: String
  }

  init() {
    _model = ScreenModel { app in
      SongLibraryModel(
        queries: app.queries, now: app.clock.now, usesMockData: app.configuration.usesMockData)
    }
  }

  private var isSplit: Bool { horizontalSizeClass == .regular }

  var body: some View {
    @Bindable var model = model
    content
      .navigationTitle("Songs")
      .navigationSubtitle(model.isTidying ? model.filter.label : "")
      .navigationBarTitleDisplayMode(isSplit ? .inline : .large)
      .searchable(
        text: $model.searchText,
        placement: .navigationBarDrawer(displayMode: .always),
        prompt: Text("Search songs, writers, or themes"))
      .toolbar { toolbar }
      .sheet(item: $addSongTitle) { request in
        AddSongSheet(
          initialTitle: request.title,
          openExisting: { songId in
            addSongTitle = nil
            show(songId)
          },
          added: { created in
            addSongTitle = nil
            router.push(.song(id: created.song.id))
            router.push(.chordChart(songId: created.song.id, arrangementId: created.arrangements.first?.id))
          }
        )
        .navigationTransition(.zoom(sourceID: "add-song", in: transitions))
      }
      .onAppear {
        model.filter = parseSongLibraryFilter(storedFilter)
        model.sort = parseSongLibrarySort(storedSort)
      }
      .onChange(of: model.filter) { _, filter in storedFilter = filter.rawValue }
      .onChange(of: model.sort) { _, sort in storedSort = sort.rawValue }
      .haptic(.selection, trigger: model.filter)
      .haptic(.selection, trigger: model.sort)
      .queryLifecycle(model.library)
  }

  @ViewBuilder private var content: some View {
    if isSplit {
      HStack(spacing: 0) {
        SongLibraryList(model: model, selection: $selectedSongId, addSong: addSong)
          .frame(width: 360)
        Hairline(axis: .vertical)
        detailPane
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
      .background(.surfaceCanvas)
    } else {
      SongLibraryList(model: model, selection: nil, addSong: addSong)
    }
  }

  @ViewBuilder private var detailPane: some View {
    if let selectedSongId {
      SongDetailView(songId: selectedSongId, embedded: true)
        .id(selectedSongId)
    } else {
      EmptyState(
        "Choose a song", symbol: .song,
        description: "Its keys, arrangements, chart, and history appear here.")
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(.surfaceCanvas)
    }
  }

  @ToolbarContentBuilder private var toolbar: some ToolbarContent {
    ToolbarItem(placement: .primaryAction) {
      filterMenu
    }
    ToolbarItem(placement: .primaryAction) {
      Button {
        addSong("")
      } label: {
        Label("Add Song", symbol: .add)
      }
      .accessibilityIdentifier("songs-add-button")
    }
    .matchedTransitionSource(id: "add-song", in: transitions)
  }

  private var filterMenu: some View {
    @Bindable var model = model
    return Menu {
      Section("Show") {
        Picker("Show", selection: $model.filter) {
          ForEach(SongLibraryFilter.allCases, id: \.self) { filter in
            Text(filter.label).tag(filter)
          }
        }
        .pickerStyle(.inline)
      }
      Section(model.isSearching ? "Sorted by relevance while searching" : "Sort by") {
        Picker("Sort by", selection: $model.sort) {
          ForEach(SongLibrarySort.allCases, id: \.self) { sort in
            Text(sort.label).tag(sort)
          }
        }
        .pickerStyle(.inline)
        .disabled(model.isSearching)
      }
    } label: {
      Label(
        "Filter and Sort",
        systemImage: model.isTidying
          ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
    }
    .accessibilityIdentifier("songs-filter-menu")
    .accessibilityValue(Text("\(model.filter.label), \(model.sort.label)"))
  }

  private func addSong(_ title: String) {
    addSongTitle = AddSongRequest(title: title)
  }

  private func show(_ songId: String) {
    if isSplit {
      selectedSongId = songId
    } else {
      router.push(.song(id: songId))
    }
  }
}

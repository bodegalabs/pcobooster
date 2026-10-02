import PCOBoosterCore
import SwiftUI

/// Choosing a song for the plan (`AddSongPalette`): search the catalog, or browse what was sung
/// most recently and what has rested, each row with when it was last sung. Tapping a row shows
/// its keys, tempo, how its key meets the song before it, and its history, with the action at
/// the bottom; swiping a row takes it straight away. Facts only: nothing here ranks or suggests
/// a song.
struct SongPaletteSheet: View {
  let request: SongPaletteRequest
  let serviceTypeId: String
  let planId: String
  let onChoose: (SongCatalogEntry) -> Void

  @ScreenModel private var palette: SongPaletteModel
  @State private var query = ""
  @Environment(\.dismiss) private var dismiss

  /// How long typing must pause before a search goes out.
  private static let searchDebounce: Duration = .milliseconds(200)

  init(
    request: SongPaletteRequest, serviceTypeId: String, planId: String,
    onChoose: @escaping (SongCatalogEntry) -> Void
  ) {
    self.request = request
    self.serviceTypeId = serviceTypeId
    self.planId = planId
    self.onChoose = onChoose
    _palette = ScreenModel { app in SongPaletteModel(queries: app.queries) }
  }

  var body: some View {
    NavigationStack {
      list
        .navigationTitle(Text(verbatim: request.title))
        .navigationBarTitleDisplayMode(.inline)
        .searchable(
          text: $query, placement: .navigationBarDrawer(displayMode: .always),
          prompt: Text("Search songs"))
        .task(id: query) {
          if query.trimmingCharacters(in: .whitespaces).isEmpty {
            palette.setSearch("")
            return
          }
          try? await Task.sleep(for: Self.searchDebounce)
          guard !Task.isCancelled else { return }
          palette.setSearch(query)
        }
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(role: .close) { dismiss() }
          }
        }
        .navigationDestination(for: SongCatalogEntry.self) { song in
          SongPreviewView(
            song: song, request: request, serviceTypeId: serviceTypeId, planId: planId,
            onChoose: choose)
        }
    }
    .onAppear { palette.appear() }
    .onDisappear { palette.disappear() }
    .presentationDetents([.large])
    .presentationSizing(.form)
  }

  private func choose(_ song: SongCatalogEntry) {
    onChoose(song)
    dismiss()
  }

  private var list: some View {
    List {
      if palette.isBrowsing {
        browseSections
      } else {
        searchSection
      }
    }
    .listStyle(.plain)
    .canvasBackground()
    .scrollDismissesKeyboard(.immediately)
    .animation(Motion.reveal, value: palette.isBrowsing)
  }

  @ViewBuilder private var browseSections: some View {
    if let suggestions = palette.suggestions.value {
      if suggestions.recentlyPlayed.isEmpty, suggestions.resting.isEmpty {
        ContentUnavailableView(
          "No songs sung yet", systemImage: "music.note.list",
          description: Text("Search the library to add a song."))
          .listRowBackground(Color.clear)
          .listRowSeparator(.hidden)
      }
      if !suggestions.recentlyPlayed.isEmpty {
        Section {
          rows(suggestions.recentlyPlayed)
        } header: {
          SectionHeader("Recently sung")
        }
      }
      if !suggestions.resting.isEmpty {
        Section {
          rows(suggestions.resting)
        } header: {
          SectionHeader("Earlier")
        }
      }
    } else if let message = palette.suggestions.errorMessage {
      errorRow(message) { palette.suggestions.retry() }
    } else {
      skeletonRows
    }
  }

  @ViewBuilder private var searchSection: some View {
    if let results = palette.results {
      if results.isEmpty, !palette.isSearching {
        ContentUnavailableView.search(text: query)
          .listRowBackground(Color.clear)
          .listRowSeparator(.hidden)
      } else {
        rows(results)
          .staleWhileRefreshing(palette.search?.value == nil && palette.isSearching)
      }
    } else if let message = palette.search?.errorMessage {
      errorRow(message) { palette.search?.retry() }
    } else {
      skeletonRows
    }
  }

  private func rows(_ songs: [SongCatalogEntry]) -> some View {
    ForEach(songs) { song in
      NavigationLink(value: song) {
        SongPaletteRow(
          song: song, inPlan: request.planSongIds.contains(song.id), planDate: request.planDate)
      }
      .listRowBackground(Color.clear)
      .swipeActions(edge: .leading, allowsFullSwipe: true) {
        Button {
          choose(song)
        } label: {
          Label(request.actionTitle, symbol: request.replacing == nil ? .add : .replaceSong)
        }
        .tint(.inkFill)
      }
      .contextMenu {
        Button {
          choose(song)
        } label: {
          Label(request.actionTitle, symbol: request.replacing == nil ? .add : .replaceSong)
        }
      } preview: {
        SongQuickPreview(
          song: song, inPlan: request.planSongIds.contains(song.id), planDate: request.planDate)
      }
      .accessibilityAction(named: Text(request.actionTitle)) { choose(song) }
      .accessibilityIdentifier("song-palette-row-\(song.id)")
    }
  }

  private var skeletonRows: some View {
    ForEach(0..<6, id: \.self) { index in
      SkeletonRow(showsAvatar: false, titleWidth: [160, 120, 180, 140, 100, 150][index])
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
    }
  }

  private func errorRow(_ message: String, retry: @escaping () -> Void) -> some View {
    ContentUnavailableView {
      Label("Couldn\u{2019}t load songs", systemImage: "exclamationmark.triangle")
    } description: {
      Text(verbatim: message)
    } actions: {
      Button("Try Again", action: retry)
        .buttonStyle(.pill(.outline))
    }
    .listRowBackground(Color.clear)
    .listRowSeparator(.hidden)
  }
}

/// A song in the palette: title and author, and when it was last sung before the plan ("3w",
/// "later"), or a check when it's already in the plan.
struct SongPaletteRow: View {
  let song: SongCatalogEntry
  let inPlan: Bool
  let planDate: Date

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: Spacing.md) {
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: song.title)
          .font(.rowTitle)
          .foregroundStyle(.ink)
          .lineLimit(2)
        if !song.author.isEmpty {
          Text(verbatim: song.author)
            .font(.meta)
            .foregroundStyle(.inkSecondary)
            .lineLimit(1)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if inPlan {
        Image(symbol: .checkmark)
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.inkSecondary)
          .accessibilityLabel(Text("In plan"))
      } else {
        let when = RunSheetFormatting.whenLabel(song.lastScheduledAt, planDate: planDate)
        if !when.isEmpty {
          Text(verbatim: when)
            .font(.numericMeta)
            .foregroundStyle(.inkTertiary)
            .accessibilityLabel(
              when == String(localized: "later")
                ? Text("Planned later") : Text("Last sung \(when) before this plan"))
        }
      }
    }
    .padding(.vertical, Spacing.xxs)
  }
}

/// The long-press preview of a palette song: its name and when it was last sung.
struct SongQuickPreview: View {
  let song: SongCatalogEntry
  let inPlan: Bool
  let planDate: Date
  @Environment(\.appClock) private var clock

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      Text(verbatim: song.title)
        .font(.pageTitle)
        .foregroundStyle(.ink)
      if !song.author.isEmpty {
        Text(verbatim: song.author)
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
      }
      Group {
        if inPlan {
          Text("Already in this plan")
        } else if let last = song.lastScheduledAt, last <= clock.now {
          Text("Last sung \(formatPlayedAgo(last, now: clock.now).lowercased())")
        } else if song.lastScheduledAt == nil {
          Text("Never scheduled")
        } else {
          Text("Planned later")
        }
      }
      .font(.meta)
      .foregroundStyle(.inkSecondary)
    }
    .padding(Spacing.xl)
    .frame(width: 300, alignment: .leading)
    .background(.surfaceCard)
  }
}

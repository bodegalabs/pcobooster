import Foundation
import Observation
import PCOBoosterCore

/// What the song palette is choosing for: a new song at an insertion point, or a replacement.
struct SongPaletteRequest: Identifiable {
  let id = UUID()
  /// The song being swapped out, or nil to add one.
  var replacing: PlanItem?
  /// Where a new song goes (nil adds at the end); ignored when replacing.
  var insertion: PlanInsertion?
  /// The song a chosen one would follow, for how its key sits against it.
  var previousSong: PreviousSong?
  /// Songs already in the plan, marked with a check.
  var planSongIds: Set<String>
  /// The plan's service date, which "3w" and history are counted from.
  var planDate: Date

  /// "Add Song", or "Replace Morning Light".
  var title: String {
    guard let replacing else { return String(localized: "Add Song") }
    let name = replacing.title.isEmpty ? String(localized: "this song") : replacing.title
    return String(localized: "Replace \(name)")
  }

  /// The action that takes the song.
  var actionTitle: String {
    replacing == nil ? String(localized: "Add to Plan") : String(localized: "Replace")
  }
}

/// The palette's reads: recently sung and resting songs while the search is empty
/// (`songs.suggestions`), and the catalog search once something is typed (`songs.search`),
/// keeping the last results on screen while the next search loads.
@MainActor
@Observable
final class SongPaletteModel {
  let suggestions: QueryState<SongsSuggestionsOutput>
  private(set) var search: QueryState<[SongCatalogEntry]>?
  private(set) var searchTerm = ""
  /// The last results that loaded, shown while a newer search is in flight.
  private var lastResults: [SongCatalogEntry]?

  @ObservationIgnored private let queries: QueryClient

  init(queries: QueryClient) {
    self.queries = queries
    suggestions = queries.query(.songSuggestions, RPC.Songs.suggestions)
  }

  var isBrowsing: Bool { searchTerm.isEmpty }

  /// Starts the search for `text` (trimmed and lowercased, like the web's saved searches).
  func setSearch(_ text: String) {
    let term = text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard term != searchTerm else { return }
    if let results = search?.value {
      lastResults = results
    }
    searchTerm = term
    search?.disappear()
    search =
      term.isEmpty
      ? nil
      : queries.query(.songSearch(query: term), RPC.Songs.search, SongsSearchInput(query: term))
  }

  /// The search's results, or the previous search's while this one loads.
  var results: [SongCatalogEntry]? {
    search?.value ?? (search?.isLoading == true ? lastResults : nil)
  }

  var isSearching: Bool {
    search?.isLoading == true || search?.isRefreshing == true
  }

  /// A deliberate long press on a song: load its arrangements and keys in the speculative lane,
  /// so adding it from the menu lands with the suggested arrangement, key, and length
  /// (`useSongOptionsIntent` on the web). Nothing loads when they are fresh.
  func prefetchOptions(songId: String, serviceTypeId: String) {
    queries.prefetch(
      .songOptions(songId: songId, serviceTypeId: serviceTypeId), RPC.Songs.options,
      SongsOptionsInput(serviceTypeId: serviceTypeId, songId: songId))
  }

  func appear() {
    suggestions.appear()
    search?.appear()
  }

  func disappear() {
    suggestions.disappear()
    search?.disappear()
  }
}

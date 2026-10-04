import Foundation
import Observation
import PCOBoosterCore

/// One song row in the library: its title and writers, and the dates the library knows.
nonisolated struct SongRowData: Identifiable, Hashable {
  let id: String
  let title: String
  let author: String
  /// The latest plan with the song, upcoming ones included; nil when it was never on one.
  let lastScheduledAt: Date?
  let createdAt: Date?
  /// Songs from this device's recent list that the library doesn't have yet carry no dates.
  let dated: Bool

  init(_ song: SongLibraryEntry) {
    id = song.id
    title = songDisplayTitle(song.title)
    author = song.author
    lastScheduledAt = song.lastScheduledAt
    createdAt = song.createdAt
    dated = true
  }

  init(recent: RecentSong) {
    id = recent.id
    title = songDisplayTitle(recent.title)
    author = recent.author
    lastScheduledAt = nil
    createdAt = nil
    dated = false
  }

  /// Dated, but never on a plan.
  var neverScheduled: Bool { dated && lastScheduledAt == nil }
}

/// A run of library rows under one heading, such as a letter when sorted by title.
nonisolated struct SongLibrarySection: Identifiable, Hashable {
  let id: String
  /// The letter in the section index (title sort only).
  let indexLabel: String?
  let rows: [SongRowData]
}

/// The song library: every visible song (`songs.library`), filtered, sorted, and searched with
/// the web's rules (`selectSongLibrary`), plus the songs this device opened recently.
@MainActor
@Observable
final class SongLibraryModel {
  let library: QueryState<SongLibrary>
  /// One "now" per visit keeps the list from reshuffling as the clock moves (the web's `now`).
  let now: Date

  var filter: SongLibraryFilter = .default
  var sort: SongLibrarySort = .default
  var searchText = ""

  @ObservationIgnored private var cache: (key: CacheKey, listed: [SongLibraryEntry])?
  @ObservationIgnored let recents = RecentSongsStore.shared

  private struct CacheKey: Equatable {
    var updatedAt: Date?
    var count: Int
    var filter: SongLibraryFilter
    var sort: SongLibrarySort
    var query: String
  }

  /// `RECENT_SHOWN`.
  static let recentShownCount = 4

  init(queries: QueryClient, now: Date, usesMockData: Bool) {
    library = queries.query(.songLibrary, RPC.Songs.library)
    self.now = now
    recents.activate(scope: queries.scope, persists: !usesMockData)
  }

  /// The search as the web runs it: trimmed.
  var query: String { searchText.trimmingCharacters(in: .whitespacesAndNewlines) }

  var isSearching: Bool { !query.isEmpty }

  /// A tidy-up filter (anything but All songs) is on.
  var isTidying: Bool { filter != .all }

  /// The library songs this view lists, in order.
  var listed: [SongLibraryEntry] {
    guard let songs = library.value?.songs else { return [] }
    let key = CacheKey(
      updatedAt: library.updatedAt, count: songs.count, filter: filter, sort: sort, query: query)
    if let cache, cache.key == key { return cache.listed }
    let listed = selectSongLibrary(
      songs, view: SongLibraryView(filter: filter, sort: sort, query: query), now: now)
    cache = (key, listed)
    return listed
  }

  /// The rows to list: a search also finds songs opened on this device that the hour-cached
  /// library doesn't have yet (just added), ahead of the library's matches.
  var rows: [SongRowData] {
    let libraryRows = listed.map(SongRowData.init)
    guard isSearching, filter == .all, let songs = library.value?.songs else { return libraryRows }
    let ids = Set(songs.map(\.id))
    let justAdded = recents.matching(query).filter { !ids.contains($0.id) }.map(SongRowData.init(recent:))
    return justAdded + libraryRows
  }

  /// The rows in sections: by first letter when sorted by title (with a section index), else one
  /// section.
  var sections: [SongLibrarySection] {
    let rows = rows
    guard sort == .title, !isSearching else {
      return rows.isEmpty ? [] : [SongLibrarySection(id: "songs", indexLabel: nil, rows: rows)]
    }
    var sections: [SongLibrarySection] = []
    var current: (letter: String, rows: [SongRowData])?
    for row in rows {
      let letter = Self.indexLetter(row.title)
      if current?.letter == letter {
        current?.rows.append(row)
      } else {
        if let current {
          sections.append(SongLibrarySection(id: current.letter, indexLabel: current.letter, rows: current.rows))
        }
        current = (letter, [row])
      }
    }
    if let current {
      sections.append(SongLibrarySection(id: current.letter, indexLabel: current.letter, rows: current.rows))
    }
    return sections
  }

  /// The recently opened songs to show: only for All songs without a search, with the
  /// library's dates when it has the song.
  var recentRows: [SongRowData] {
    guard !isTidying, !isSearching else { return [] }
    let byId = Dictionary(
      (library.value?.songs ?? []).map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    return recents.songs.prefix(Self.recentShownCount).map { recent in
      byId[recent.id].map(SongRowData.init) ?? SongRowData(recent: recent)
    }
  }

  /// The cutoff an unused filter looks back to.
  var cutoff: Date? { songLibraryCutoff(filter, now: now) }

  /// "34 songs", or what a tidy filter found (the web's `describeView`); nil while searching or
  /// before the library loads.
  func summary(timeZone: String) -> String? {
    guard let songs = library.value?.songs, !isSearching else { return nil }
    let listed = listed
    if filter == .never {
      let verb = listed.count == 1 ? String(localized: "has") : String(localized: "have")
      return String(localized: "\(Self.songCount(listed.count)) \(verb) never been scheduled.")
    }
    guard let cutoff else { return Self.songCount(songs.count) }
    let never = listed.count(where: { $0.lastScheduledAt == nil })
    let cutoffLabel = OrgCalendar.label(cutoff, timeZone: timeZone, style: .monthDayYear)
    let including =
      never > 0
      ? String(localized: ", including \(never.formatted()) never scheduled") : ""
    return String(
      localized:
        "\(listed.count.formatted()) of \(Self.songCount(songs.count)) not used since \(cutoffLabel)\(including)."
    )
  }

  /// "1,234 songs" or "1 song".
  static func songCount(_ count: Int) -> String {
    count == 1 ? String(localized: "1 song") : String(localized: "\(count.formatted()) songs")
  }

  /// The section index letter for a title: its first letter without accents, or "#".
  static func indexLetter(_ title: String) -> String {
    guard let first = title.first else { return "#" }
    let folded = String(first)
      .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US"))
      .uppercased()
    guard let scalar = folded.unicodeScalars.first, folded.unicodeScalars.count == 1,
      (65...90).contains(scalar.value)
    else {
      return "#"
    }
    return folded
  }
}

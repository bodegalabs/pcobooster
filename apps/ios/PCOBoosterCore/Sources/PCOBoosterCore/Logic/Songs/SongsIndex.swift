import Foundation

// Port of apps/web/src/lib/songs-index.ts: the Songs library's filters, sorts, and search over
// the full `songs.library` list. Pinned by the `songs.planningCenterSongUrl`,
// `songs.libraryOptions`, `songs.parseSongLibraryFilter`, `songs.parseSongLibrarySort`,
// `songs.monthsBefore`, `songs.songLibraryCutoff`, and `songs.selectSongLibrary` parity suites.

/// The characters `encodeURIComponent` leaves alone.
private let uriComponentCharacters = CharacterSet(
  charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()")

/// The song in Planning Center Services, where it can be hidden or deleted
/// (`planningCenterSongUrl`).
public func planningCenterSongUrl(_ songId: String) -> String {
  let encoded = songId.addingPercentEncoding(withAllowedCharacters: uriComponentCharacters)
  return "https://services.planningcenteronline.com/songs/\(encoded ?? songId)"
}

/// Which songs the library lists (`songLibraryFilters`, in `allCases` order). The `unused`
/// filters reach back whole calendar months.
public enum SongLibraryFilter: String, CaseIterable, Codable, Hashable, Sendable {
  case all
  case unused6 = "unused-6"
  case unused12 = "unused-12"
  case unused24 = "unused-24"
  case never

  /// `DEFAULT_SONG_LIBRARY_FILTER`.
  public static let `default`: SongLibraryFilter = .all

  public var label: String {
    switch self {
    case .all: "All songs"
    case .unused6: "Unused 6+ months"
    case .unused12: "Unused 1+ year"
    case .unused24: "Unused 2+ years"
    case .never: "Never scheduled"
    }
  }

  /// How many calendar months an `unused` filter looks back; nil for the others.
  public var months: Int? {
    switch self {
    case .unused6: 6
    case .unused12: 12
    case .unused24: 24
    case .all, .never: nil
    }
  }
}

/// How the library orders songs when there is no search (`songLibrarySorts`, in `allCases`
/// order).
public enum SongLibrarySort: String, CaseIterable, Codable, Hashable, Sendable {
  case recent
  case title
  case longest

  /// `DEFAULT_SONG_LIBRARY_SORT`.
  public static let `default`: SongLibrarySort = .recent

  public var label: String {
    switch self {
    case .recent: "Recently used"
    case .title: "Title"
    case .longest: "Longest unused"
    }
  }
}

/// A stored or linked filter value, falling back to every song (`parseSongLibraryFilter`).
public func parseSongLibraryFilter(_ value: String?) -> SongLibraryFilter {
  value.flatMap(SongLibraryFilter.init(rawValue:)) ?? .default
}

/// A stored or linked sort value, falling back to recently used (`parseSongLibrarySort`).
public func parseSongLibrarySort(_ value: String?) -> SongLibrarySort {
  value.flatMap(SongLibrarySort.init(rawValue:)) ?? .default
}

/// `now` moved back `months` calendar months in UTC, clamped to the target month's last day
/// (`monthsBefore`). Like the web, the result keeps the hour and minute and drops seconds.
public func monthsBefore(_ now: Date, months: Int) -> Date {
  let fields = OrgCalendar.localFields(time: JSParity.time(now), in: .gmt)
  // Far beyond any library's reach, and small enough that the date arithmetic can't overflow.
  let monthIndex = fields.month - 1 - min(max(months, -1_000_000), 1_000_000)
  let lastDayTime = OrgCalendar.utcTime(year: fields.year, monthIndex: monthIndex + 1, day: 0)
  let lastDay = OrgCalendar.localFields(time: lastDayTime, in: .gmt).day
  return JSParity.date(
    time: OrgCalendar.utcTime(
      year: fields.year, monthIndex: monthIndex, day: min(fields.day, lastDay),
      hour: fields.hour, minute: fields.minute))
}

/// The instant an `unused` filter looks back to; nil for the other filters
/// (`songLibraryCutoff`).
public func songLibraryCutoff(_ filter: SongLibraryFilter, now: Date) -> Date? {
  filter.months.map { monthsBefore(now, months: $0) }
}

/// What the library shows: a filter, a sort, and a search.
public struct SongLibraryView: Codable, Hashable, Sendable {
  public var filter: SongLibraryFilter
  public var sort: SongLibrarySort
  /// A search ranks matches by relevance instead of `sort`.
  public var query: String

  public init(
    filter: SongLibraryFilter = .default, sort: SongLibrarySort = .default, query: String = ""
  ) {
    self.filter = filter
    self.sort = sort
    self.query = query
  }
}

/// Not on any plan since `cutoff`. A never-scheduled song counts only once it was added before
/// the cutoff, so songs added recently aren't suggested for hiding; one with no dates counts.
private func isUnused(_ song: SongLibraryEntry, since cutoff: Int) -> Bool {
  guard let lastUsed = song.lastScheduledAt ?? song.createdAt else {
    return true
  }
  return JSParity.time(lastUsed) < cutoff
}

/// Orders by an optional time, with a missing time before every present one.
private func compareTimes(_ a: Int?, _ b: Int?) -> Int {
  switch (a, b) {
  case (let a?, let b?): a == b ? 0 : (a < b ? -1 : 1)
  case (nil, nil): 0
  case (nil, _): -1
  case (_, nil): 1
  }
}

private func compareSongs(_ a: SongLibraryEntry, _ b: SongLibraryEntry, sort: SongLibrarySort)
  -> Int
{
  let byTitle = { TitleCollation.compare(a.title, b.title) }
  switch sort {
  case .title:
    return byTitle()
  case .recent:
    // Latest plan first (Planning Center counts upcoming plans); never-scheduled songs last.
    let byDate = compareTimes(
      b.lastScheduledAt.map(JSParity.time), a.lastScheduledAt.map(JSParity.time))
    return byDate != 0 ? byDate : byTitle()
  case .longest:
    // Never-scheduled songs first, oldest added first, then the longest since used.
    let aNever = a.lastScheduledAt == nil
    let bNever = b.lastScheduledAt == nil
    if aNever != bNever {
      return aNever ? -1 : 1
    }
    let byDate =
      aNever
      ? compareTimes(a.createdAt.map(JSParity.time), b.createdAt.map(JSParity.time))
      : compareTimes(a.lastScheduledAt.map(JSParity.time), b.lastScheduledAt.map(JSParity.time))
    return byDate != 0 ? byDate : byTitle()
  }
}

/// The songs a library view lists, in the order it lists them (`selectSongLibrary`). Titles
/// compare as the web's `localeCompare` does; a search scores with `scoreSongSearch` and
/// lists only matches, best first.
public func selectSongLibrary(
  _ songs: [SongLibraryEntry], view: SongLibraryView, now: Date
) -> [SongLibraryEntry] {
  let cutoff = songLibraryCutoff(view.filter, now: now).map(JSParity.time)
  let listed = songs.filter { song in
    if view.filter == .never {
      return song.lastScheduledAt == nil
    }
    guard let cutoff else {
      return true
    }
    return isUnused(song, since: cutoff)
  }
  let query = JSParity.trim(view.query)
  if query.isEmpty {
    return PlanLogic.stableSorted(listed) { compareSongs($0, $1, sort: view.sort) < 0 }
  }
  let scored = listed.compactMap { song -> (song: SongLibraryEntry, score: Int)? in
    let searchable = SearchableSong(
      title: song.title, author: song.author, themes: song.themes,
      lastScheduledAt: song.lastScheduledAt)
    let score = scoreSongSearch(searchable, query: query, now: now)
    return score > 0 ? (song, score) : nil
  }
  return PlanLogic.stableSorted(scored) { a, b in
    if a.score != b.score {
      return a.score > b.score
    }
    return TitleCollation.compare(a.song.title, b.song.title) < 0
  }
  .map(\.song)
}

import Foundation
import Observation
import PCOBoosterCore

/// The Search tab's state: the field, the scope, the plan catalog, recent searches, and the two
/// server searches (`people.search` and `songs.search`, both unflagged).
///
/// Plans match on every keystroke (they are already on the device). Server searches wait for
/// the query to settle (`settleDelay`), go out once per normalized query, and keep showing the
/// previous answer, dimmed, while the next one loads, like the web's `placeholderData`.
@MainActor
@Observable
final class SearchModel {
  /// How long typing must pause before a server search goes out.
  static let settleDelay: Duration = .milliseconds(300)
  /// `people.search` needs at least two characters (`peopleSearchInputSchema`).
  static let minimumPeopleQuery = 2

  var text = ""
  var scope: SearchScope = .all
  /// The person whose blockouts sheet is open (when the People dashboard is off).
  var presentedPerson: SearchPerson?

  let catalog: SearchCatalog
  let recents: RecentSearches

  /// The normalized query the server searches last went out for.
  private(set) var settledQuery = ""
  private(set) var people: QueryState<[PeopleSearchResult]>?
  private(set) var songs: QueryState<[SongCatalogEntry]>?
  private var previousPeople: [PeopleSearchResult] = []
  private var previousSongs: [SongCatalogEntry] = []
  @ObservationIgnored private let queries: QueryClient

  init(queries: QueryClient) {
    self.queries = queries
    catalog = SearchCatalog(queries: queries)
    recents = RecentSearches(scopeID: queries.scope.id)
  }

  // MARK: Query

  var trimmedText: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

  var isSearching: Bool { !trimmedText.isEmpty }

  /// Sends the server searches for the current text (after the view's settle delay).
  func settle(canSearchPeople: Bool) {
    let query = PlanSearch.normalized(text)
    settledQuery = query

    if canSearchPeople, query.count >= Self.minimumPeopleQuery {
      let key = QueryKey.peopleSearch(query: query)
      if people?.key != key {
        if let value = people?.value { previousPeople = value }
        people?.disappear()
        people = queries.query(key, RPC.People.search, PeopleSearchInput(query: query))
      }
    } else {
      people?.disappear()
      people = nil
      previousPeople = []
    }

    if !query.isEmpty {
      let key = QueryKey.songSearch(query: query)
      if songs?.key != key {
        if let value = songs?.value { previousSongs = value }
        songs?.disappear()
        songs = queries.query(key, RPC.Songs.search, SongsSearchInput(query: query))
      }
    } else {
      songs?.disappear()
      songs = nil
      previousSongs = []
    }
  }

  /// The text no longer matches what the server searched (typing, before it settles).
  var isAwaitingSettle: Bool { PlanSearch.normalized(text) != settledQuery }

  // MARK: Results

  /// Plans matching the text, soonest upcoming first, then the most recent past ones.
  func planHits(now: Date, timeZone: String) -> [PlanHit] {
    let query = trimmedText
    let matches = catalog.rows.filter { PlanSearch.matches($0, query: query, timeZone: timeZone) }
    return PlanSearch.ordered(matches, now: now, timeZone: timeZone)
  }

  /// The next plans from today, for the suggestions.
  func upcomingPlans(now: Date, timeZone: String, limit: Int) -> [PlanHit] {
    Array(PlanSearch.ordered(catalog.rows, now: now, timeZone: timeZone).prefix { $0.isUpcoming }.prefix(limit))
  }

  var peopleSection: ServerSection<PeopleSearchResult> {
    ServerSection(state: people, previous: previousPeople, isAwaitingSettle: isAwaitingSettle)
  }

  var songsSection: ServerSection<SongCatalogEntry> {
    ServerSection(state: songs, previous: previousSongs, isAwaitingSettle: isAwaitingSettle)
  }

  // MARK: Lifecycle

  func appear() {
    catalog.appear()
    people?.appear()
    songs?.appear()
  }

  func disappear() {
    catalog.disappear()
    people?.disappear()
    songs?.disappear()
  }

  /// Pull to refresh: plans and the current searches, together.
  func refresh() async {
    let catalog = catalog
    let people = people
    let songs = songs
    await withTaskGroup(of: Void.self) { group in
      group.addTask { await catalog.refresh() }
      if let people { group.addTask { await people.refresh() } }
      if let songs { group.addTask { await songs.refresh() } }
    }
  }
}

/// One server-searched section as the list shows it.
struct ServerSection<Item: Codable & Sendable> {
  enum Phase {
    /// No search for this section (too short, or not allowed).
    case idle
    /// The first answer for this query is on its way and nothing else can stand in.
    case loading
    /// Results to show; `isStale` while a newer query loads behind them.
    case results([Item], isStale: Bool)
    /// The search answered with nothing.
    case empty
    case failed(String)
  }

  let phase: Phase
  let retry: (() -> Void)?

  @MainActor
  init(state: QueryState<[Item]>?, previous: [Item], isAwaitingSettle: Bool) {
    retry = state.map { state in { state.retry() } }
    guard let state else {
      phase = .idle
      return
    }
    if let value = state.value {
      if value.isEmpty {
        phase = isAwaitingSettle && !previous.isEmpty ? .results(previous, isStale: true) : .empty
      } else {
        phase = .results(value, isStale: isAwaitingSettle || state.isRefreshing)
      }
    } else if state.status == .failure {
      phase = .failed(state.errorMessage ?? String(localized: "Search failed."))
    } else if !previous.isEmpty {
      phase = .results(previous, isStale: true)
    } else {
      phase = .loading
    }
  }

  var items: [Item] {
    if case .results(let items, _) = phase { items } else { [] }
  }

  var isLoading: Bool {
    switch phase {
    case .loading: true
    case .results(_, let isStale): isStale
    default: false
    }
  }
}

import Foundation
import Observation
import PCOBoosterCore

/// The People dashboard's data, the native counterpart of `usePeopleDashboard`:
///
/// 1. The roster (`people.dashboardRoster`) loads first and paints from disk on a cold launch.
/// 2. The scope (Teams I lead, All teams, or one team) picks its people in roster order. A
///    team scope loads whole up to 160 people; anything bigger, and All teams, loads the first
///    48, and "Load more" adds 48 at a time. Nothing loads more on its own as you scroll.
/// 3. Activity loads in calls of 16 people, at most two in flight across the whole screen,
///    each following its continuation and cached under its own key.
/// 4. A search filters the whole scope at once; when typing pauses for 400 ms, it asks for the
///    unloaded matches (16 at a time) ahead of the rest of the sample.
///
/// Team health, signals, and the month are pure functions of what has loaded so far
/// (`assemblePeopleDashboard`, `TeamHealthEngine`), recomputed as each call answers.
@MainActor
@Observable
final class PeopleDashboardModel {
  /// A search's own activity calls, for the scope and settled query they were asked in.
  private struct SearchLoad {
    var scope: PeopleDashboardScope?
    var query: String
    var batches: [[String]]
  }

  /// "Load more" belongs to the scope it was asked in.
  private struct ExtraPeople {
    var scope: PeopleDashboardScope?
    var count: Int
  }

  // MARK: Inputs

  let roster: QueryState<PeopleDashboardRoster>
  @ObservationIgnored private let queries: QueryClient
  @ObservationIgnored private let scopeStore: PeopleScopeStore
  @ObservationIgnored private let clock: AppClock

  /// The congregation's zone; health signals count calendar days in it.
  var timeZone: String {
    didSet {
      if oldValue != timeZone { recompute() }
    }
  }

  /// The scope the viewer picked (saved per account); nil means the roster's default.
  private(set) var scopeChoice: PeopleDashboardScope?

  /// What the search field holds. Matches filter immediately; loading waits for a pause.
  var searchText = "" {
    didSet {
      if oldValue != searchText { searchTextChanged() }
    }
  }

  @ObservationIgnored private var extraPeople = ExtraPeople(scope: nil, count: 0)
  @ObservationIgnored private var searchLoad = SearchLoad(scope: nil, query: "", batches: [])
  @ObservationIgnored private var settledQuery = ""
  @ObservationIgnored private var settleTask: Task<Void, Never>?
  @ObservationIgnored private var batches: [[String]: ActivityBatchState] = [:]
  @ObservationIgnored private var scopePersonIds: [String] = []
  @ObservationIgnored private var sampleBatches: [[String]] = []
  @ObservationIgnored private var samplePeopleCount = 0

  // MARK: Outputs

  /// The dashboard as far as activity has loaded; nil until the roster arrives.
  private(set) var dashboard: PeopleDashboardData?
  /// Health of the sample's loaded members.
  private(set) var health = PeopleDashboardModel.emptyHealth
  /// The org's calendar day the signals are judged on.
  private(set) var todayKey = ""
  /// Scope rows matching the search, in roster order; empty without a search.
  private(set) var searchRows: [PeopleDashboardRow] = []
  /// Signals for every loaded scope person, for search results beyond the sample.
  private(set) var searchSignals: [String: [PersonSignal]] = [:]
  /// Search matches nobody has asked activity for yet (counted once typing settles).
  private(set) var unrequestedMatchCount = 0
  /// Activity is still on its way for the sample.
  private(set) var isLoadingSample = false
  /// Some planned call has no answer yet.
  private(set) var isLoadingActivity = false
  /// A call is in flight right now.
  private(set) var isFetchingActivity = false
  private(set) var failedBatchCount = 0
  private(set) var canLoadMore = false

  static let emptyHealth = TeamHealthEngine.computeTeamHealth([], teams: [], todayKey: "")

  init(queries: QueryClient, clock: AppClock, timeZone: String) {
    self.queries = queries
    self.clock = clock
    self.timeZone = timeZone
    scopeStore = PeopleScopeStore(scope: queries.scope)
    if let scope = PeopleLaunchOverrides.takeScope() {
      scopeStore.save(scope)
    }
    scopeChoice = scopeStore.load()
    roster = queries.query(.peopleDashboardRoster, RPC.People.dashboardRoster)
    rosterChanged()
    observeRoster()
  }

  // MARK: Derived reads

  /// The scope in effect: the viewer's choice, else Teams I lead when they lead any.
  var scope: PeopleDashboardScope {
    scopeChoice ?? roster.value.map(defaultPeopleDashboardScope) ?? .all
  }

  /// "All teams", "Teams you lead", or the one team's label.
  var scopeLabel: String {
    guard let dashboard else {
      return scope == .all ? "All teams" : (roster.value == nil ? "Your teams" : "Teams you lead")
    }
    return PeopleScreens.describeScope(scope, teams: dashboard.teams, ledTeamIds: dashboard.ledTeamIds)
  }

  /// The search, trimmed and lowercased; empty means no search.
  var normalizedQuery: String { normalizePeopleQuery(searchText) }

  var isSearching: Bool { !normalizedQuery.isEmpty }

  /// The roster has not answered yet and nothing is saved.
  var isRosterLoading: Bool { roster.value == nil && roster.status != .failure }

  /// The roster failed with nothing to show.
  var isRosterFailed: Bool { roster.value == nil && roster.status == .failure }

  /// People the Month view shows: the search's loaded matches, or the sample's members.
  var monthPeople: [PeopleDashboardPerson] {
    if isSearching {
      return searchRows.compactMap(\.member)
    }
    return dashboard?.members ?? []
  }

  /// The org day of the dashboard month, when today falls in it.
  var todayInMonth: Int? {
    guard let month = dashboard?.month else { return nil }
    return PeopleScreens.todayInMonth(todayKey: todayKey, month: month)
  }

  // MARK: Actions

  func select(scope: PeopleDashboardScope) {
    guard scope != self.scope || scopeChoice == nil else { return }
    scopeChoice = scope
    scopeStore.save(scope)
    replan()
    updateSearchLoad()
  }

  /// Adds the next 48 people of the scope to the sample.
  func loadMore() {
    guard canLoadMore else { return }
    let current = extraPeople.scope == scope ? extraPeople.count : 0
    extraPeople = ExtraPeople(scope: scope, count: current + PeopleDashboardConstants.sampleSize)
    replan()
  }

  /// Asks for the next 16 unloaded search matches.
  func loadMoreMatches() {
    guard dashboard != nil else { return }
    let ids = unrequestedMatchIds(searchRows, normalizedQuery: normalizedQuery, requestedIds: requestedIds)
    guard
      let next = chunkPersonIds(ids, batchSize: PeopleDashboardConstants.activityBatchSize).first
    else {
      return
    }
    searchLoad = SearchLoad(scope: scope, query: settledQuery, batches: currentSearchBatches + [next])
    replan()
  }

  /// Retries every planned call that failed.
  func retryFailed() {
    for ids in plannedBatches where batches[ids]?.phase == .failed {
      batches[ids]?.phase = .waiting
    }
    pump()
    recompute()
  }

  /// Pull to refresh: the roster and every planned call load again (still two at a time).
  func refresh() async {
    queries.invalidate([.family(.peopleDashboardActivity)], refetchActive: false)
    for ids in plannedBatches where batches[ids]?.phase != .loading {
      batches[ids]?.phase = .waiting
    }
    pump()
    recompute()
    await roster.refresh()
  }

  /// The screen is showing again: the roster revalidates, and calls older than their stale time
  /// load again behind the values on screen.
  func appear() {
    roster.appear()
    revalidateStaleBatches()
  }

  func disappear() {
    roster.disappear()
  }

  /// Loads a person's detail ahead of opening it, on a deliberate long press only.
  func prefetchPerson(_ personId: String) {
    queries.prefetch(
      .peopleDashboardPerson(personId: personId, month: nil), RPC.People.dashboardPerson,
      PeopleDashboardPersonInput(personId: personId))
  }

  // MARK: Planning

  private var currentSearchBatches: [[String]] {
    searchLoad.scope == scope ? searchLoad.batches : []
  }

  private var plannedBatches: [[String]] { sampleBatches + currentSearchBatches }

  private var requestedIds: Set<String> { Set(plannedBatches.flatMap(\.self)) }

  private func observeRoster() {
    withObservationTracking {
      _ = roster.value
    } onChange: { [weak self] in
      Task { @MainActor [weak self] in
        self?.rosterChanged()
        self?.observeRoster()
      }
    }
  }

  private func rosterChanged() {
    if let roster = roster.value, let choice = scopeChoice, !choice.isValid(for: roster) {
      scopeChoice = nil
      scopeStore.save(nil)
    }
    replan()
    updateSearchLoad()
  }

  /// Plans the sample's calls for the scope and starts what fits.
  private func replan() {
    guard let roster = roster.value else {
      scopePersonIds = []
      sampleBatches = []
      samplePeopleCount = 0
      recompute()
      return
    }
    scopePersonIds = resolveScopePersonIds(roster, scope: scope)
    samplePeopleCount = peopleDashboardSampleCount(
      scope: scope, scopePeopleCount: scopePersonIds.count,
      extraPeopleCount: extraPeople.scope == scope ? extraPeople.count : 0)
    sampleBatches = planPeopleDashboardBatches(
      scopePersonIds, targetPeopleCount: samplePeopleCount,
      batchSize: PeopleDashboardConstants.activityBatchSize)
    for ids in plannedBatches where batches[ids] == nil {
      // Saved activity paints before its call goes out (the web's `hydrateQueryFromCache`).
      batches[ids] = ActivityBatchState(
        activities: queries.value(
          for: .peopleDashboardActivity(personIds: ids), as: [PeopleDashboardActivity].self))
    }
    pump()
    recompute()
  }

  /// Starts waiting calls in order (calls under way, then search matches, then the rest of the
  /// sample) while fewer than two are in flight anywhere on the screen.
  private func pump() {
    let order = orderActivityBatches(sample: sampleBatches, search: currentSearchBatches) {
      batches[$0]?.hasStarted == true
    }
    var inFlight = batches.values.count { $0.phase == .loading }
    for ids in order where inFlight < PeopleDashboardConstants.batchConcurrency {
      guard batches[ids]?.phase == .waiting else { continue }
      start(ids)
      inFlight += 1
    }
  }

  private func start(_ ids: [String]) {
    batches[ids]?.phase = .loading
    let key = QueryKey.peopleDashboardActivity(personIds: ids)
    let queries = queries
    Task { [weak self] in
      do {
        let people = try await queries.fetch(key) { rpc in
          try await ActivityLoader.load(rpc, personIds: ids)
        }
        self?.finish(ids, people: people, error: nil)
      } catch {
        self?.finish(ids, people: nil, error: error)
      }
    }
  }

  private func finish(_ ids: [String], people: [PeopleDashboardActivity]?, error: (any Error)?) {
    guard var state = batches[ids] else { return }
    if let people {
      state.activities = people
      state.phase = .loaded
      state.error = nil
      state.loadedAt = Date.now
    } else if let error, !error.isCancellation {
      state.phase = .failed
      state.error = error
    } else {
      state.phase = .waiting
    }
    batches[ids] = state
    pump()
    recompute()
  }

  private func revalidateStaleBatches() {
    let staleTime = QueryFamily.peopleDashboardActivity.policy.staleTime ?? .seconds(120)
    let staleAfter = Double(staleTime.components.seconds)
    var changed = false
    for ids in plannedBatches {
      guard let state = batches[ids], state.phase == .loaded,
        let loadedAt = state.loadedAt, Date.now.timeIntervalSince(loadedAt) >= staleAfter
      else {
        continue
      }
      batches[ids]?.phase = .waiting
      changed = true
    }
    if changed {
      pump()
      recompute()
    }
  }

  // MARK: Search

  private func searchTextChanged() {
    recomputeSearch()
    settleTask?.cancel()
    let query = normalizedQuery
    settleTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(400))
      guard !Task.isCancelled else { return }
      self?.settle(query)
    }
  }

  private func settle(_ query: String) {
    settledQuery = query
    updateSearchLoad()
    recomputeSearch()
  }

  /// A settled search asks once for its first unloaded matches, per scope and query.
  private func updateSearchLoad() {
    guard let dashboard, searchLoad.scope != scope || searchLoad.query != settledQuery else {
      return
    }
    let next = Array(
      unrequestedMatchIds(dashboard.scopeRows, normalizedQuery: settledQuery, requestedIds: requestedIds)
        .prefix(PeopleDashboardConstants.activityBatchSize))
    let current = currentSearchBatches
    searchLoad = SearchLoad(
      scope: scope, query: settledQuery, batches: next.isEmpty ? current : current + [next])
    replan()
  }

  // MARK: Assembly

  private func recompute() {
    todayKey = OrgCalendar.dayKey(clock.now, timeZone: timeZone)
    guard let roster = roster.value else {
      dashboard = nil
      health = Self.emptyHealth
      isLoadingSample = false
      isLoadingActivity = false
      isFetchingActivity = false
      failedBatchCount = 0
      canLoadMore = false
      recomputeSearch()
      return
    }
    let planned = plannedBatches
    let failedIds = Set(planned.filter { batches[$0]?.phase == .failed }.flatMap(\.self))
    let activities = planned.flatMap { batches[$0]?.activities ?? [] }
    let data = assemblePeopleDashboard(
      roster, activities: activities, scopePersonIds: scopePersonIds,
      samplePeopleCount: samplePeopleCount,
      loadingPersonIds: requestedIds.subtracting(failedIds))
    dashboard = data
    health = TeamHealthEngine.computeTeamHealth(data.members, teams: data.teams, todayKey: todayKey)
    isLoadingSample = sampleBatches.contains { batches[$0]?.isSettled != true }
    isLoadingActivity = planned.contains { batches[$0]?.isPending ?? true }
    isFetchingActivity = batches.values.contains { $0.phase == .loading }
    failedBatchCount = planned.count { batches[$0]?.phase == .failed }
    canLoadMore = !isLoadingSample && samplePeopleCount < scopePersonIds.count
    PeopleSessionCache.record(roster: roster, activities: activities, scope: queries.scope)
    recomputeSearch()
  }

  private func recomputeSearch() {
    let query = normalizedQuery
    guard let dashboard, !query.isEmpty else {
      searchRows = []
      searchSignals = [:]
      unrequestedMatchCount = 0
      return
    }
    searchRows = dashboard.scopeRows.filter { matchesPeopleQuery($0, normalizedQuery: query) }
    searchSignals = TeamHealthEngine.computePersonSignals(
      dashboard.scopeRows.compactMap(\.member), teams: dashboard.teams, todayKey: todayKey)
    unrequestedMatchCount =
      settledQuery == query
      ? unrequestedMatchIds(searchRows, normalizedQuery: query, requestedIds: requestedIds).count
      : 0
  }
}

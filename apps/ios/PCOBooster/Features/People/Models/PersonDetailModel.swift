import Foundation
import Observation
import PCOBoosterCore

/// One person's month (`people.dashboardPerson`) and future blockouts (`people.blockouts`),
/// the native counterpart of `usePeopleDashboardPerson` plus the blockouts the web never shows.
///
/// - The first frame paints from what the dashboard already loaded for them
///   (`personDetailPlaceholder`), so opening a person never flashes a skeleton when the
///   dashboard knows them.
/// - Paging months keeps the month on screen (dimmed) until the next one answers.
/// - Roster teams and team pace come from the dashboard (`personDashboardContext`), so the
///   person page shows the same teams and judges the same heavy load.
@MainActor
@Observable
final class PersonDetailModel {
  let personId: String
  /// `YYYY-MM`, or nil for the current month.
  private(set) var monthKey: String?
  private(set) var detailState: QueryState<PeopleDashboardPersonDetail>
  let blockouts: QueryState<[Blockout]>
  /// What the dashboard knows about them (roster teams and team pace).
  let context: PersonDashboardContext
  /// +1 after paging forward, -1 after paging back, for the calendar's slide.
  private(set) var pagingDirection = 0

  @ObservationIgnored private let queries: QueryClient
  @ObservationIgnored private let cachedDashboards: [PeopleDashboardData]
  @ObservationIgnored private var previousDetail: PeopleDashboardPersonDetail?
  @ObservationIgnored private var isVisible = true

  init(personId: String, month: String?, queries: QueryClient) {
    self.personId = personId
    self.queries = queries
    let month = month.flatMap { $0.isEmpty ? nil : $0 }
    monthKey = month
    let dashboard = PeopleSessionCache.dashboard(queries: queries)
    cachedDashboards = dashboard.map { [$0] } ?? []
    context = personDashboardContext(dashboard, personId: personId)
    detailState = Self.detailQuery(queries, personId: personId, month: month)
    blockouts = queries.query(
      .blockouts(personId: personId), RPC.People.blockouts,
      PeopleBlockoutsInput(personId: personId))
  }

  private static func detailQuery(_ queries: QueryClient, personId: String, month: String?)
    -> QueryState<PeopleDashboardPersonDetail>
  {
    queries.query(
      .peopleDashboardPerson(personId: personId, month: month), RPC.People.dashboardPerson,
      PeopleDashboardPersonInput(personId: personId, month: month))
  }

  // MARK: Reads

  /// The detail to show: the answer for this month, else the placeholder chain.
  var detail: PeopleDashboardPersonDetail? {
    if let value = detailState.value {
      return value
    }
    return personDetailPlaceholder(
      from: cachedDashboards, personId: personId, month: monthKey, previous: previousDetail)
  }

  /// Showing a stand-in (the dashboard's copy, or the previous month) while the month loads.
  var isShowingPlaceholder: Bool { detailState.value == nil && detail != nil }

  /// The month is loading behind whatever is on screen.
  var isLoadingMonth: Bool {
    detailState.isLoading || detailState.isRefreshing || isShowingPlaceholder
  }

  /// The month failed to load.
  var errorMessage: String? {
    detailState.status == .failure ? (detailState.errorMessage ?? "Person details failed to load.") : nil
  }

  /// Their name as soon as anything knows it.
  var name: String? {
    detail?.person.name ?? context.rosterPerson?.name
      ?? PeopleSessionCache.rosterPerson(personId, queries: queries)?.name
  }

  /// Roster teams as the dashboard shows them; else the teams they served on lately.
  var teams: [String] {
    context.rosterPerson?.teams ?? detail?.person.teams ?? []
  }

  /// "Band, Vocals · Keys, Acoustic Guitar": their teams, then their most common positions.
  var subtitle: String {
    [teams.joined(separator: ", "), (detail?.person.roles ?? []).joined(separator: ", ")]
      .filter { !$0.isEmpty }
      .joined(separator: PeopleScreens.separator)
  }

  func signals(todayKey: String) -> [PersonSignal] {
    guard let rhythm = detail?.person.rhythm else { return [] }
    return TeamHealthEngine.personSignals(rhythm, todayKey: todayKey, teamPace: context.teamPace)
  }

  // MARK: Actions

  /// Shows the month `key` ("YYYY-MM"), keeping this one on screen until it answers.
  func showMonth(_ key: String, direction: Int) {
    guard key != monthKey else { return }
    previousDetail = detail
    pagingDirection = direction
    detailState.disappear()
    monthKey = key
    detailState = Self.detailQuery(queries, personId: personId, month: key)
    if !isVisible {
      detailState.disappear()
    }
  }

  func showPreviousMonth() {
    guard let key = detail?.previousMonth else { return }
    showMonth(key, direction: -1)
  }

  func showNextMonth() {
    guard let key = detail?.nextMonth else { return }
    showMonth(key, direction: 1)
  }

  func retry() {
    detailState.retry()
    if blockouts.status == .failure {
      blockouts.retry()
    }
  }

  func refresh() async {
    let detailState = detailState
    let blockouts = blockouts
    async let detailRefresh: Void = detailState.refresh()
    async let blockoutsRefresh: Void = blockouts.refresh()
    _ = await (detailRefresh, blockoutsRefresh)
  }

  func appear() {
    isVisible = true
    detailState.appear()
    blockouts.appear()
  }

  func disappear() {
    isVisible = false
    detailState.disappear()
    blockouts.disappear()
  }
}

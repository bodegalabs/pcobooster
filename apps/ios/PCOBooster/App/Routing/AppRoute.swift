import PCOBoosterCore
import SwiftUI

/// A top-level section: one tab on iPhone, one sidebar row on iPad. People and Songs appear only
/// when their feature flag is on (`AppCapabilities.visibleTabs`).
enum AppTab: String, CaseIterable, Hashable, Sendable, Identifiable {
  case services
  case people
  case songs
  case search

  var id: String { rawValue }

  var title: LocalizedStringResource {
    switch self {
    case .services: "Services"
    case .people: "People"
    case .songs: "Songs"
    case .search: "Search"
    }
  }

  var symbol: AppSymbol {
    switch self {
    case .services: .services
    case .people: .people
    case .songs: .songs
    case .search: .search
    }
  }

  /// The screen event for this tab's root.
  var analyticsScreen: AnalyticsScreen {
    switch self {
    case .services: .services
    case .people: .people
    case .songs: .songs
    case .search: .other
    }
  }

  /// The flag that must be on for this tab to show.
  var requiredFeature: FeatureFlagName? {
    switch self {
    case .people: .people
    case .songs: .chordCharts
    case .services, .search: nil
    }
  }
}

/// Every screen a tab can push. One `navigationDestination` (`appRouteDestinations()`) maps each
/// case to its view, in every tab, so any screen can push any route: a person from the lineup
/// stays in the Services stack, and Back returns to the lineup.
enum AppRoute: Hashable, Codable, Sendable {
  /// A plan, opening on `route.view` (`.assign` opens on Lineup; push `.assign` for Assign).
  case plan(PlanRoute)
  /// Assign for one position of a plan; nil ids open on the first open position.
  case assign(PlanRoute, teamId: String?, positionId: String?)
  /// A person's detail, on `month` (`YYYY-MM`) or the current month. Needs the `people` flag.
  case person(id: String, month: String?)
  /// A song's facts (keys, history, arrangements). No flag: the run sheet links here.
  case song(id: String)
  /// The chord chart editor for a song, on `arrangementId` or its first arrangement. Needs the
  /// `chordCharts` flag.
  case chordChart(songId: String, arrangementId: String?)

  /// The tab this route belongs to when opened from outside a tab (a deep link, Search).
  var owningTab: AppTab {
    switch self {
    case .plan, .assign: .services
    case .person: .people
    case .song, .chordChart: .songs
    }
  }

  /// The flag that must be on for this screen; the destination shows "not available" when off.
  var requiredFeature: FeatureFlagName? {
    switch self {
    case .person: .people
    case .chordChart: .chordCharts
    case .plan, .assign, .song: nil
    }
  }

  /// The screen event, sent when the route appears. Nil for `.plan`, whose segments send their
  /// own (`PlanScreen` tracks `.plan(segment.view)`).
  var analyticsScreen: AnalyticsScreen? {
    switch self {
    case .plan: nil
    case .assign: .plan(.assign)
    case .person: .person
    case .song, .chordChart: .song
    }
  }

  /// The web-style path, for feedback reports and debugging (ids included; never sent to
  /// analytics).
  var path: String {
    switch self {
    case .plan(let route): route.path
    case .assign(let route, _, _):
      PlanRoute(serviceTypeId: route.serviceTypeId, planId: route.planId, view: .assign).path
    case .person(let id, let month): month.map { "/people/\(id)?month=\($0)" } ?? "/people/\(id)"
    case .song(let id): "/songs/\(id)"
    case .chordChart(let songId, let arrangementId):
      arrangementId.map { "/songs/\(songId)/chart?arrangement=\($0)" } ?? "/songs/\(songId)/chart"
    }
  }
}

/// Navigation state for the whole app: the selected tab, each tab's stack, and the account sheet.
/// Read it with `@Environment(AppRouter.self) private var router`.
///
/// ```swift
/// router.push(.assign(context.route, teamId: team.id, positionId: position.id))
/// router.open(.person(id: person.id, month: nil))   // switches to People when the flag is on
/// ```
@MainActor
@Observable
final class AppRouter {
  var selectedTab: AppTab = .services
  var servicesPath: [AppRoute] = []
  var peoplePath: [AppRoute] = []
  var songsPath: [AppRoute] = []
  var searchPath: [AppRoute] = []
  /// The tab whose root presents the account sheet; nil when it is closed.
  var accountSheetTab: AppTab?

  init() {}

  // MARK: Stacks

  func path(for tab: AppTab) -> [AppRoute] {
    switch tab {
    case .services: servicesPath
    case .people: peoplePath
    case .songs: songsPath
    case .search: searchPath
    }
  }

  func setPath(_ path: [AppRoute], for tab: AppTab) {
    switch tab {
    case .services: servicesPath = path
    case .people: peoplePath = path
    case .songs: songsPath = path
    case .search: searchPath = path
    }
  }

  func binding(for tab: AppTab) -> Binding<[AppRoute]> {
    Binding(get: { self.path(for: tab) }, set: { self.setPath($0, for: tab) })
  }

  /// Pushes `route` onto the selected tab's stack. The usual way to drill in.
  func push(_ route: AppRoute) {
    push(route, in: selectedTab)
  }

  func push(_ route: AppRoute, in tab: AppTab) {
    setPath(path(for: tab) + [route], for: tab)
  }

  /// Switches to `route`'s owning tab and pushes it there, for deep links and cross-section
  /// jumps. Falls back to the selected tab when the owning tab is hidden by a flag.
  func open(_ route: AppRoute, visibleTabs: [AppTab]) {
    let tab = visibleTabs.contains(route.owningTab) ? route.owningTab : selectedTab
    selectedTab = tab
    push(route, in: tab)
  }

  /// Replaces a tab's stack and selects it.
  func show(_ tab: AppTab, path: [AppRoute] = []) {
    setPath(path, for: tab)
    selectedTab = tab
  }

  func pop() {
    var current = path(for: selectedTab)
    guard !current.isEmpty else { return }
    current.removeLast()
    setPath(current, for: selectedTab)
  }

  func popToRoot(_ tab: AppTab? = nil) {
    setPath([], for: tab ?? selectedTab)
  }

  /// Clears every stack and closes the account sheet (sign-out, account switch).
  func reset() {
    servicesPath = []
    peoplePath = []
    songsPath = []
    searchPath = []
    accountSheetTab = nil
  }

  // MARK: Account sheet

  func presentAccount() {
    accountSheetTab = selectedTab
  }

  func dismissAccount() {
    accountSheetTab = nil
  }

  // MARK: Reading

  /// The plan open in the Services stack (its topmost plan or Assign), if any.
  var openPlan: PlanRoute? {
    for route in servicesPath.reversed() {
      switch route {
      case .plan(let plan): return plan
      case .assign(let plan, _, _): return plan
      default: continue
      }
    }
    return nil
  }

  /// The visible screen's path (`/services/1101/plans/881261004/lineup`), for feedback reports.
  var currentPath: String {
    if let route = path(for: selectedTab).last { return route.path }
    return "/\(selectedTab.rawValue)"
  }

  /// Keeps the selection on a visible tab when flags change.
  func ensureVisible(_ visibleTabs: [AppTab]) {
    if !visibleTabs.contains(selectedTab) {
      selectedTab = .services
    }
  }
}

import CryptoKit
import Foundation
import Observation
import PCOBoosterCore

/// The Services agenda's reads and filters (the web's `useServicePlanSelection`):
/// - `catalog.serviceTypes`, then `catalog.plans` for each selected service type (the list
///   call only; nothing is fanned out per plan),
/// - `people.myScheduledPlans` for "Your services" and "You're on",
/// - recent plans, on request: one `catalog.adjacentPlans` lookup back from each selected
///   service type's first upcoming plan.
///
/// The service type selection and the upcoming window are remembered per account.
@MainActor
@Observable
final class ServicesHomeModel {
  let serviceTypes: QueryState<[ServiceType]>
  let myPlans: QueryState<MyScheduledPlansData>
  private(set) var planStates: [String: QueryState<[Plan]>] = [:]
  private(set) var recentStates: [String: QueryState<[Plan]>] = [:]
  var searchText = ""
  var window: ServicesDateWindow {
    didSet {
      guard window != oldValue else { return }
      save()
      syncQueries()
    }
  }
  /// Chosen service type ids; nil means all of them (the web's stored `null`).
  private(set) var storedSelection: [String]?
  /// Everything selected has answered once; later loads keep the rows on screen.
  private(set) var hasLoaded = false

  @ObservationIgnored private let queries: QueryClient
  @ObservationIgnored private let defaults: UserDefaults
  @ObservationIgnored private let storageKey: String
  @ObservationIgnored private var isVisible = true

  init(queries: QueryClient, scope: QueryScope, defaults: UserDefaults = .standard) {
    self.queries = queries
    self.defaults = defaults
    storageKey = Self.storageKey(for: scope)
    let saved = Self.load(defaults: defaults, key: storageKey)
    storedSelection = saved?.serviceTypeIds
    window = saved?.window ?? .default
    serviceTypes = queries.query(.serviceTypes, RPC.Catalog.serviceTypes)
    myPlans = queries.query(.myScheduledPlans, RPC.People.myScheduledPlans)
    syncQueries()
    markLoadedIfReady()
  }

  // MARK: Service types

  var allServiceTypes: [ServiceType] { serviceTypes.value ?? [] }

  /// The selection, limited to service types that still exist.
  var selectedIds: Set<String> {
    let all = Set(allServiceTypes.map(\.id))
    guard let storedSelection else { return all }
    return Set(storedSelection).intersection(all)
  }

  var selectsAllServiceTypes: Bool {
    selectedIds.count == allServiceTypes.count
  }

  func isSelected(_ serviceType: ServiceType) -> Bool {
    selectedIds.contains(serviceType.id)
  }

  func setSelected(_ serviceType: ServiceType, _ isOn: Bool) {
    var ids = allServiceTypes.map(\.id).filter(selectedIds.contains)
    if isOn {
      ids.append(serviceType.id)
    } else {
      ids.removeAll { $0 == serviceType.id }
    }
    storedSelection = ids.count == allServiceTypes.count ? nil : ids
    save()
    syncQueries()
  }

  func selectAllServiceTypes() {
    storedSelection = nil
    save()
    syncQueries()
  }

  func selectNoServiceTypes() {
    storedSelection = []
    save()
    syncQueries()
  }

  /// "All service types", one or two names, or "3 service types" (the web's filter label).
  var serviceTypeSummary: String {
    let all = allServiceTypes
    let selected = all.filter { selectedIds.contains($0.id) }
    if all.isEmpty || selected.count == all.count { return "All service types" }
    if selected.isEmpty { return "No service types" }
    if selected.count <= 2 { return selected.map(\.name).joined(separator: ", ") }
    return "\(selected.count) service types"
  }

  var hasActiveFilters: Bool {
    !selectsAllServiceTypes || window != .default
  }

  func resetFilters() {
    storedSelection = nil
    window = .default
    searchText = ""
    save()
    syncQueries()
  }

  // MARK: Queries

  /// Starts the plans read for every selected service type (and, for recent plans, the lookup
  /// back from each one's first upcoming plan). Reads already started are kept, so switching a
  /// service type off and on again doesn't refetch.
  func syncQueries() {
    for id in selectedIds where planStates[id] == nil {
      let state = queries.query(.plans(serviceTypeId: id), RPC.Catalog.plans, PlansInput(serviceTypeId: id))
      if !isVisible { state.disappear() }
      planStates[id] = state
    }
    guard window == .recent else { return }
    for (serviceTypeId, planId) in recentAnchors where recentStates[serviceTypeId]?.key != recentKey(serviceTypeId, planId) {
      let state = queries.query(
        recentKey(serviceTypeId, planId), RPC.Catalog.adjacentPlans,
        AdjacentPlansInput(serviceTypeId: serviceTypeId, planId: planId, direction: .previous))
      if !isVisible { state.disappear() }
      recentStates[serviceTypeId] = state
    }
  }

  /// Each selected service type's first upcoming plan, which recent plans are looked up from.
  var recentAnchors: [String: String] {
    var anchors: [String: String] = [:]
    for id in selectedIds {
      if let first = planStates[id]?.value?.first(where: { $0.sortDate != nil }) {
        anchors[id] = first.id
      }
    }
    return anchors
  }

  private func recentKey(_ serviceTypeId: String, _ planId: String) -> QueryKey {
    .adjacentPlans(serviceTypeId: serviceTypeId, planId: planId, direction: .previous)
  }

  /// Every selected service type, "Your services", and the service types themselves answered.
  var everythingLoaded: Bool {
    guard !serviceTypes.isLoading, !myPlans.isLoading else { return false }
    return selectedIds.allSatisfy { planStates[$0].map { !$0.isLoading } ?? false }
  }

  func markLoadedIfReady() {
    if !hasLoaded, everythingLoaded { hasLoaded = true }
  }

  /// A newly selected service type (or the recent lookups) is loading behind rows on screen.
  var isLoadingMore: Bool {
    guard hasLoaded else { return false }
    let selected = selectedIds
    let plans = planStates.contains { selected.contains($0.key) && $0.value.isLoading }
    let recent = window == .recent && recentStates.values.contains { $0.isLoading }
    return plans || recent
  }

  /// Recent plans are still being looked up and there is nothing to show yet.
  var isLoadingRecent: Bool {
    window == .recent && (recentStates.isEmpty && !recentAnchors.isEmpty
      || recentStates.values.contains { $0.isLoading })
  }

  func appear() {
    isVisible = true
    serviceTypes.appear()
    myPlans.appear()
    planStates.values.forEach { $0.appear() }
    recentStates.values.forEach { $0.appear() }
  }

  func disappear() {
    isVisible = false
    serviceTypes.disappear()
    myPlans.disappear()
    planStates.values.forEach { $0.disappear() }
    recentStates.values.forEach { $0.disappear() }
  }

  /// Pull to refresh: the service types, the selected plans, and "Your services".
  func refresh() async {
    await withTaskGroup(of: Void.self) { group in
      group.addTask { await self.serviceTypes.refresh() }
      group.addTask { await self.myPlans.refresh() }
      for (id, state) in planStates where selectedIds.contains(id) {
        group.addTask { await state.refresh() }
      }
      if window == .recent {
        for state in recentStates.values {
          group.addTask { await state.refresh() }
        }
      }
    }
    syncQueries()
  }

  // MARK: Rows

  /// Every dated plan of the selected service types, in agenda order.
  var upcomingRows: [ServicePlanRow] {
    servicePlanRows(
      serviceTypes: allServiceTypes,
      plansByServiceTypeId: planStates.compactMapValues(\.value),
      selectedServiceTypeIds: selectedIds)
  }

  /// Recent plans, most recent first.
  func recentRows(now: Date) -> [ServicePlanRow] {
    let rows = servicePlanRows(
      serviceTypes: allServiceTypes,
      plansByServiceTypeId: recentStates.compactMapValues(\.value),
      selectedServiceTypeIds: selectedIds)
    return rows.filter { $0.sortDate < now }.reversed()
  }

  /// The agenda after the window and the search (service type, titles, and the plan's date
  /// as written in the list, as the web matches them).
  func visibleRows(timeZone: String, now: Date) -> [ServicePlanRow] {
    let rows: [ServicePlanRow]
    if let range = window.range {
      rows = upcomingRows.filter { isInDateWindow($0.sortDate, range: range, timeZone: timeZone, now: now) }
    } else {
      rows = recentRows(now: now)
    }
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return rows }
    return rows.filter { row in
      let haystack = [
        row.serviceTypeName, row.planTitle, row.seriesTitle ?? "",
        formatPlanDate(row.sortDate, timeZone: timeZone),
      ].joined(separator: " ")
      return haystack.range(of: query, options: [.caseInsensitive, .diacriticInsensitive]) != nil
    }
  }

  var myPlanIds: Set<String> { Set(myPlans.value?.planIds ?? []) }

  /// Upcoming plans the signed-in person is on, within the upcoming window.
  func myRows(timeZone: String, now: Date) -> [ServicePlanRow] {
    guard let range = window.range else { return [] }
    let mine = myPlanIds
    return upcomingRows.filter {
      mine.contains($0.planId) && isInDateWindow($0.sortDate, range: range, timeZone: timeZone, now: now)
    }
  }

  /// The plan a row came from, to seed the plan screen's header.
  func plan(for row: ServicePlanRow) -> Plan? {
    let sources = [planStates[row.serviceTypeId]?.value, recentStates[row.serviceTypeId]?.value]
    return sources.lazy.compactMap { $0?.first { $0.id == row.planId } }.first
  }

  // MARK: Failures

  struct Failure: Identifiable {
    let id: String
    let title: String
    let retry: @MainActor () -> Void
  }

  /// Reads that failed, with the web's titles. Service types failing with nothing cached is
  /// shown as the whole screen's error instead.
  var failures: [Failure] {
    var failures: [Failure] = []
    if myPlans.error != nil {
      failures.append(Failure(id: "mine", title: "Couldn't load your services") { [myPlans] in myPlans.retry() })
    }
    for serviceType in allServiceTypes where selectedIds.contains(serviceType.id) {
      guard let state = planStates[serviceType.id], state.error != nil else { continue }
      failures.append(Failure(id: serviceType.id, title: "Couldn't load \(serviceType.name) plans") { state.retry() })
    }
    if window == .recent {
      for serviceType in allServiceTypes where selectedIds.contains(serviceType.id) {
        guard let state = recentStates[serviceType.id], state.error != nil else { continue }
        failures.append(Failure(id: "recent-\(serviceType.id)", title: "Couldn't load recent \(serviceType.name) plans") { state.retry() })
      }
    }
    return failures
  }

  // MARK: Storage

  private struct Saved: Codable {
    var serviceTypeIds: [String]?
    var window: ServicesDateWindow
  }

  private func save() {
    // Recent plans are a look back; the next visit opens on upcoming plans again.
    let saved = Saved(serviceTypeIds: storedSelection, window: window == .recent ? .default : window)
    if let data = try? JSONEncoder().encode(saved) {
      defaults.set(data, forKey: storageKey)
    }
  }

  private static func load(defaults: UserDefaults, key: String) -> Saved? {
    guard let data = defaults.data(forKey: key) else { return nil }
    return try? JSONDecoder().decode(Saved.self, from: data)
  }

  /// One key per account context, as a digest so no ids are written in the clear.
  private static func storageKey(for scope: QueryScope) -> String {
    let digest = SHA256.hash(data: Data(scope.id.utf8))
    return "PCOBServicesFilter.v1." + digest.prefix(8).map { String(format: "%02x", $0) }.joined()
  }
}

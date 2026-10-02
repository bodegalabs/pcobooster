import Foundation
import Observation
import PCOBoosterCore

/// The plans Search can find: every service type's plans from `catalog.serviceTypes` and
/// `catalog.plans`, read through the same cache keys as the Services agenda, so they usually
/// paint from memory or disk without a request. There is no plan search procedure; matching
/// happens here, like the agenda's search field.
@MainActor
@Observable
final class SearchCatalog {
  let serviceTypes: QueryState<[ServiceType]>
  private(set) var plans: [String: QueryState<[Plan]>] = [:]
  @ObservationIgnored private let queries: QueryClient

  init(queries: QueryClient) {
    self.queries = queries
    serviceTypes = queries.query(.serviceTypes, RPC.Catalog.serviceTypes)
    syncPlans()
  }

  /// Starts a plans read for each service type that has none yet (the agenda's default
  /// selection is every service type).
  func syncPlans() {
    for serviceType in serviceTypes.value ?? [] where plans[serviceType.id] == nil {
      plans[serviceType.id] = queries.query(
        .plans(serviceTypeId: serviceType.id), RPC.Catalog.plans,
        PlansInput(serviceTypeId: serviceType.id))
    }
  }

  /// Every dated plan, in agenda order.
  var rows: [ServicePlanRow] {
    let types = serviceTypes.value ?? []
    return servicePlanRows(
      serviceTypes: types,
      plansByServiceTypeId: plans.compactMapValues(\.value),
      selectedServiceTypeIds: Set(types.map(\.id)))
  }

  /// Nothing to search yet and something is still loading.
  var isLoadingFirstTime: Bool {
    if serviceTypes.value == nil { return serviceTypes.status != .failure }
    return plans.values.contains { $0.isLoading } && plans.values.allSatisfy { $0.value == nil }
  }

  /// Why plans couldn't load, when nothing is cached.
  var failureMessage: String? {
    if serviceTypes.value == nil { return serviceTypes.errorMessage }
    let failed = plans.values.filter { $0.value == nil && $0.status == .failure }
    return failed.first?.errorMessage
  }

  /// Some service types' plans failed while others loaded.
  var hasPartialFailure: Bool {
    plans.values.contains { $0.value == nil && $0.status == .failure }
  }

  func retry() {
    if serviceTypes.value == nil {
      serviceTypes.retry()
    }
    for state in plans.values where state.value == nil && state.status == .failure {
      state.retry()
    }
  }

  func refresh() async {
    await serviceTypes.refresh()
    syncPlans()
    await withTaskGroup(of: Void.self) { group in
      for state in plans.values {
        group.addTask { await state.refresh() }
      }
    }
  }

  /// The Planning Center link for a plan, when the catalog has it.
  func planningCenterURL(for hit: PlanHit) -> URL? {
    plans[hit.row.serviceTypeId]?.value?
      .first { $0.id == hit.row.planId }?
      .planningCenterUrl
      .flatMap(URL.init(string:))
  }

  func appear() {
    serviceTypes.appear()
    for state in plans.values { state.appear() }
  }

  func disappear() {
    serviceTypes.disappear()
    for state in plans.values { state.disappear() }
  }
}

import Foundation
import Observation
import PCOBoosterCore

/// The plan screen's own reads and its stepping between plans of the same service type
/// (`usePlanStepper` and `listedNeighbors` in the web's dashboard page and controller).
///
/// Neighbors come from the service type's upcoming list (`catalog.plans`, usually cached from
/// the agenda). Where that list runs out on a side (past plans, the end of the window), one
/// `catalog.adjacentPlans` lookup fills it, only when someone asks: a step, or a long press on
/// the step buttons or the title menu.
@MainActor
@Observable
final class PlanShellModel {
  typealias Direction = AdjacentPlansInputDirection

  /// The web's `ADJACENT_PLANS_LIMIT`: how many plans the menus list on each side.
  static let neighborLimit = 4

  let serviceTypeId: String
  let planId: String
  let serviceTypes: QueryState<[ServiceType]>
  let plans: QueryState<[Plan]>

  /// Plans past the loaded list, by side, once looked up.
  private(set) var lookups: [Direction: [Plan]] = [:]
  private(set) var lookingUp: Set<Direction> = []
  private(set) var failedLookups: Set<Direction> = []
  /// Sides with nothing more to step to.
  private(set) var ends: Set<Direction> = []
  /// The side a step is waiting on.
  private(set) var pending: Direction?
  /// Bumps when a step finds no plan, for the chevron's wiggle.
  private(set) var endBumps = 0

  @ObservationIgnored private let app: AppModel

  init(route: PlanRoute, app: AppModel) {
    self.app = app
    serviceTypeId = route.serviceTypeId
    planId = route.planId
    serviceTypes = app.queries.query(.serviceTypes, RPC.Catalog.serviceTypes)
    plans = app.queries.query(
      .plans(serviceTypeId: route.serviceTypeId), RPC.Catalog.plans,
      PlansInput(serviceTypeId: route.serviceTypeId))
  }

  var serviceTypeName: String? {
    serviceTypes.value?.first { $0.id == serviceTypeId }?.name
  }

  // MARK: Neighbors

  /// Listed plans on one side, nearest first.
  func listed(_ direction: Direction) -> [Plan] {
    guard let list = plans.value, let index = list.firstIndex(where: { $0.id == planId }) else {
      return []
    }
    switch direction {
    case .previous:
      return Array(list[..<index].reversed().prefix(Self.neighborLimit))
    default:
      return Array(list[list.index(after: index)...].prefix(Self.neighborLimit))
    }
  }

  /// Whether the loaded list is short on this side, so the menus look the rest up.
  func needsLookup(_ direction: Direction) -> Bool {
    listed(direction).count < Self.neighborLimit
  }

  /// Up to four plans on one side, nearest first: the looked-up ones once they arrive.
  func neighbors(_ direction: Direction) -> [Plan] {
    let listed = listed(direction)
    guard listed.count < Self.neighborLimit, let looked = lookups[direction] else { return listed }
    return Array(looked.prefix(Self.neighborLimit))
  }

  func isEnd(_ direction: Direction) -> Bool {
    ends.contains(direction)
  }

  /// Looks up the plans past the loaded list on one side, once.
  func lookUpIfNeeded(_ direction: Direction) async {
    guard needsLookup(direction), lookups[direction] == nil, !lookingUp.contains(direction) else {
      return
    }
    lookingUp.insert(direction)
    failedLookups.remove(direction)
    defer { lookingUp.remove(direction) }
    do {
      let found = try await fetchAdjacent(direction)
      lookups[direction] = found
      if found.isEmpty {
        ends.insert(direction)
      }
    } catch where !error.isCancellation {
      failedLookups.insert(direction)
    } catch {}
  }

  // MARK: Stepping

  /// Opens the nearest plan on one side on the same segment; looks it up past the loaded list.
  func step(_ direction: Direction, segment: PlanSegment) async {
    if let nearest = neighbors(direction).first {
      open(nearest, segment: segment)
      return
    }
    guard !isEnd(direction), pending == nil else { return }
    pending = direction
    do {
      let found = try await fetchAdjacent(direction)
      pending = nil
      lookups[direction] = found
      guard let nearest = found.first else {
        ends.insert(direction)
        endBumps += 1
        return
      }
      open(nearest, segment: segment)
    } catch where !error.isCancellation {
      pending = nil
      app.toasts.showError("Couldn't load that plan.", detail: error.userFacingMessage)
    } catch {
      pending = nil
    }
  }

  /// Shows `plan` in place of this one, keeping the segment. Its header is already in hand, so
  /// it seeds the cache and the new screen paints its title at once.
  func open(_ plan: Plan, segment: PlanSegment) {
    guard plan.id != planId else { return }
    app.queries.setValue(
      Optional(plan), for: .planDetails(serviceTypeId: serviceTypeId, planId: plan.id))
    let side: PlanNavigation.Arrival = isEarlier(plan) ? .earlier : .later
    PlanNavigation.replace(
      planId: planId,
      with: PlanRoute(serviceTypeId: serviceTypeId, planId: plan.id, view: segment.view),
      arrival: side, router: app.router)
  }

  private func isEarlier(_ plan: Plan) -> Bool {
    if neighbors(.previous).contains(where: { $0.id == plan.id }) { return true }
    if neighbors(.next).contains(where: { $0.id == plan.id }) { return false }
    let current = app.queries.value(
      for: .planDetails(serviceTypeId: serviceTypeId, planId: planId), as: Plan?.self)
    guard let mine = current??.sortDate, let theirs = plan.sortDate else { return false }
    return theirs < mine
  }

  private func fetchAdjacent(_ direction: Direction) async throws -> [Plan] {
    try await app.queries.fetch(
      .adjacentPlans(serviceTypeId: serviceTypeId, planId: planId, direction: direction),
      RPC.Catalog.adjacentPlans,
      AdjacentPlansInput(serviceTypeId: serviceTypeId, planId: planId, direction: direction))
  }

  // MARK: Warming

  /// Loads what the other segments open with (team positions, items, and times), in the
  /// speculative lane behind the segment on screen, as the web's workspace does. Each is a
  /// no-op when the visible segment already loads it or the cache is fresh.
  func warmOtherSegments(seriesId: String?) {
    let queries = app.queries
    queries.prefetch(
      .teamPositions(serviceTypeId: serviceTypeId, planId: planId), RPC.Catalog.teamPositions,
      TeamPositionsInput(serviceTypeId: serviceTypeId, planId: planId, seriesId: seriesId))
    queries.prefetch(
      .planItems(serviceTypeId: serviceTypeId, planId: planId), RPC.PlanItems.list,
      PlanItemsListInput(serviceTypeId: serviceTypeId, planId: planId))
    queries.prefetch(
      .planTimes(serviceTypeId: serviceTypeId, planId: planId), RPC.PlanTimes.list,
      PlanTimesListInput(serviceTypeId: serviceTypeId, planId: planId))
  }
}

import Foundation
import Observation
import PCOBoosterCore

/// The plan a `PlanScreen` shows, shared with its four segment views
/// (`PlanOverviewView`, `LineupView`, `RunSheetView`, `PlanTimesView`, each `init(context:)`).
///
/// This is a cross-feature contract: add fields freely, but don't rename or remove them.
/// - `serviceTypeId` and `planId` identify the plan for every call.
/// - `segment` is the visible segment; set it to switch (Overview's songs card opens `.plan`).
/// - `plan` is the plan header (`catalog.plan`, keyed `planDetails`), shared through the cache
///   with anything else that reads it (the "back to plan" accessory).
/// - Assign is a push, never a segment: `router.push(context.assignRoute(teamId:positionId:))`.
@MainActor
@Observable
final class PlanContext {
  let serviceTypeId: String
  let planId: String
  var segment: PlanSegment {
    didSet {
      if segment != oldValue { segmentMovedForward = segment.order > oldValue.order }
    }
  }
  let plan: QueryState<Plan?>
  /// Whether the last segment switch moved toward Times (rightward), so the content slides in
  /// from that side.
  private(set) var segmentMovedForward = true

  init(route: PlanRoute, queries: QueryClient) {
    serviceTypeId = route.serviceTypeId
    planId = route.planId
    segment = PlanSegment(route.view)
    plan = queries.query(
      .planDetails(serviceTypeId: route.serviceTypeId, planId: route.planId), RPC.Catalog.plan,
      PlanInput(serviceTypeId: route.serviceTypeId, planId: route.planId))
  }

  /// The plan and its visible segment, as a route.
  var route: PlanRoute {
    PlanRoute(serviceTypeId: serviceTypeId, planId: planId, view: segment.view)
  }

  /// The loaded plan header; nil while loading or when the plan doesn't exist.
  var header: Plan? { plan.value ?? nil }

  /// The plan was loaded and doesn't exist (`catalog.plan` answered null).
  var isMissing: Bool {
    plan.status == .success && header == nil
  }

  /// The route that pushes Assign for one position (nil ids open on the first open position).
  func assignRoute(teamId: String?, positionId: String?) -> AppRoute {
    .assign(
      PlanRoute(serviceTypeId: serviceTypeId, planId: planId, view: .lineup),
      teamId: teamId, positionId: positionId)
  }
}

/// The plan screen's segments, in order. Assign is not one of them (it is pushed).
enum PlanSegment: String, CaseIterable, Identifiable, Hashable, Sendable {
  case overview
  case lineup
  case plan
  case times

  var id: String { rawValue }

  /// Left to right position in the segmented control.
  var order: Int { Self.allCases.firstIndex(of: self) ?? 0 }

  /// The segment a route opens on; `.assign` opens on Lineup.
  init(_ view: PlanView) {
    switch view {
    case .overview: self = .overview
    case .assign, .lineup: self = .lineup
    case .plan: self = .plan
    case .times: self = .times
    }
  }

  var view: PlanView {
    switch self {
    case .overview: .overview
    case .lineup: .lineup
    case .plan: .plan
    case .times: .times
    }
  }

  var title: LocalizedStringResource {
    switch self {
    case .overview: "Overview"
    case .lineup: "Lineup"
    case .plan: "Plan"
    case .times: "Times"
    }
  }

  var symbol: AppSymbol {
    switch self {
    case .overview: .overview
    case .lineup: .lineup
    case .plan: .plan
    case .times: .times
    }
  }
}

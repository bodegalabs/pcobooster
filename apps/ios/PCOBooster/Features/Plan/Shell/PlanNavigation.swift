import PCOBoosterCore
import SwiftUI

/// Hands a plan screen how it is being opened, from the screen that opens it.
///
/// Pushed routes are built by the shell's single `navigationDestination`, outside the screen that
/// pushed them, so a namespace or a direction can't reach the new `PlanScreen` through the
/// environment. The opener arms a token just before it changes the path; the new screen reads
/// it while it is built and clears it once it appears. A token older than `lifetime` is ignored,
/// so a stale one can never zoom an unrelated push.
@MainActor
enum PlanNavigation {
  /// The view a plan zooms out of: an agenda row or a "Your services" card.
  struct ZoomSource: Equatable {
    let planId: String
    let sourceID: String
    let namespace: Namespace.ID
  }

  /// Which side of the previous plan the new one sits on, for the step animation.
  enum Arrival: Equatable, Sendable {
    case earlier
    case later
  }

  private static let lifetime: Duration = .seconds(2)
  private static var zoom: (source: ZoomSource, armedAt: ContinuousClock.Instant)?
  private static var arrival: (planId: String, arrival: Arrival, armedAt: ContinuousClock.Instant)?

  /// Call right before pushing the plan, with the source the row registered.
  static func armZoom(_ source: ZoomSource) {
    zoom = (source, .now)
  }

  /// The source to zoom from when `planId` was just opened from a row; nil otherwise.
  static func zoomSource(for planId: String) -> ZoomSource? {
    guard let zoom, zoom.source.planId == planId, ContinuousClock.now - zoom.armedAt < lifetime
    else { return nil }
    return zoom.source
  }

  /// The side the plan arrived from when it was stepped to; nil when it was pushed.
  static func arrival(for planId: String) -> Arrival? {
    guard let arrival, arrival.planId == planId, ContinuousClock.now - arrival.armedAt < lifetime
    else { return nil }
    return arrival.arrival
  }

  /// The plan screen appeared; its tokens are spent.
  static func settle(planId: String) {
    if zoom?.source.planId == planId { zoom = nil }
    if arrival?.planId == planId { arrival = nil }
  }

  /// Shows `route` in place of the plan `planId` on top of the visible stack, without a push
  /// animation (Mail-style stepping): Back still returns to where the first plan was opened from.
  static func replace(planId: String, with route: PlanRoute, arrival side: Arrival, router: AppRouter) {
    let tab = router.selectedTab
    var path = router.path(for: tab)
    guard let index = path.lastIndex(where: { showsPlan($0, planId) }) else { return }
    path[index] = .plan(route)
    path.removeSubrange(path.index(after: index)...)
    arrival = (route.planId, side, .now)
    var transaction = Transaction()
    transaction.disablesAnimations = true
    withTransaction(transaction) {
      router.setPath(path, for: tab)
    }
  }

  /// The id an agenda row registers as its zoom source.
  static func rowSourceID(_ planId: String) -> String { "agenda-\(planId)" }

  /// The id a "Your services" card registers as its zoom source.
  static func cardSourceID(_ planId: String) -> String { "mine-\(planId)" }

  private static func showsPlan(_ route: AppRoute, _ planId: String) -> Bool {
    if case .plan(let plan) = route { plan.planId == planId } else { false }
  }
}

/// Applies the zoom transition when the plan was opened from a row that registered a source.
struct PlanZoomTransition: ViewModifier {
  let source: PlanNavigation.ZoomSource?

  func body(content: Content) -> some View {
    if let source {
      content.navigationTransition(.zoom(sourceID: source.sourceID, in: source.namespace))
    } else {
      content
    }
  }
}

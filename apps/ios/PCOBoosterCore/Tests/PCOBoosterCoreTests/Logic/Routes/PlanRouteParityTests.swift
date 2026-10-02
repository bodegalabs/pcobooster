import Foundation
import PCOBoosterCore
import Testing

/// Replays the `routes.*` fixtures that scripts/parity/routes.parity.ts writes from
/// apps/web/src/lib/app-routes.ts.
struct PlanRouteParityTests {
  struct PlanPathInput: Decodable, Sendable {
    let planId: String
    let serviceTypeId: String
    let view: PlanView
  }

  struct PlanViewEntry: Decodable, Sendable, Equatable {
    let label: String
    let view: PlanView
  }

  @Test(arguments: Parity.cases("routes.parsePlanRoute", String.self, PlanRoute?.self))
  func parse(_ parity: ParityCase<String, PlanRoute?>) {
    #expect(parsePlanRoute(parity.input) == parity.output)
  }

  @Test(arguments: Parity.cases("routes.planPath", PlanPathInput.self, String.self))
  func path(_ parity: ParityCase<PlanPathInput, String>) {
    let input = parity.input
    let route = PlanRoute(
      serviceTypeId: input.serviceTypeId, planId: input.planId, view: input.view)
    #expect(route.path == parity.output)
    #expect(parsePlanRoute(route.path) == route)
  }

  @Test(arguments: Parity.cases("routes.planViews", String.self, [PlanViewEntry].self))
  func views(_ parity: ParityCase<String, [PlanViewEntry]>) {
    #expect(PlanView.allCases.map { PlanViewEntry(label: $0.label, view: $0) } == parity.output)
  }
}

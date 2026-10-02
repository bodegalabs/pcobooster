import Foundation
import PCOBoosterCore
import Testing

/// Replays the set insight fixtures that scripts/parity/plans.parity.ts writes from
/// apps/web/src/lib/plan-set-insights.ts.
struct PlanSetInsightsParityTests {
  struct RecentPlayInput: Decodable, Sendable {
    let item: PlanItem
    let planDate: Date?
  }

  struct InsightsInput: Decodable, Sendable {
    let items: [PlanItem]
    let planDate: Date?
  }

  struct RecentPlay: Decodable, Sendable {
    let days: Int
    let itemId: String
  }

  struct TransitionSummary: Decodable, Sendable, Equatable {
    let bridgedBy: String?
    let fromItemId: String
    let level: KeyTransitionLevel
  }

  struct TransitionRow: Decodable, Sendable {
    let bridgedBy: String?
    let fromItemId: String
    let itemId: String
    let level: KeyTransitionLevel
  }

  struct InsightsOutput: Decodable, Sendable {
    let recentPlays: [RecentPlay]
    let transitions: [TransitionRow]
  }

  @Test(arguments: Parity.cases("plans.keyTransitions", [PlanItem].self, [KeyTransition].self))
  func transitions(_ parity: ParityCase<[PlanItem], [KeyTransition]>) {
    #expect(keyTransitions(parity.input) == parity.output)
  }

  @Test(arguments: Parity.cases("plans.daysSinceRecentPlay", RecentPlayInput.self, Int?.self))
  func recentPlay(_ parity: ParityCase<RecentPlayInput, Int?>) {
    #expect(
      daysSinceRecentPlay(parity.input.item, planDate: parity.input.planDate) == parity.output)
  }

  /// The web's maps keep insertion order; lookups are by item id, so the port uses dictionaries.
  @Test(arguments: Parity.cases("plans.buildPlanInsights", InsightsInput.self, InsightsOutput.self))
  func insights(_ parity: ParityCase<InsightsInput, InsightsOutput>) {
    let insights = buildPlanInsights(parity.input.items, planDate: parity.input.planDate)
    let expectedPlays = Dictionary(
      parity.output.recentPlays.map { ($0.itemId, $0.days) }, uniquingKeysWith: { _, last in last })
    let expectedTransitions = Dictionary(
      parity.output.transitions.map {
        (
          $0.itemId,
          TransitionSummary(bridgedBy: $0.bridgedBy, fromItemId: $0.fromItemId, level: $0.level)
        )
      }, uniquingKeysWith: { _, last in last })
    #expect(insights.recentPlays == expectedPlays)
    #expect(
      insights.transitions.mapValues {
        TransitionSummary(bridgedBy: $0.bridgedBy, fromItemId: $0.fromItemId, level: $0.level)
      } == expectedTransitions)
  }
}

import Foundation
import PCOBoosterCore
import Testing

/// Replays the overview fixtures (`plans.summarizeStaffing`, `plans.keyLabels`,
/// `plans.summarizeOrder`, `plans.summarizeTimes`, `plans.buildReadinessChecks`) that
/// scripts/parity/plans.parity.ts writes from apps/web/src/lib/plan-overview.ts.
struct PlanOverviewParityTests {
  struct KeyLabels: Decodable, Sendable, Equatable {
    let keyLabel: String?
    let optionLabel: String
    let parts: KeyOptionParts
  }

  struct ScheduleSummary: Decodable, Sendable, Equatable {
    let rehearsalCount: Int
    let serviceCount: Int
    let timeIds: [String]
  }

  struct ReadinessInput: Decodable, Sendable {
    let order: PlanOrder?
    let schedule: PlanSchedule?
    let staffing: PlanStaffing?
  }

  @Test(
    arguments: Parity.cases("plans.summarizeStaffing", [TeamPositionGroup].self, PlanStaffing.self)
  )
  func staffing(_ parity: ParityCase<[TeamPositionGroup], PlanStaffing>) {
    #expect(summarizeStaffing(parity.input) == parity.output)
  }

  /// Key options and plan item keys share the labels, so both decode from the same JSON.
  @Test(arguments: Parity.cases("plans.keyLabels", KeyOption.self, KeyLabels.self))
  func keyLabels(_ parity: ParityCase<KeyOption, KeyLabels>) {
    let option = parity.input
    let itemKey = PlanItemKey(
      id: option.id, name: option.name, startingKey: option.startingKey,
      endingKey: option.endingKey)
    for labels in [
      KeyLabels(
        keyLabel: keyLabel(option), optionLabel: keyOptionLabel(option),
        parts: keyOptionParts(option)),
      KeyLabels(
        keyLabel: keyLabel(itemKey), optionLabel: keyOptionLabel(itemKey),
        parts: keyOptionParts(itemKey)),
    ] {
      #expect(labels == parity.output)
    }
  }

  @Test(arguments: Parity.cases("plans.summarizeOrder", [PlanItem].self, PlanOrder.self))
  func order(_ parity: ParityCase<[PlanItem], PlanOrder>) {
    #expect(summarizeOrder(parity.input) == parity.output)
  }

  @Test(arguments: Parity.cases("plans.summarizeTimes", [PlanTime].self, ScheduleSummary.self))
  func times(_ parity: ParityCase<[PlanTime], ScheduleSummary>) {
    let schedule = summarizeTimes(parity.input)
    let summary = ScheduleSummary(
      rehearsalCount: schedule.rehearsalCount, serviceCount: schedule.serviceCount,
      timeIds: schedule.times.map(\.id))
    #expect(summary == parity.output)
  }

  @Test(
    arguments: Parity.cases(
      "plans.buildReadinessChecks", ReadinessInput.self, [ReadinessCheck].self))
  func readiness(_ parity: ParityCase<ReadinessInput, [ReadinessCheck]>) {
    let input = parity.input
    #expect(
      buildReadinessChecks(staffing: input.staffing, order: input.order, schedule: input.schedule)
        == parity.output)
  }
}

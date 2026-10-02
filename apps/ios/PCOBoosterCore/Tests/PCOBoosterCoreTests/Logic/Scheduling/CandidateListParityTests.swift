import Foundation
import PCOBoosterCore
import Testing

/// Replays the window history, slot matching, assembly, and progressive loading fixtures that
/// scripts/parity/scheduling.parity.ts writes from plan-window-history.ts,
/// position-candidates.ts (models), and apps/web/src/lib/position-candidates.ts.
struct CandidateListParityTests {
  typealias HistoryEntry = SchedulingParity.Entry<CandidateHistory>

  struct WindowInput: Decodable, Sendable {
    let calls: [PlanWindowHistoryBatch]
    let selectedPlanId: String
  }

  struct MatchInput: Decodable, Sendable {
    let assignments: [SelectedPlanAssignment]
    let match: SelectedPlanMatch
  }

  struct AssembleInput: Decodable, Sendable {
    let candidates: [PositionCandidate]
    let match: SelectedPlanMatch
    let referenceDate: Date
    let timeZone: String
    let slotTimePreferenceOptionId: String?
    let histories: [HistoryEntry]
    let blocked: [SchedulingParity.Entry<Bool>]
  }

  struct CandidateListInput: Decodable, Sendable {
    let candidates: PositionCandidates
    let windowHistory: [HistoryEntry]?
    let scheduleHistory: Bool
    let details: [CandidateDetail]
    let date: Date
    let slotTimePreferenceOptionId: String?
  }

  struct GoldenInput: Decodable, Sendable {
    let candidates: PositionCandidates
    let planId: String
    let windowCalls: [PlanWindowHistoryBatch]
    let detailBatches: [[CandidateDetail]]
  }

  struct BatchPlanInput: Decodable, Sendable {
    let candidates: PositionCandidates?
    let batchSize: Int
  }

  struct AdvanceInput: Decodable, Sendable {
    let continuation: PeoplePlanWindowHistoryInputContinuation
    let batch: PlanWindowHistoryBatch
  }

  struct BlockoutProgressInput: Decodable, Sendable {
    let before: [BlockoutProgress]
    let after: [BlockoutProgress]
  }

  struct ExpandWindowInput: Decodable, Sendable {
    let windowCalls: [PlanWindowHistoryBatch]?
    let planId: String
  }

  struct Constants: Decodable, Sendable {
    let detailsBatchSize: Int
    let detailsBatchConcurrency: Int
  }

  @Test(arguments: Parity.cases("scheduling.constants", String?.self, Constants.self))
  func constants(_ parity: ParityCase<String?, Constants>) {
    #expect(CandidateListLoading.detailsBatchSize == parity.output.detailsBatchSize)
    #expect(CandidateListLoading.detailsBatchConcurrency == parity.output.detailsBatchConcurrency)
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.expandPlanWindowHistory", WindowInput.self, [HistoryEntry].self))
  func windowHistory(_ parity: ParityCase<WindowInput, [HistoryEntry]>) throws {
    let history = expandPlanWindowHistory(
      parity.input.calls, selectedPlanId: parity.input.selectedPlanId)
    #expect(history.count == parity.output.count)
    #expect(
      try SchedulingParity.json(history)
        == SchedulingParity.json(SchedulingParity.dictionary(parity.output)))
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.findSelectedSlotAssignment", MatchInput.self, SelectedPlanAssignment?.self))
  func slotAssignment(_ parity: ParityCase<MatchInput, SelectedPlanAssignment?>) throws {
    let input = parity.input
    let assignment = findSelectedSlotAssignment(input.assignments, match: input.match)
    #expect(try SchedulingParity.json(assignment) == SchedulingParity.json(parity.output))
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.selectedPlanAssignmentLabels", MatchInput.self, [String].self))
  func assignmentLabels(_ parity: ParityCase<MatchInput, [String]>) throws {
    let input = parity.input
    let labels = selectedPlanAssignmentLabels(input.assignments, match: input.match)
    #expect(try SchedulingParity.json(labels) == SchedulingParity.json(parity.output))
  }

  @Test(arguments: Parity.cases("scheduling.mergeAssignmentLabels", [[String]].self, [String].self))
  func mergedLabels(_ parity: ParityCase<[[String]], [String]>) throws {
    #expect(
      try SchedulingParity.json(mergeAssignmentLabels(parity.input))
        == SchedulingParity.json(parity.output))
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.assemblePositionCandidates", AssembleInput.self,
      AssembledPositionCandidates.self))
  func assembly(_ parity: ParityCase<AssembleInput, AssembledPositionCandidates>) throws {
    let input = parity.input
    let histories = SchedulingParity.dictionary(input.histories)
    let blocked = SchedulingParity.dictionary(input.blocked)
    let assembled = assemblePositionCandidates(
      PositionCandidateSources(
        candidates: input.candidates,
        match: input.match,
        referenceDate: input.referenceDate,
        timeZone: input.timeZone,
        slotTimePreferenceOptionId: input.slotTimePreferenceOptionId,
        historyFor: { histories[$0] },
        blockedFor: { blocked[$0] }))
    #expect(try SchedulingParity.json(assembled) == SchedulingParity.json(parity.output))
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.assembleCandidateList", CandidateListInput.self, CandidateList.self))
  func candidateList(_ parity: ParityCase<CandidateListInput, CandidateList>) throws {
    let input = parity.input
    let details = Dictionary(
      input.details.map { ($0.personId, $0) }, uniquingKeysWith: { _, last in last })
    let list = assembleCandidateList(
      candidates: input.candidates,
      windowHistory: input.windowHistory.map(SchedulingParity.dictionary),
      scheduleHistory: input.scheduleHistory,
      details: details,
      date: input.date,
      slotTimePreferenceOptionId: input.slotTimePreferenceOptionId)
    #expect(try SchedulingParity.json(list) == SchedulingParity.json(parity.output))
  }

  /// The multi-zone scenario of position-candidates-equivalence.golden.json, from the wire
  /// parts through decoding, expansion, scoring, and sorting, composed as the web's
  /// `usePositionCandidates` composes them.
  @Test(
    arguments: Parity.cases("scheduling.candidateListGolden", GoldenInput.self, CandidateList.self))
  func goldenCandidateList(_ parity: ParityCase<GoldenInput, CandidateList>) throws {
    let input = parity.input
    let list = assembleCandidateList(
      candidates: input.candidates,
      windowHistory: expandWindowHistory(input.windowCalls, planId: input.planId),
      scheduleHistory: needsScheduleHistory(input.windowCalls),
      details: collectCandidateDetails(input.detailBatches),
      date: try #require(JSONCoding.parseISODate("2026-09-27T17:00:00.000Z")))
    #expect(list.complete)
    #expect(try SchedulingParity.json(list) == SchedulingParity.json(parity.output))
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.planCandidateDetailsBatches", BatchPlanInput.self, [[String]].self))
  func detailBatches(_ parity: ParityCase<BatchPlanInput, [[String]]>) {
    let input = parity.input
    #expect(
      planCandidateDetailsBatches(input.candidates, batchSize: input.batchSize) == parity.output)
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.needsScheduleHistory", [PlanWindowHistoryBatch]?.self, Bool.self))
  func scheduleHistoryNeeded(_ parity: ParityCase<[PlanWindowHistoryBatch]?, Bool>) {
    #expect(needsScheduleHistory(parity.input) == parity.output)
  }

  @Test(arguments: Parity.cases("scheduling.windowHistoryAdvanced", AdvanceInput.self, Bool.self))
  func windowAdvance(_ parity: ParityCase<AdvanceInput, Bool>) {
    let input = parity.input
    #expect(
      windowHistoryAdvanced(continuation: input.continuation, batch: input.batch)
        == parity.output)
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.advancedBlockoutChecks", BlockoutProgressInput.self, Bool.self))
  func blockoutAdvance(_ parity: ParityCase<BlockoutProgressInput, Bool>) {
    let input = parity.input
    #expect(advancedBlockoutChecks(before: input.before, after: input.after) == parity.output)
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.expandWindowHistory", ExpandWindowInput.self, [HistoryEntry]?.self))
  func expandedWindow(_ parity: ParityCase<ExpandWindowInput, [HistoryEntry]?>) throws {
    let expanded = expandWindowHistory(parity.input.windowCalls, planId: parity.input.planId)
    #expect(
      try SchedulingParity.json(expanded)
        == SchedulingParity.json(parity.output.map(SchedulingParity.dictionary)))
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.collectCandidateDetails", [[CandidateDetail]?].self,
      [SchedulingParity.Entry<CandidateDetail>].self))
  func collectedDetails(
    _ parity: ParityCase<[[CandidateDetail]?], [SchedulingParity.Entry<CandidateDetail>]>
  ) throws {
    let details = collectCandidateDetails(parity.input)
    #expect(details.count == parity.output.count)
    #expect(
      try SchedulingParity.json(details)
        == SchedulingParity.json(SchedulingParity.dictionary(parity.output)))
  }
}

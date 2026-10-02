import Foundation
import PCOBoosterCore
import Testing

/// Replays the frequency, preference, scoring, and selection order fixtures that
/// scripts/parity/scheduling.parity.ts writes from candidate-frequency.ts,
/// scheduling-preferences.ts, and candidate-scoring.ts.
struct ScoringParityTests {
  struct HistoryInput: Decodable, Sendable {
    let history: [ServiceHistoryItem]
    let referenceDate: Date
    let timeZone: String
  }

  struct PreferenceContextInput: Decodable, Sendable {
    let referenceDate: Date
    let timeZone: String
    let planId: String?
    let slotTimePreferenceOptionId: String?
  }

  struct PreferenceInput: Decodable, Sendable {
    let preferences: SchedulingPreferences
    let history: [ServiceHistoryItem]
    let context: PreferenceContextInput
  }

  struct SlotInput: Decodable, Sendable {
    let planId: String?
    let slotTimePreferenceOptionId: String?
  }

  struct ScoreInput: Decodable, Sendable {
    let people: [CandidatePerson]
    let referenceDate: Date
    let timeZone: String
    let slot: SlotInput
  }

  struct PeopleInput: Decodable, Sendable {
    let people: [SchedulingParity.RankedPerson]
  }

  @Test(arguments: Parity.cases("scheduling.isDeclinedAssignmentStatus", String?.self, Bool.self))
  func declinedStatus(_ parity: ParityCase<String?, Bool>) {
    #expect(isDeclinedAssignmentStatus(parity.input) == parity.output)
  }

  @Test(
    arguments: Parity.cases("scheduling.buildFrequency", HistoryInput.self, ScheduleFrequency.self))
  func frequency(_ parity: ParityCase<HistoryInput, ScheduleFrequency>) throws {
    let input = parity.input
    let frequency = buildFrequency(
      from: input.history, referenceDate: input.referenceDate, timeZone: input.timeZone)
    #expect(try SchedulingParity.json(frequency) == SchedulingParity.json(parity.output))
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.summarizeCandidateHistory", HistoryInput.self, CandidateHistorySummary.self))
  func historySummary(_ parity: ParityCase<HistoryInput, CandidateHistorySummary>) throws {
    let input = parity.input
    let summary = summarizeCandidateHistory(
      input.history, referenceDate: input.referenceDate, timeZone: input.timeZone)
    #expect(try SchedulingParity.json(summary) == SchedulingParity.json(parity.output))
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.scoreSchedulingPreferences", PreferenceInput.self,
      SchedulingPreferenceScore.self))
  func preferences(_ parity: ParityCase<PreferenceInput, SchedulingPreferenceScore>) {
    let input = parity.input
    let context = SchedulingPreferenceContext(
      referenceDate: input.context.referenceDate,
      timeZone: input.context.timeZone,
      planId: input.context.planId,
      slotTimePreferenceOptionId: input.context.slotTimePreferenceOptionId)
    #expect(
      scoreSchedulingPreferences(input.preferences, history: input.history, context: context)
        == parity.output)
  }

  @Test(
    arguments: Parity.cases("scheduling.scoreAndNormalize", ScoreInput.self, [CandidatePerson].self)
  )
  func scores(_ parity: ParityCase<ScoreInput, [CandidatePerson]>) throws {
    let input = parity.input
    let scored = scoreAndNormalize(
      input.people,
      referenceDate: input.referenceDate,
      timeZone: input.timeZone,
      slot: ScoringSlot(
        planId: input.slot.planId,
        slotTimePreferenceOptionId: input.slot.slotTimePreferenceOptionId))
    #expect(try SchedulingParity.json(scored) == SchedulingParity.json(parity.output))
  }

  @Test(arguments: Parity.cases("scheduling.sortForSelection", PeopleInput.self, [String].self))
  func selectionOrder(_ parity: ParityCase<PeopleInput, [String]>) {
    let sorted = sortForSelection(parity.input.people.map(\.person))
    #expect(sorted.map(\.id) == parity.output)
  }
}

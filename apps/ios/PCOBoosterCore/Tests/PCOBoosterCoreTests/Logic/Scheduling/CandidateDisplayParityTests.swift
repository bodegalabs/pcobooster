import Foundation
import PCOBoosterCore
import Testing

/// Replays the ranking reason, recommendation strip, schedule day, candidate summary, and
/// assignment label fixtures that scripts/parity/scheduling.parity.ts writes from
/// ranking-reasons.ts and apps/web/src/lib/people/.
struct CandidateDisplayParityTests {
  struct StripInput: Decodable, Sendable {
    let people: [SchedulingParity.RankedPerson]
    let settled: Bool
  }

  struct StripOutput: Decodable, Sendable {
    let onSlot: [String]
    let candidates: [String]
    let exceptions: [String]
  }

  struct ScheduleDaysInput: Decodable, Sendable {
    let history: [ServiceHistoryItem]
    let referenceDate: Date
    let timeZone: String
    let halfRangeDays: Int?
  }

  struct SummaryInput: Decodable, Sendable {
    let frequency: ScheduleFrequency?
    let referenceDate: Date?
    let timeZone: String
    let onThisPlan: Bool
  }

  struct OtherLabelsInput: Decodable, Sendable {
    let labels: [String]
    let teamName: String?
    let positionName: String?
  }

  @Test(
    arguments: Parity.cases("scheduling.groupRankingReasons", [String].self, [RankingFact].self))
  func rankingFacts(_ parity: ParityCase<[String], [RankingFact]>) throws {
    #expect(
      try SchedulingParity.json(groupRankingReasons(parity.input))
        == SchedulingParity.json(parity.output))
  }

  @Test(arguments: Parity.cases("scheduling.preferenceConflicts", [String].self, [String].self))
  func conflicts(_ parity: ParityCase<[String], [String]>) throws {
    #expect(
      try SchedulingParity.json(preferenceConflicts(parity.input))
        == SchedulingParity.json(parity.output))
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.partitionForRecommendationStrip", StripInput.self, StripOutput.self))
  func strip(_ parity: ParityCase<StripInput, StripOutput>) {
    let partition = partitionForRecommendationStrip(
      parity.input.people.map(\.person), settled: parity.input.settled)
    #expect(partition.onSlot.map(\.id) == parity.output.onSlot)
    #expect(partition.candidates.map(\.id) == parity.output.candidates)
    #expect(partition.exceptions.map(\.id) == parity.output.exceptions)
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.buildScheduleDays", ScheduleDaysInput.self, [ScheduleDay].self))
  func scheduleDays(_ parity: ParityCase<ScheduleDaysInput, [ScheduleDay]>) throws {
    let input = parity.input
    let days =
      if let halfRangeDays = input.halfRangeDays {
        buildScheduleDays(
          history: input.history, referenceDate: input.referenceDate,
          timeZone: input.timeZone, halfRangeDays: halfRangeDays)
      } else {
        buildScheduleDays(
          history: input.history, referenceDate: input.referenceDate, timeZone: input.timeZone)
      }
    #expect(try SchedulingParity.json(days) == SchedulingParity.json(parity.output))
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.summarizeCandidateSchedule", SummaryInput.self, [String].self))
  func scheduleSummary(_ parity: ParityCase<SummaryInput, [String]>) {
    let input = parity.input
    #expect(
      summarizeCandidateSchedule(
        input.frequency, referenceDate: input.referenceDate, timeZone: input.timeZone,
        onThisPlan: input.onThisPlan) == parity.output)
  }

  @Test(arguments: Parity.cases("scheduling.positionFromLabel", String.self, String.self))
  func positionLabel(_ parity: ParityCase<String, String>) {
    #expect(positionFromLabel(parity.input).utf16.elementsEqual(parity.output.utf16))
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.otherPlanAssignmentLabels", OtherLabelsInput.self, [String].self))
  func otherLabels(_ parity: ParityCase<OtherLabelsInput, [String]>) throws {
    let input = parity.input
    let labels = otherPlanAssignments(
      labels: input.labels, teamName: input.teamName, positionName: input.positionName)
    #expect(try SchedulingParity.json(labels) == SchedulingParity.json(parity.output))
  }
}

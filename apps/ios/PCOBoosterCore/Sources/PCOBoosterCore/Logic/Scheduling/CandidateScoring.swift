import Foundation

// Port of packages/planning-center-models/src/candidate-scoring.ts. Pinned by the
// `scheduling.scoreAndNormalize` and `scheduling.sortForSelection` parity suites in
// scripts/parity/scheduling.parity.ts. `groupRankingReasons` reads the reasoning lines by
// their wording, so the copy must stay exactly as written.

/// Whether a candidate's blockouts are known yet (`AvailabilityStatus`).
public enum CandidateAvailability: String, Codable, Hashable, Sendable, CaseIterable {
  case available
  case blocked
  case unknown
}

/// One person in a slot's candidate list, with whatever history, availability, and score
/// has arrived (`PersonWithAvailability` as the candidate list builds it).
public struct CandidatePerson: Codable, Hashable, Sendable, Identifiable {
  public var id: String
  public var firstName: String
  public var lastName: String
  public var fullName: String
  public var photoUrl: String?
  public var photoThumbnailUrl: String?
  public var archived: Bool
  /// `unknown` until the person's candidate details arrive.
  public var availability: CandidateAvailability
  /// Nil until the person's history arrives.
  public var frequency: ScheduleFrequency?
  /// The history within the plan history range, sorted; nil until it arrives.
  public var serviceHistory: [ServiceHistoryItem]?
  /// Whether a blockout covers the plan's day; nil until candidate details arrive.
  public var isBlockedForDate: Bool?
  public var isScheduledForSelectedPlanPosition: Bool
  public var isConfirmedForSelectedPlanPosition: Bool
  public var isDeclinedForSelectedPlanPosition: Bool
  /// Planning Center's `decline_reason`, when the person declined the selected slot.
  public var selectedPlanDeclineReason: String?
  /// "Team - Position" labels of the person's other non-declined assignments on the plan.
  public var selectedPlanAssignmentLabels: [String]
  /// The plan person to update or remove for the selected slot.
  public var scheduledPlanPersonId: String?
  /// What the person told Planning Center about when and how often to serve this position.
  public var schedulingPreferences: SchedulingPreferences?
  /// 0 to 100 across available people once every part has arrived; blocked people keep
  /// their raw score. Nil until then.
  public var recommendationScore: Double?
  /// Why the score is what it is; `groupRankingReasons` turns these into facts. Empty until
  /// scored.
  public var recommendationReasoning: [String]

  public init(
    id: String,
    firstName: String,
    lastName: String,
    fullName: String,
    photoUrl: String? = nil,
    photoThumbnailUrl: String? = nil,
    archived: Bool = false,
    availability: CandidateAvailability = .unknown,
    frequency: ScheduleFrequency? = nil,
    serviceHistory: [ServiceHistoryItem]? = nil,
    isBlockedForDate: Bool? = nil,
    isScheduledForSelectedPlanPosition: Bool = false,
    isConfirmedForSelectedPlanPosition: Bool = false,
    isDeclinedForSelectedPlanPosition: Bool = false,
    selectedPlanDeclineReason: String? = nil,
    selectedPlanAssignmentLabels: [String] = [],
    scheduledPlanPersonId: String? = nil,
    schedulingPreferences: SchedulingPreferences? = nil,
    recommendationScore: Double? = nil,
    recommendationReasoning: [String] = []
  ) {
    self.id = id
    self.firstName = firstName
    self.lastName = lastName
    self.fullName = fullName
    self.photoUrl = photoUrl
    self.photoThumbnailUrl = photoThumbnailUrl
    self.archived = archived
    self.availability = availability
    self.frequency = frequency
    self.serviceHistory = serviceHistory
    self.isBlockedForDate = isBlockedForDate
    self.isScheduledForSelectedPlanPosition = isScheduledForSelectedPlanPosition
    self.isConfirmedForSelectedPlanPosition = isConfirmedForSelectedPlanPosition
    self.isDeclinedForSelectedPlanPosition = isDeclinedForSelectedPlanPosition
    self.selectedPlanDeclineReason = selectedPlanDeclineReason
    self.selectedPlanAssignmentLabels = selectedPlanAssignmentLabels
    self.scheduledPlanPersonId = scheduledPlanPersonId
    self.schedulingPreferences = schedulingPreferences
    self.recommendationScore = recommendationScore
    self.recommendationReasoning = recommendationReasoning
  }
}

/// The selected plan and slot, for scoring against Planning Center scheduling preferences
/// (`ScoringSlot`).
public struct ScoringSlot: Hashable, Sendable {
  public var planId: String?
  public var slotTimePreferenceOptionId: String?

  public init(planId: String? = nil, slotTimePreferenceOptionId: String? = nil) {
    self.planId = planId
    self.slotTimePreferenceOptionId = slotTimePreferenceOptionId
  }
}

/// Scores every person from their frequency and preferences, then normalizes the scores of
/// people not blocked on the plan's day to 0 to 100 (`scoreAndNormalizePeople`, which
/// mutates its argument; this returns the scored copy).
public func scoreAndNormalize(
  _ people: [CandidatePerson],
  referenceDate: Date,
  timeZone: String,
  slot: ScoringSlot = ScoringSlot()
) -> [CandidatePerson] {
  var scored = people
  for index in scored.indices {
    let result = RecommendationScore(
      scored[index], referenceDate: referenceDate, timeZone: timeZone, slot: slot)
    scored[index].recommendationScore = Double(result.score)
    scored[index].recommendationReasoning = result.reasoning
  }
  let available = scored.compactMap { person in
    person.isBlockedForDate == true ? nil : person.recommendationScore
  }
  let minScore = available.min() ?? 0
  let maxScore = available.max() ?? 100
  let scoreRange = maxScore - minScore
  for index in scored.indices where scored[index].isBlockedForDate != true {
    guard let score = scored[index].recommendationScore else { continue }
    let normalized = scoreRange > 0 ? ((score - minScore) / scoreRange) * 100 : 50
    scored[index].recommendationScore = JSParity.round(normalized * 100) / 100
  }
  return scored
}

/// Confirmed for the slot first, then scheduled, then everyone not blocked, by score and
/// then name (`sortPeopleForSelection`, which sorts in place; this returns the sorted copy).
public func sortForSelection(_ people: [CandidatePerson]) -> [CandidatePerson] {
  JSSort.sorted(people) { a, b in
    if let order = firstWhereTrue(
      a.isConfirmedForSelectedPlanPosition, b.isConfirmedForSelectedPlanPosition)
    {
      return order
    }
    if let order = firstWhereTrue(
      a.isScheduledForSelectedPlanPosition, b.isScheduledForSelectedPlanPosition)
    {
      return order
    }
    if let order = firstWhereTrue(a.isBlockedForDate != true, b.isBlockedForDate != true) {
      return order
    }
    let scoreDifference = (b.recommendationScore ?? 0) - (a.recommendationScore ?? 0)
    if scoreDifference != 0 {
      return scoreDifference
    }
    return Double(JSCollator.compare(a.fullName, b.fullName))
  }
}

/// -1 when only `a` holds, 1 when only `b` does, nil when both or neither do.
private func firstWhereTrue(_ a: Bool, _ b: Bool) -> Double? {
  if a, !b {
    return -1
  }
  if !a, b {
    return 1
  }
  return nil
}

/// The history-based score, lowered where it goes against what the person told Planning
/// Center (`calculateRecommendationScore`).
private struct RecommendationScore {
  private(set) var score: Int
  private(set) var reasoning: [String] = []

  init(_ person: CandidatePerson, referenceDate: Date, timeZone: String, slot: ScoringSlot) {
    score = 0
    guard let frequency = person.frequency else {
      // Missing frequency data counts as a clean, unloaded candidate rather than a low
      // fallback score that would push them down the list.
      score = 130
      reasoning = ["No service history available (treated as no recent/upcoming load)"]
      addPreferences(person, referenceDate: referenceDate, timeZone: timeZone, slot: slot)
      return
    }
    scoreHistory(frequency, referenceDate: referenceDate, timeZone: timeZone)
    addPreferences(person, referenceDate: referenceDate, timeZone: timeZone, slot: slot)
  }

  private mutating func addPreferences(
    _ person: CandidatePerson, referenceDate: Date, timeZone: String, slot: ScoringSlot
  ) {
    guard let preferences = person.schedulingPreferences else { return }
    let result = scoreSchedulingPreferences(
      preferences,
      history: person.serviceHistory ?? [],
      context: SchedulingPreferenceContext(
        referenceDate: referenceDate,
        timeZone: timeZone,
        planId: slot.planId,
        slotTimePreferenceOptionId: slot.slotTimePreferenceOptionId))
    score -= result.penalty
    reasoning.append(contentsOf: result.reasoning)
  }

  private mutating func scoreHistory(
    _ frequency: ScheduleFrequency, referenceDate: Date, timeZone: String
  ) {
    let baseScore = 100 - frequency.recentServedDays * 10
    let daysSinceLastServed =
      frequency.lastServedDate.map {
        OrgCalendar.daysBetween($0, referenceDate, timeZone: timeZone)
      } ?? 999
    let recencyBonus = min(max(daysSinceLastServed, 0), 30)
    let upcomingPenalty = frequency.upcomingServices * 20
    let upcomingRehearsalPenalty = frequency.upcomingRehearsals * 8
    let upcomingProximityPenalty = Self.proximityPenalty(
      frequency.nextUpcomingDate, referenceDate: referenceDate, timeZone: timeZone,
      near: 30, later: 15)
    let rehearsalProximityPenalty = Self.proximityPenalty(
      frequency.nextRehearsalDate, referenceDate: referenceDate, timeZone: timeZone,
      near: 12, later: 6)
    let recentRehearsalPenalty = frequency.recentRehearsalOnlyDays * 4
    score =
      baseScore + recencyBonus - upcomingPenalty - upcomingProximityPenalty
      - recentRehearsalPenalty - upcomingRehearsalPenalty - rehearsalProximityPenalty

    appendLastService(frequency, daysSinceLastServed: daysSinceLastServed, timeZone: timeZone)
    appendUpcomingService(frequency, referenceDate: referenceDate, timeZone: timeZone)
    appendUpcomingRehearsal(frequency, referenceDate: referenceDate, timeZone: timeZone)
    appendRecentLoad(frequency)
  }

  private static func proximityPenalty(
    _ nextDate: Date?, referenceDate: Date, timeZone: String, near: Int, later: Int
  ) -> Int {
    guard let nextDate else { return 0 }
    let daysUntilNext = OrgCalendar.daysBetween(referenceDate, nextDate, timeZone: timeZone)
    if daysUntilNext <= 7 {
      return near
    }
    if daysUntilNext <= 14 {
      return later
    }
    return 0
  }

  private static func formatDate(_ date: Date, timeZone: String) -> String {
    OrgCalendar.label(date, timeZone: timeZone, style: .weekdayMonthDayYear)
  }

  private static func days(_ count: Int) -> String {
    "day\(count == 1 ? "" : "s")"
  }

  private mutating func appendLastService(
    _ frequency: ScheduleFrequency, daysSinceLastServed: Int, timeZone: String
  ) {
    guard let lastServedDate = frequency.lastServedDate else {
      if frequency.totalServed == 0 {
        reasoning.append("No past services scheduled")
      }
      return
    }
    let lastServed = Self.formatDate(lastServedDate, timeZone: timeZone)
    switch daysSinceLastServed {
    case 0: reasoning.append("Last served on the same date (\(lastServed))")
    case 1: reasoning.append("Last served 1 day before on \(lastServed)")
    default: reasoning.append("Last served \(daysSinceLastServed) days before on \(lastServed)")
    }
  }

  private mutating func appendUpcomingService(
    _ frequency: ScheduleFrequency, referenceDate: Date, timeZone: String
  ) {
    guard frequency.upcomingServices > 0, let nextDate = frequency.nextUpcomingDate else {
      return
    }
    let next = Self.formatDate(nextDate, timeZone: timeZone)
    let daysUntilNext = OrgCalendar.daysBetween(referenceDate, nextDate, timeZone: timeZone)
    if frequency.upcomingServices == 1 {
      reasoning.append(
        daysUntilNext == 1
          ? "Upcoming: 1 day after on \(next)"
          : "Upcoming: \(daysUntilNext) days after on \(next)")
    } else {
      reasoning.append(
        "Upcoming: \(frequency.upcomingServices) days scheduled (\(daysUntilNext) days after on \(next))"
      )
    }
    if daysUntilNext <= 7 {
      reasoning.append("Ranked lower: scheduled \(daysUntilNext) \(Self.days(daysUntilNext)) after")
    } else if daysUntilNext <= 14 {
      reasoning.append("Ranked slightly lower: scheduled \(daysUntilNext) days after")
    } else if daysUntilNext <= 21 {
      reasoning.append("Minor penalty: scheduled \(daysUntilNext) days after")
    }
  }

  private mutating func appendUpcomingRehearsal(
    _ frequency: ScheduleFrequency, referenceDate: Date, timeZone: String
  ) {
    guard frequency.upcomingRehearsals > 0, let rehearsalDate = frequency.nextRehearsalDate else {
      return
    }
    let next = Self.formatDate(rehearsalDate, timeZone: timeZone)
    let daysUntil = OrgCalendar.daysBetween(referenceDate, rehearsalDate, timeZone: timeZone)
    reasoning.append(
      frequency.upcomingRehearsals == 1
        ? "Rehearsal upcoming: \(daysUntil) \(Self.days(daysUntil)) after on \(next)"
        : "Rehearsals upcoming: \(frequency.upcomingRehearsals) scheduled (\(daysUntil) days after on \(next))"
    )
    if daysUntil <= 7 {
      reasoning.append(
        "Slight rehearsal penalty: rehearsal \(daysUntil) \(Self.days(daysUntil)) after")
    } else if daysUntil <= 14 {
      reasoning.append("Minor rehearsal penalty: rehearsal \(daysUntil) days after")
    }
  }

  private mutating func appendRecentLoad(_ frequency: ScheduleFrequency) {
    let weeks = ScheduleConstants.halfRangeWeeksLabel()
    let recentEngagementDays = frequency.recentServedDays + frequency.recentRehearsalOnlyDays
    if recentEngagementDays >= 3 {
      reasoning.append(
        "Ranked lower: on the schedule \(recentEngagementDays) distinct days in the \(weeks) before this plan"
      )
    }
    let rehearsed = frequency.recentRehearsalOnlyDays
    if rehearsed >= 2 {
      reasoning.append(
        "Light penalty: rehearsed \(rehearsed) \(Self.days(rehearsed)) in the \(weeks) before this plan"
      )
    }
  }
}

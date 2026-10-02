import Foundation

// Ports of the candidate tile helpers in apps/web/src/lib/people/: the recommendation strip
// order (recommendation-strip-order.ts), the schedule day bars (schedule-days.ts), and the
// schedule facts under a name (candidate-summary.ts). Pinned by the
// `scheduling.partitionForRecommendationStrip`, `scheduling.buildScheduleDays`, and
// `scheduling.summarizeCandidateSchedule` parity suites in scripts/parity/scheduling.parity.ts.

/// People already on the slot, everyone who could be added (by recommendation), and blocked
/// or declined people at the end (`RecommendationStripPartition`).
public struct RecommendationStripPartition: Hashable, Sendable {
  /// Confirmed before pending, then by score and name.
  public var onSlot: [CandidatePerson]
  /// By score, then name.
  public var candidates: [CandidatePerson]
  /// Blocked before declined, then by score and name.
  public var exceptions: [CandidatePerson]

  public init(
    onSlot: [CandidatePerson], candidates: [CandidatePerson], exceptions: [CandidatePerson]
  ) {
    self.onSlot = onSlot
    self.candidates = candidates
    self.exceptions = exceptions
  }
}

/// Splits people for the recommendation strip (`partitionPeopleForRecommendationStrip`).
///
/// Pass `settled: false` while history or availability is still arriving: scores do not
/// exist yet (people sort by name), and blocked people stay in place with their label instead
/// of moving to the end, so the list reorders once, when everything has arrived. People who
/// declined the slot are known from the first response and go to the end at once. Someone on
/// the slot stays with it even when blocked, so the conflict is in view.
public func partitionForRecommendationStrip(
  _ people: [CandidatePerson], settled: Bool = true
) -> RecommendationStripPartition {
  var onSlot: [CandidatePerson] = []
  var candidates: [CandidatePerson] = []
  var exceptions: [CandidatePerson] = []
  for person in people {
    let declined = person.isDeclinedForSelectedPlanPosition
    let belongsAtEnd = settled ? person.isBlockedForDate == true || declined : declined
    if !declined,
      person.isConfirmedForSelectedPlanPosition || person.isScheduledForSelectedPlanPosition
    {
      onSlot.append(person)
    } else if belongsAtEnd {
      exceptions.append(person)
    } else {
      candidates.append(person)
    }
  }
  return RecommendationStripPartition(
    onSlot: JSSort.sorted(onSlot) { a, b in
      let byStatus = Double(onSlotRank(a) - onSlotRank(b))
      return byStatus != 0 ? byStatus : byScoreThenName(a, b)
    },
    candidates: JSSort.sorted(candidates, by: byScoreThenName),
    exceptions: JSSort.sorted(exceptions) { a, b in
      let byReason = Double(exceptionRank(a) - exceptionRank(b))
      return byReason != 0 ? byReason : byScoreThenName(a, b)
    })
}

/// Confirmed before pending.
private func onSlotRank(_ person: CandidatePerson) -> Int {
  person.isConfirmedForSelectedPlanPosition ? 0 : 1
}

/// Blocked before declined.
private func exceptionRank(_ person: CandidatePerson) -> Int {
  if person.isBlockedForDate == true {
    return 0
  }
  return person.isDeclinedForSelectedPlanPosition ? 1 : 2
}

private func byScoreThenName(_ a: CandidatePerson, _ b: CandidatePerson) -> Double {
  let aScore = a.recommendationScore ?? 0
  let bScore = b.recommendationScore ?? 0
  if bScore != aScore {
    return bScore - aScore
  }
  return Double(JSCollator.compare(a.fullName, b.fullName))
}

/// What a congregation day around a plan holds for one person (`ScheduleDayKind`).
public enum ScheduleDayKind: String, Codable, Hashable, Sendable, CaseIterable {
  case service
  case rehearsal
  case free
}

/// Whether every service on a day is confirmed.
public enum ScheduleDayStatus: String, Codable, Hashable, Sendable, CaseIterable {
  case confirmed
  case pending
}

/// One congregation day around a plan, for the schedule day bars (`ScheduleDay`).
public struct ScheduleDay: Codable, Hashable, Sendable, Identifiable {
  /// Days from the plan: negative before it, 0 for the plan's own day.
  public var offset: Int
  /// `YYYY-MM-DD` in the organization's zone.
  public var dayKey: String
  public var kind: ScheduleDayKind
  /// For service days: confirmed only when every service that day is; nil otherwise.
  public var status: ScheduleDayStatus?
  /// What the person is on that day, for the day's label.
  public var items: [ServiceHistoryItem]

  public var id: String { dayKey }

  public init(
    offset: Int,
    dayKey: String,
    kind: ScheduleDayKind,
    status: ScheduleDayStatus?,
    items: [ServiceHistoryItem]
  ) {
    self.offset = offset
    self.dayKey = dayKey
    self.kind = kind
    self.status = status
    self.items = items
  }
}

/// Every congregation day from `halfRangeDays` before a plan to `halfRangeDays` after it,
/// with what the person serves or rehearses on each (`buildScheduleDays`). Declined schedules
/// are left out; they are not time served. The range defaults to the history the candidate
/// list loads.
public func buildScheduleDays(
  history: [ServiceHistoryItem],
  referenceDate: Date,
  timeZone: String,
  halfRangeDays: Int = ScheduleConstants.planHistoryHalfRangeDays
) -> [ScheduleDay] {
  let planDay = OrgCalendar.dayKey(referenceDate, timeZone: timeZone)
  var itemsByOffset: [Int: [ServiceHistoryItem]] = [:]
  for item in history where !scheduleStatusIs(item.status, "d", "declined") {
    let offset = -OrgCalendar.daysRefMinusItem(
      itemDayKey: OrgCalendar.dayKey(item.date, timeZone: timeZone), refDayKey: planDay)
    if abs(offset) <= halfRangeDays {
      itemsByOffset[offset, default: []].append(item)
    }
  }
  return stride(from: -halfRangeDays, through: halfRangeDays, by: 1).map { offset in
    let items = itemsByOffset[offset] ?? []
    let services = items.filter { $0.timeType != .rehearsal }
    let kind: ScheduleDayKind =
      if items.isEmpty {
        .free
      } else if services.isEmpty {
        .rehearsal
      } else {
        .service
      }
    let status: ScheduleDayStatus? =
      if services.isEmpty {
        nil
      } else if services.allSatisfy({ scheduleStatusIs($0.status, "c", "confirmed") }) {
        .confirmed
      } else {
        .pending
      }
    return ScheduleDay(
      offset: offset,
      // Day keys are civil dates, so rolling them in UTC cannot cross a DST change.
      dayKey: OrgCalendar.addDays(to: planDay, offset, timeZone: "UTC"),
      kind: kind,
      status: status,
      items: items)
  }
}

/// Whether a status, trimmed and lowercased, is one of `codes`.
private func scheduleStatusIs(_ status: String, _ codes: String...) -> Bool {
  let raw = MusicText.lowercased(JSParity.trim(status))
  return codes.contains { JSString.equal(raw, $0) }
}

/// The few schedule facts a leader weighs before adding someone, as short phrases for one
/// line under their name: when they last served before this plan and when they serve next
/// after it (`summarizeCandidateSchedule`). Dates are congregation calendar days; a service on
/// the plan's own day is "Serving that day", not their last time, and is left out for someone
/// already on this plan.
public func summarizeCandidateSchedule(
  _ frequency: ScheduleFrequency?,
  referenceDate: Date?,
  timeZone: String,
  onThisPlan: Bool = false
) -> [String] {
  guard let frequency else { return [] }
  var facts: [String] = []
  let lastServedDate = frequency.lastServedDate
  let servesThatDay =
    if let lastServedDate, let referenceDate {
      OrgCalendar.dayKey(lastServedDate, timeZone: timeZone)
        == OrgCalendar.dayKey(referenceDate, timeZone: timeZone)
    } else {
      false
    }
  if servesThatDay {
    if !onThisPlan {
      facts.append("Serving that day")
    }
  } else if let lastServedDate {
    facts.append(
      "Last served \(OrgCalendar.label(lastServedDate, timeZone: timeZone, style: .monthDay))")
  } else {
    facts.append("No recent services")
  }
  if let next = frequency.nextUpcomingDate {
    facts.append("Next on \(OrgCalendar.label(next, timeZone: timeZone, style: .monthDay))")
  }
  return facts
}

import Foundation

// Port of apps/web/src/lib/position-candidates.ts, the glue that loads a slot's candidate
// list progressively: the details batch plan, the window and blockout progress checks, list
// assembly with its progress counts, and window expansion. Pinned by the
// `scheduling.constants`, `scheduling.planCandidateDetailsBatches`,
// `scheduling.needsScheduleHistory`, `scheduling.windowHistoryAdvanced`,
// `scheduling.advancedBlockoutChecks`, `scheduling.assembleCandidateList`,
// `scheduling.candidateListGolden`, `scheduling.expandWindowHistory`, and
// `scheduling.collectCandidateDetails` parity suites in scripts/parity/scheduling.parity.ts.

/// How the candidate list's detail calls are batched; the web uses the same values.
public enum CandidateListLoading {
  /// People per `people.candidateDetails` call (`PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE`).
  public static let detailsBatchSize = 16
  /// Detail calls in flight at once (`CANDIDATE_DETAILS_BATCH_CONCURRENCY`). Each costs about
  /// 20 Planning Center requests cold, and the user's budget is 100 per 20 seconds.
  public static let detailsBatchConcurrency = 2
}

/// Candidate ids in list order, cut into detail batches (`planCandidateDetailsBatches`).
/// A batch size below 1 counts as 1, where the TypeScript would loop forever.
public func planCandidateDetailsBatches(
  _ candidates: PositionCandidates?, batchSize: Int = CandidateListLoading.detailsBatchSize
) -> [[String]] {
  let ids = candidates?.candidates.map(\.id) ?? []
  let size = max(batchSize, 1)
  return stride(from: 0, to: ids.count, by: size).map { start in
    Array(ids[start..<min(start + size, ids.count)])
  }
}

/// The window had no plans to take history from, so every candidate's history comes from
/// their own schedules instead (`needsScheduleHistory`). Unknown (false) until every window
/// call has arrived.
public func needsScheduleHistory(_ windowCalls: [PlanWindowHistoryBatch]?) -> Bool {
  guard let windowCalls else { return false }
  return windowCalls.allSatisfy { $0.loadedPlanCount == 0 }
}

/// Whether a follow-up window call got anywhere: it read a roster, dropped a plan that left
/// the window, or listed another service type's plans (`windowHistoryAdvanced`). A call that
/// did none would repeat forever, so treat it as an error.
public func windowHistoryAdvanced(
  continuation: PeoplePlanWindowHistoryInputContinuation, batch: PlanWindowHistoryBatch
) -> Bool {
  let stillDeferred = Set(batch.deferredPlans.map { JSString.key($0.planId) })
  return batch.loadedPlanCount > 0
    || batch.deferredServiceTypeIds.count < continuation.serviceTypeIds.count
    || continuation.plans.contains { !stillDeferred.contains(JSString.key($0.planId)) }
}

/// Whether a candidate details call checked another blockout or found a block
/// (`advancedBlockoutChecks`).
public func advancedBlockoutChecks(
  before: [BlockoutProgress], after: [BlockoutProgress]
) -> Bool {
  var earlier: [[UInt16]: BlockoutProgress] = [:]
  for entry in before {
    earlier[JSString.key(entry.personId)] = entry
  }
  return after.contains { entry in
    let previous = earlier[JSString.key(entry.personId)]
    return entry.blocked != (previous?.blocked ?? false)
      || entry.checkedBlockoutIds.count > (previous?.checkedBlockoutIds.count ?? 0)
  }
}

/// How much of the candidate list has arrived (`CandidateListProgress`).
public struct CandidateListProgress: Codable, Hashable, Sendable {
  public var candidateCount: Int
  /// Candidates whose availability (and history, when it is theirs) arrived.
  public var detailedCount: Int
  public var historyLoaded: Bool

  public init(candidateCount: Int, detailedCount: Int, historyLoaded: Bool) {
    self.candidateCount = candidateCount
    self.detailedCount = detailedCount
    self.historyLoaded = historyLoaded
  }
}

/// The candidate list as far as its parts have arrived (`CandidateList`).
public struct CandidateList: Codable, Hashable, Sendable {
  public var people: [CandidatePerson]
  /// Every part arrived: scores exist and people are sorted for selection.
  public var complete: Bool
  public var progress: CandidateListProgress

  public init(people: [CandidatePerson], complete: Bool, progress: CandidateListProgress) {
    self.people = people
    self.complete = complete
    self.progress = progress
  }
}

/// The candidate list as far as its parts have arrived (`assembleCandidateList`). People
/// without history or availability yet have no score and `availability` `.unknown`.
///
/// - Parameters:
///   - windowHistory: Expanded window history (`expandWindowHistory`); nil while it loads or
///     when it is not used.
///   - scheduleHistory: History comes from `details` instead of the window
///     (`needsScheduleHistory`).
///   - details: Candidate details by person id (`collectCandidateDetails`).
///   - date: The selected plan's sort instant.
///   - slotTimePreferenceOptionId: The service time the selected slot is needed for, when
///     Planning Center says.
public func assembleCandidateList(
  candidates: PositionCandidates,
  windowHistory: [String: CandidateHistory]?,
  scheduleHistory: Bool,
  details: [String: CandidateDetail],
  date: Date,
  slotTimePreferenceOptionId: String? = nil
) -> CandidateList {
  let assembled = assemblePositionCandidates(
    PositionCandidateSources(
      candidates: candidates.candidates,
      match: candidates.match,
      referenceDate: date,
      timeZone: candidates.timeZone,
      slotTimePreferenceOptionId: slotTimePreferenceOptionId,
      historyFor: { personId in
        if scheduleHistory {
          return details[personId]?.history
        }
        return windowHistory.map { $0[personId] ?? .empty }
      },
      blockedFor: { details[$0]?.isBlockedForDate }))
  let detailedCount = candidates.candidates.count(where: { candidate in
    guard let detail = details[candidate.id] else { return false }
    return !scheduleHistory || detail.history != nil
  })
  return CandidateList(
    people: assembled.people,
    complete: assembled.complete,
    progress: CandidateListProgress(
      candidateCount: candidates.candidates.count,
      detailedCount: detailedCount,
      historyLoaded: scheduleHistory || windowHistory != nil))
}

/// Each person's window history, or nil while it loads or when the window had no plans
/// (`expandWindowHistory`).
public func expandWindowHistory(
  _ windowCalls: [PlanWindowHistoryBatch]?, planId: String
) -> [String: CandidateHistory]? {
  guard let windowCalls, !needsScheduleHistory(windowCalls) else { return nil }
  return expandPlanWindowHistory(windowCalls, selectedPlanId: planId)
}

/// Details from every settled batch, keyed by person; a later batch's entry wins
/// (`collectCandidateDetails`).
public func collectCandidateDetails(_ batches: [[CandidateDetail]?]) -> [String: CandidateDetail] {
  var details: [String: CandidateDetail] = [:]
  for detail in batches.compactMap(\.self).joined() {
    details[detail.personId] = detail
  }
  return details
}

import Foundation
import Observation
import PCOBoosterCore

/// A position on a plan, as Assign loads candidates for it (`CandidateSlot` on the web).
nonisolated struct CandidateSlot: Hashable, Sendable {
  let serviceTypeId: String
  let teamId: String
  let positionId: String
  let planId: String
  /// The plan's sort instant; its ISO string keys the window history and candidate details.
  let date: Date
  /// The service time the slot is needed for; people who prefer other times rank lower.
  let timePreferenceOptionId: String?

  var dateKey: String { JSONCoding.isoString(date) }

  var candidatesKey: QueryKey {
    .positionCandidates(
      serviceTypeId: serviceTypeId, teamId: teamId, positionId: positionId, planId: planId)
  }

  var candidatesInput: PeoplePositionCandidatesInput {
    PeoplePositionCandidatesInput(
      serviceTypeId: serviceTypeId, positionId: positionId, teamId: teamId, planId: planId)
  }
}

/// A slot's candidate list, loaded progressively as on the web (`usePositionCandidates`):
/// the candidates first (about 3 Planning Center requests), then the plan-window history
/// (every continuation followed) and the candidates' details in batches of 16 with 2 in
/// flight, each call within the per-call request budget. Parts that arrive fill in scores,
/// labels, and availability; a failed part is offered for retry, never shown as empty.
@MainActor
@Observable
final class CandidatePipeline {
  /// What the details load depends on; a change restarts it.
  struct DetailsRequest: Hashable {
    var candidateIds: [String]
    var scheduleHistory: Bool
  }

  let slot: CandidateSlot
  let candidates: QueryState<PositionCandidates>
  let windowHistory: QueryState<[PlanWindowHistoryBatch]>

  /// Details by person id, from every batch that has arrived (cached batches included).
  private(set) var details: [String: CandidateDetail] = [:]
  /// Batches (by their person ids) whose last load failed.
  private(set) var failedBatches: Set<[String]> = []
  private(set) var isLoadingDetails = false
  /// The list may show: scores arrived, a part failed, or the hold ran out.
  private(set) var holdReleased = false

  @ObservationIgnored private let queries: QueryClient
  @ObservationIgnored private var holdTask: Task<Void, Never>?
  @ObservationIgnored private var memo: (key: MemoKey, list: CandidateList)?
  @ObservationIgnored private var detailsVersion = 0

  /// How long the list stays on its skeleton after the candidates arrive, waiting for scores,
  /// so it doesn't reorder under the finger (`SCORE_HOLD_MS`).
  static let scoreHold: Duration = .milliseconds(1500)

  init(queries: QueryClient, slot: CandidateSlot) {
    self.queries = queries
    self.slot = slot
    candidates = queries.query(slot.candidatesKey, RPC.People.positionCandidates, slot.candidatesInput)
    windowHistory = queries.query(
      .planWindowHistory(dateKey: slot.dateKey),
      fetch: Self.windowHistoryFetch(dateKey: slot.dateKey))
    seedDetailsFromCache()
    if list?.complete == true {
      holdReleased = true
    }
  }

  // MARK: Derived

  var scheduleHistory: Bool { needsScheduleHistory(windowHistory.value) }

  var detailsRequest: DetailsRequest {
    DetailsRequest(
      candidateIds: candidates.value?.candidates.map(\.id) ?? [], scheduleHistory: scheduleHistory)
  }

  /// The list as far as its parts have arrived; nil until the candidates load.
  var list: CandidateList? {
    guard let candidates = candidates.value else { return nil }
    let windowCalls = windowHistory.value
    let key = MemoKey(candidates: candidates, windowCalls: windowCalls, detailsVersion: detailsVersion)
    if let memo, memo.key == key {
      return memo.list
    }
    let scheduleHistory = needsScheduleHistory(windowCalls)
    let list = assembleCandidateList(
      candidates: candidates,
      windowHistory: expandWindowHistory(windowCalls, planId: slot.planId),
      scheduleHistory: scheduleHistory,
      details: details,
      date: slot.date,
      slotTimePreferenceOptionId: slot.timePreferenceOptionId)
    memo = (key, list)
    return list
  }

  /// Parts that failed: the window history, plus each failed detail batch.
  var failedPartCount: Int {
    (windowHistory.status == .failure && windowHistory.value == nil ? 1 : 0) + failedBatches.count
  }

  /// Candidates show while history or availability still loads.
  var isEnriching: Bool {
    guard let list else { return false }
    return !list.complete && failedPartCount == 0
  }

  var isFetching: Bool {
    candidates.isLoading || candidates.isRefreshing || windowHistory.isLoading
      || windowHistory.isRefreshing || isLoadingDetails
  }

  /// No candidates to show yet, or they are held briefly for their scores.
  var isLoading: Bool {
    if candidates.value == nil {
      return candidates.status != .failure
    }
    return isEnriching && !holdReleased
  }

  /// The candidates themselves failed to load (nothing to show).
  var candidatesError: String? {
    candidates.value == nil ? candidates.errorMessage : nil
  }

  // MARK: Loading

  /// Loads the detail batches for the current candidates, 2 at a time. Cached, fresh batches
  /// come back at once; the rest load and land as they arrive. Run from `.task(id:
  /// detailsRequest)` so a new candidate set or history mode restarts it.
  func loadDetails() async {
    let request = detailsRequest
    guard !request.candidateIds.isEmpty else { return }
    startHoldIfNeeded()
    failedBatches = []
    isLoadingDetails = true
    let queries = queries
    let slot = slot
    let scheduleHistory = request.scheduleHistory
    let outcomes = await BatchedLoad.run(
      request.candidateIds,
      batchSize: CandidateListLoading.detailsBatchSize,
      maxConcurrent: CandidateListLoading.detailsBatchConcurrency
    ) { ids, _ in
      try await queries.fetch(
        Self.detailsKey(slot: slot, ids: ids, scheduleHistory: scheduleHistory),
        fetch: Self.detailsFetch(slot: slot, ids: ids, scheduleHistory: scheduleHistory))
    } onBatch: { [weak self] outcome, _ in
      self?.apply(outcome)
    }
    guard !Task.isCancelled, request == detailsRequest else { return }
    isLoadingDetails = false
    if outcomes.contains(where: { $0.error != nil && !($0.error?.isCancellation ?? false) }) {
      holdReleased = true
    }
    if list?.complete == true {
      holdReleased = true
    }
  }

  /// Retries the window history and every failed detail batch.
  func retryFailed() {
    if windowHistory.status == .failure {
      windowHistory.retry()
    }
    guard !failedBatches.isEmpty else { return }
    let failed = failedBatches
    failedBatches = []
    let queries = queries
    let slot = slot
    let scheduleHistory = scheduleHistory
    isLoadingDetails = true
    Task { [weak self] in
      let ids = failed.flatMap(\.self)
      let outcomes = await BatchedLoad.run(
        ids,
        batchSize: CandidateListLoading.detailsBatchSize,
        maxConcurrent: CandidateListLoading.detailsBatchConcurrency
      ) { batch, _ in
        try await queries.fetch(
          Self.detailsKey(slot: slot, ids: batch, scheduleHistory: scheduleHistory),
          fetch: Self.detailsFetch(slot: slot, ids: batch, scheduleHistory: scheduleHistory))
      } onBatch: { outcome, _ in
        self?.apply(outcome)
      }
      _ = outcomes
      self?.isLoadingDetails = false
    }
  }

  /// Pull to refresh: the candidates and the window history again, then the details.
  func refresh() async {
    async let candidatesDone: Void = candidates.refresh()
    async let historyDone: Void = windowHistory.refresh()
    _ = await (candidatesDone, historyDone)
  }

  func appear() {
    candidates.appear()
    windowHistory.appear()
  }

  func disappear() {
    candidates.disappear()
    windowHistory.disappear()
    holdTask?.cancel()
  }

  private func apply(_ outcome: BatchOutcome<String, [CandidateDetail]>) {
    switch outcome.result {
    case .success(let people):
      failedBatches.remove(outcome.items)
      for detail in people {
        details[detail.personId] = detail
      }
      detailsVersion += 1
    case .failure(let error):
      if !error.isCancellation {
        failedBatches.insert(outcome.items)
      }
    }
  }

  /// Saved availability paints at once, before any request (`hydrateQueryFromCache`).
  private func seedDetailsFromCache() {
    let request = detailsRequest
    let batches = BatchedLoad.batches(request.candidateIds, size: CandidateListLoading.detailsBatchSize)
    for ids in batches {
      let key = Self.detailsKey(slot: slot, ids: ids, scheduleHistory: request.scheduleHistory)
      guard let cached = queries.value(for: key, as: [CandidateDetail].self) else { continue }
      for detail in cached {
        details[detail.personId] = detail
      }
    }
    detailsVersion += 1
  }

  private func startHoldIfNeeded() {
    guard !holdReleased, holdTask == nil else { return }
    holdTask = Task { [weak self] in
      try? await Task.sleep(for: Self.scoreHold)
      guard !Task.isCancelled else { return }
      self?.holdReleased = true
    }
  }

  // MARK: Requests

  /// Blockouts depend only on the date; schedule history also on the plan it is matched to.
  nonisolated static func detailsKey(slot: CandidateSlot, ids: [String], scheduleHistory: Bool)
    -> QueryKey
  {
    .candidateDetails(
      dateKey: slot.dateKey, historyPlanId: scheduleHistory ? slot.planId : nil, personIds: ids)
  }

  /// One detail batch, following `deferredPersonIds` (with `blockoutProgress`) until every
  /// person is detailed. A call that neither details anyone nor advances a blockout check is
  /// an error.
  nonisolated static func detailsFetch(slot: CandidateSlot, ids: [String], scheduleHistory: Bool)
    -> @Sendable (RPCCaller) async throws -> [CandidateDetail]
  {
    let first = PeopleCandidateDetailsInput(
      personIds: ids, planId: slot.planId, date: slot.dateKey, scheduleHistory: scheduleHistory)
    return { rpc in
      try await Continuation.follow(
        "people.candidateDetails",
        from: first,
        fetch: { input in try await rpc(RPC.People.candidateDetails, input) },
        next: { batch in
          batch.deferredPersonIds.isEmpty
            ? nil
            : PeopleCandidateDetailsInput(
              personIds: batch.deferredPersonIds, planId: slot.planId, date: slot.dateKey,
              scheduleHistory: scheduleHistory, blockoutProgress: batch.blockoutProgress)
        },
        madeProgress: { input, batch in
          !batch.people.isEmpty
            || advancedBlockoutChecks(before: input.blockoutProgress ?? [], after: batch.blockoutProgress)
        }
      ).flatMap(\.people)
    }
  }

  /// The window history for one plan date, every continuation followed; all positions and
  /// plans on that date share it.
  nonisolated static func windowHistoryFetch(dateKey: String)
    -> @Sendable (RPCCaller) async throws -> [PlanWindowHistoryBatch]
  {
    { rpc in
      try await Continuation.follow(
        "people.planWindowHistory",
        fetch: { (cursor: PeoplePlanWindowHistoryInputContinuation?) in
          try await rpc(
            RPC.People.planWindowHistory,
            PeoplePlanWindowHistoryInput(date: dateKey, continuation: cursor))
        },
        next: { batch in
          batch.deferredPlans.isEmpty && batch.deferredServiceTypeIds.isEmpty
            ? nil
            : PeoplePlanWindowHistoryInputContinuation(
              plans: batch.deferredPlans, serviceTypeIds: batch.deferredServiceTypeIds)
        },
        madeProgress: { cursor, batch in windowHistoryAdvanced(continuation: cursor, batch: batch) })
    }
  }

  // MARK: Prefetch

  /// Loads a slot's whole list ahead of a deliberate long press, every call speculative:
  /// candidates, then the window history and the blockout details. Cached parts are skipped.
  static func prefetch(queries: QueryClient, slot: CandidateSlot) {
    Task {
      guard
        let candidates = try? await queries.fetch(
          slot.candidatesKey, priority: .speculative,
          fetch: { rpc in try await rpc(RPC.People.positionCandidates, slot.candidatesInput) })
      else { return }
      for ids in planCandidateDetailsBatches(candidates) {
        _ = try? await queries.fetch(
          detailsKey(slot: slot, ids: ids, scheduleHistory: false), priority: .speculative,
          fetch: detailsFetch(slot: slot, ids: ids, scheduleHistory: false))
      }
      _ = try? await queries.fetch(
        .planWindowHistory(dateKey: slot.dateKey), priority: .speculative,
        fetch: windowHistoryFetch(dateKey: slot.dateKey))
    }
  }
}

/// What the assembled list depends on.
private struct MemoKey: Equatable {
  var candidates: PositionCandidates
  var windowCalls: [PlanWindowHistoryBatch]?
  var detailsVersion: Int
}

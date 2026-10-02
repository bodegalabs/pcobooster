import Foundation
import PCOBoosterCore

/// One `people.dashboardActivity` call: up to 16 people, cached under its own key, and where
/// its load stands.
struct ActivityBatchState {
  enum Phase: Equatable {
    /// Planned, waiting for a free slot (two calls run at once).
    case waiting
    /// A call is in flight (or the fresh cached answer is being read).
    case loading
    /// Answered.
    case loaded
    /// The last load failed; its people show as not loaded and the dashboard offers Retry.
    case failed
  }

  var phase: Phase = .waiting
  /// The latest answer, possibly restored from disk and older than the stale time.
  var activities: [PeopleDashboardActivity]?
  var error: (any Error)?
  /// When `activities` last arrived from a load in this session.
  var loadedAt: Date?

  /// Answered once (or restored), or loading now: the web's `hasStarted`, which keeps a call's
  /// place ahead of search batches.
  var hasStarted: Bool { phase != .waiting || activities != nil }

  /// Loaded or failed, and not loading: the web's `isSettled`.
  var isSettled: Bool { phase == .loaded || phase == .failed }

  /// No answer yet and still coming: the web's `isPending` for the progress line.
  var isPending: Bool { activities == nil && phase != .failed }
}

enum ActivityLoader {
  /// The activity for `personIds`, following `deferredPersonIds` until the batch is complete.
  /// Each call is its own Worker invocation within the per-call request budget; a call that
  /// leaves every requested person for later made no progress and fails the batch
  /// (`fetchActivity` in `use-people-dashboard.ts`).
  nonisolated static func load(_ rpc: RPCCaller, personIds: [String]) async throws
    -> [PeopleDashboardActivity]
  {
    var pending = personIds
    var people: [PeopleDashboardActivity] = []
    var calls = 0
    while true {
      try Task.checkCancellation()
      let batch = try await rpc(
        RPC.People.dashboardActivity, PeopleDashboardActivityInput(personIds: pending))
      calls += 1
      people += batch.people
      let deferred = batch.deferredPersonIds
      if deferred.isEmpty {
        return people
      }
      guard deferred.count < pending.count, calls < Continuation.defaultCallLimit else {
        throw ContinuationStalled(
          operation: "people.dashboardActivity", calls: calls,
          reachedCallLimit: calls >= Continuation.defaultCallLimit)
      }
      pending = deferred
    }
  }
}

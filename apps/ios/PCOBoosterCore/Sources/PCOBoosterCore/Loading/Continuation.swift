import Foundation

/// A progressive procedure returned a continuation without getting anywhere: following it would
/// repeat forever and spend the shared Planning Center budget. Shown as a failed load with
/// Retry; never swallowed into empty data.
public struct ContinuationStalled: Error, Sendable, Hashable, UserFacingError {
  /// The operation, for example `people.planWindowHistory`.
  public let operation: String
  /// The number of calls made before stopping.
  public let calls: Int
  /// True when the call limit stopped it rather than a call without progress.
  public let reachedCallLimit: Bool

  public init(operation: String, calls: Int, reachedCallLimit: Bool = false) {
    self.operation = operation
    self.calls = calls
    self.reachedCallLimit = reachedCallLimit
  }

  public var userMessage: String {
    "Planning Center is taking longer than usual. Please try again."
  }
}

/// Follows continuation cursors (`deferredPlans`, `deferredPersonIds` with `blockoutProgress`)
/// until a procedure says it is done. Each call is its own Worker invocation within the
/// per-call request budget, so the server returns partial data with a cursor rather than
/// failing; the client must follow it and must stop when a call makes no progress.
public enum Continuation {
  /// The most calls one load may make before it counts as stalled.
  public static let defaultCallLimit = 50

  /// Calls `fetch(nil)`, then `fetch(cursor)` for every cursor `next` returns, until `next`
  /// returns nil. Every continuation call that leaves more to do must satisfy
  /// `madeProgress(cursor, page)`, or the load throws `ContinuationStalled` (the first call is
  /// not checked, as on the web).
  ///
  /// ```swift
  /// let batches = try await Continuation.follow(
  ///   "people.planWindowHistory",
  ///   fetch: { cursor in
  ///     try await rpc(RPC.People.planWindowHistory,
  ///                   PeoplePlanWindowHistoryInput(date: dateKey, continuation: cursor))
  ///   },
  ///   next: { batch in
  ///     batch.deferredPlans.isEmpty && batch.deferredServiceTypeIds.isEmpty ? nil
  ///       : PeoplePlanWindowHistoryInputContinuation(
  ///           plans: batch.deferredPlans, serviceTypeIds: batch.deferredServiceTypeIds)
  ///   },
  ///   madeProgress: { cursor, batch in windowHistoryAdvanced(cursor, batch) })
  /// ```
  ///
  /// - Returns: Every page, in call order.
  public static func follow<Page: Sendable, Cursor: Sendable>(
    _ operation: String,
    callLimit: Int = defaultCallLimit,
    fetch: (Cursor?) async throws -> Page,
    next: (Page) -> Cursor?,
    madeProgress: (_ cursor: Cursor, _ page: Page) -> Bool,
    onPage: (Page) -> Void = { _ in }
  ) async throws -> [Page] {
    try await run(
      operation, first: nil, callLimit: callLimit, fetch: fetch, next: next,
      madeProgress: madeProgress, onPage: onPage)
  }

  /// `follow` for procedures whose first call already takes the request as a cursor, such as
  /// `people.candidateDetails` (the next request carries `deferredPersonIds` and
  /// `blockoutProgress`).
  ///
  /// ```swift
  /// let pages = try await Continuation.follow(
  ///   "people.candidateDetails",
  ///   from: PeopleCandidateDetailsInput(
  ///     personIds: ids, planId: planId, date: dateKey, scheduleHistory: false),
  ///   fetch: { input in try await rpc(RPC.People.candidateDetails, input) },
  ///   next: { batch in
  ///     batch.deferredPersonIds.isEmpty ? nil
  ///       : PeopleCandidateDetailsInput(
  ///           personIds: batch.deferredPersonIds, planId: planId, date: dateKey,
  ///           scheduleHistory: false, blockoutProgress: batch.blockoutProgress)
  ///   },
  ///   madeProgress: { input, batch in
  ///     !batch.people.isEmpty || advancedBlockoutChecks(input.blockoutProgress ?? [], batch.blockoutProgress)
  ///   })
  /// let details = pages.flatMap(\.people)
  /// ```
  public static func follow<Page: Sendable, Cursor: Sendable>(
    _ operation: String,
    from first: Cursor,
    callLimit: Int = defaultCallLimit,
    fetch: (Cursor) async throws -> Page,
    next: (Page) -> Cursor?,
    madeProgress: (_ cursor: Cursor, _ page: Page) -> Bool,
    onPage: (Page) -> Void = { _ in }
  ) async throws -> [Page] {
    try await run(
      operation, first: first, callLimit: callLimit,
      fetch: { cursor in try await fetch(cursor ?? first) }, next: next,
      madeProgress: madeProgress, onPage: onPage)
  }

  /// `follow` for cursors that change whenever a call makes progress: a call that hands back
  /// the cursor it was given counts as stalled.
  public static func follow<Page: Sendable, Cursor: Sendable & Equatable>(
    _ operation: String,
    callLimit: Int = defaultCallLimit,
    fetch: (Cursor?) async throws -> Page,
    next: (Page) -> Cursor?,
    onPage: (Page) -> Void = { _ in }
  ) async throws -> [Page] {
    try await follow(
      operation, callLimit: callLimit, fetch: fetch, next: next,
      madeProgress: { cursor, page in next(page) != cursor }, onPage: onPage)
  }

  private static func run<Page: Sendable, Cursor: Sendable>(
    _ operation: String,
    first: Cursor?,
    callLimit: Int,
    fetch: (Cursor?) async throws -> Page,
    next: (Page) -> Cursor?,
    madeProgress: (Cursor, Page) -> Bool,
    onPage: (Page) -> Void
  ) async throws -> [Page] {
    var pages: [Page] = []
    var cursor = first
    var isContinuation = false
    while true {
      try Task.checkCancellation()
      guard pages.count < callLimit else {
        throw ContinuationStalled(operation: operation, calls: pages.count, reachedCallLimit: true)
      }
      let page = try await fetch(cursor)
      pages.append(page)
      onPage(page)
      guard let following = next(page) else { return pages }
      if isContinuation, let cursor, !madeProgress(cursor, page) {
        throw ContinuationStalled(operation: operation, calls: pages.count)
      }
      cursor = following
      isContinuation = true
    }
  }
}

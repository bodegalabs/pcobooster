import Foundation

extension QueryClient {
  // MARK: - Optimistic updates

  /// Patches the cached value for `key` in place and returns how to undo it. Does nothing (and
  /// returns an empty rollback) when the key holds no value of `type`. A load in flight for the
  /// key is detached, so its older answer cannot overwrite the patch.
  ///
  /// ```swift
  /// let rollback = queries.mutate(.planItems(serviceTypeId: st, planId: plan), as: [PlanItem].self) {
  ///   $0.removeAll { $0.id == itemId }
  /// }
  /// ```
  public func mutate<Value: Sendable>(
    _ key: QueryKey,
    as type: Value.Type = Value.self,
    _ transform: (inout Value) -> Void
  ) -> QueryRollback {
    guard let entry = entry(for: key), var value = entry.value as? Value else {
      return QueryRollback()
    }
    let previous = entry.value
    transform(&value)
    applyLocalValue(value, to: entry)
    return QueryRollback { [weak self, weak entry] in
      guard let self, let entry else { return }
      self.applyLocalValue(previous, to: entry)
    }
  }

  /// Patches every cached value of `type` whose key `filter` matches, for example every
  /// candidate list for a plan after a schedule write.
  public func mutate<Value: Sendable>(
    matching filter: QueryFilter,
    as type: Value.Type = Value.self,
    _ transform: (QueryKey, inout Value) -> Void
  ) -> QueryRollback {
    var rollback = QueryRollback()
    for entry in matchingEntries([filter]) {
      rollback.append(mutate(entry.key, as: type) { value in transform(entry.key, &value) })
    }
    return rollback
  }

  // MARK: - Writes

  /// Runs a write: applies `optimistic` patches, sends `write` as interactive, rolls the
  /// patches back if it fails, then settles: `settle` keys are marked stale now and the ones on
  /// screen refetch `settleDelay` after the last write. Writes never retry. Throws the write's
  /// error, so callers can handle specific codes (`ALREADY_SCHEDULED`, `CONFLICT`).
  public func perform<Output: Sendable>(
    optimistic: (QueryClient) -> QueryRollback = { _ in QueryRollback() },
    settle: [QueryFilter] = [],
    settleDelay: Duration = QueryClient.settleDelay,
    _ write: @Sendable (RPCCaller) async throws -> Output
  ) async throws -> Output {
    let rollback = optimistic(self)
    do {
      let output = try await Self.runWrite(write, RPCCaller(client: rpc, lane: RequestLane(.interactive)))
      refetch(after: settleDelay, matching: settle)
      return output
    } catch {
      rollback.rollback()
      refetch(after: settleDelay, matching: settle)
      throw error
    }
  }

  /// `perform` with one call of `procedure`.
  public func perform<Input, Output>(
    _ procedure: Procedure<Input, Output>,
    _ input: Input,
    optimistic: (QueryClient) -> QueryRollback = { _ in QueryRollback() },
    settle: [QueryFilter] = [],
    settleDelay: Duration = QueryClient.settleDelay
  ) async throws -> Output {
    try await perform(optimistic: optimistic, settle: settle, settleDelay: settleDelay) { rpc in
      try await rpc(procedure, input)
    }
  }

  /// `perform` for autosaves: a failure is rolled back and sent to `errorSink` (the app's
  /// toast) instead of thrown. Returns the output, or nil when the write failed.
  @discardableResult
  public func write<Output: Sendable>(
    optimistic: (QueryClient) -> QueryRollback = { _ in QueryRollback() },
    settle: [QueryFilter] = [],
    settleDelay: Duration = QueryClient.settleDelay,
    _ write: @Sendable (RPCCaller) async throws -> Output
  ) async -> Output? {
    do {
      return try await perform(
        optimistic: optimistic, settle: settle, settleDelay: settleDelay, write)
    } catch {
      reportWriteFailure(error)
      return nil
    }
  }

  /// `write` with one call of `procedure`.
  @discardableResult
  public func write<Input, Output>(
    _ procedure: Procedure<Input, Output>,
    _ input: Input,
    optimistic: (QueryClient) -> QueryRollback = { _ in QueryRollback() },
    settle: [QueryFilter] = [],
    settleDelay: Duration = QueryClient.settleDelay
  ) async -> Output? {
    await write(optimistic: optimistic, settle: settle, settleDelay: settleDelay) { rpc in
      try await rpc(procedure, input)
    }
  }

  @concurrent
  private nonisolated static func runWrite<Output: Sendable>(
    _ write: @Sendable (RPCCaller) async throws -> Output, _ caller: RPCCaller
  ) async throws -> Output {
    try await write(caller)
  }
}

import Foundation
import Observation

/// The app's cache of API reads, the native counterpart of the web's TanStack Query client
/// (`apps/web/src/router.tsx`, `apps/web/src/lib/query-keys.ts`).
///
/// - Reads are keyed by `QueryKey`; each family carries the web's stale time, retry rule, and
///   disk persistence (`QueryFamily.policy`).
/// - Concurrent reads of one key share one request. A failed read retries once on a transient
///   failure (5xx, network, undecodable body), never on 4xx.
/// - Stale values stay on screen while they reload: when a screen appears, when the app
///   returns to the foreground (`refetchStale()`), and after invalidation.
/// - Persisted families paint from disk on a cold launch, then revalidate. Switching accounts
///   or signing out (`switchScope`) clears memory and disk.
/// - Prefetches run in the speculative lane and are promoted when a screen starts observing.
/// - Writes (`write`, `perform`) apply optimistic patches, roll back on failure, invalidate,
///   and refetch what is on screen 2.5 s after the last write, like the web's settle refetch.
///
/// ```swift
/// // Read
/// let items = queries.query(
///   .planItems(serviceTypeId: st, planId: plan), RPC.PlanItems.list,
///   PlanItemsListInput(serviceTypeId: st, planId: plan))
///
/// // Write with an optimistic patch and the settle refetch
/// await queries.write(
///   RPC.PlanItems.delete, PlanItemsDeleteInput(serviceTypeId: st, planId: plan, itemId: id),
///   optimistic: { queries in
///     queries.mutate(.planItems(serviceTypeId: st, planId: plan), as: [PlanItem].self) {
///       $0.removeAll { $0.id == id }
///     }
///   },
///   settle: [.key(.planItems(serviceTypeId: st, planId: plan))])
/// ```
@MainActor
@Observable
public final class QueryClient {
  /// The delay before the refetch that follows the last write (`SCHEDULE_MUTATION_RECONCILE_DELAY_MS`).
  public static let settleDelay: Duration = .milliseconds(2500)
  /// The wait before a read's one retry.
  public static let retryDelay: Duration = .seconds(1)
  /// A read that just failed is not reloaded automatically for this long, so screens that
  /// rebuild often cannot turn one failure into a burst of requests. Retry and pull to refresh
  /// always reload.
  public static let failureCooldown: Duration = .seconds(10)

  /// The account context the cache holds.
  public private(set) var scope: QueryScope

  /// Receives write failures from `write`, for the app's error toast. Unauthorized answers are
  /// left to the session (which asks the person to sign in again) and cancellations are
  /// dropped.
  @ObservationIgnored public var errorSink: (@MainActor (WriteFailure) -> Void)?

  @ObservationIgnored public let rpc: RPCClient
  @ObservationIgnored private let analytics: any AnalyticsSink
  @ObservationIgnored private let now: @Sendable () -> Date
  @ObservationIgnored private let clock: any Clock<Duration>
  @ObservationIgnored private let disk: QueryDiskStore?
  @ObservationIgnored private let writer: QueryDiskWriter?
  @ObservationIgnored private var entries: [QueryKey: QueryEntry] = [:]
  @ObservationIgnored private var scopeGeneration = 0
  @ObservationIgnored private var nextFetchID = 0
  @ObservationIgnored private var pendingSettle: [QueryFilter] = []
  @ObservationIgnored private var settleTimer: Task<Void, Never>?
  @ObservationIgnored private var lastDiskTask: Task<Void, Never>?
  @ObservationIgnored private var lastSweep: Date?

  /// - Parameters:
  ///   - rpc: The client every load and write calls through.
  ///   - scope: The account context the cache starts in (the stored session's).
  ///   - cacheDirectory: Where persisted families live; nil keeps everything in memory.
  ///     `QueryClient.defaultCacheDirectory` is `Library/Caches/PCOBoosterQueries`.
  ///   - analytics: Receives `readFailed` for reads that fail after their retry.
  ///   - now: The wall clock for `updatedAt` and staleness.
  ///   - clock: Sleeps for the retry delay and the settle refetch.
  public init(
    rpc: RPCClient,
    scope: QueryScope = .signedOut,
    cacheDirectory: URL? = nil,
    analytics: any AnalyticsSink = NoAnalytics(),
    now: @escaping @Sendable () -> Date = { Date() },
    clock: any Clock<Duration> = ContinuousClock()
  ) {
    self.rpc = rpc
    self.scope = scope
    self.analytics = analytics
    self.now = now
    self.clock = clock
    if let cacheDirectory {
      let disk = QueryDiskStore(directory: cacheDirectory)
      let writer = QueryDiskWriter(store: disk)
      self.disk = disk
      self.writer = writer
      let startedAt = now()
      enqueueDisk { writer in
        await writer.removeEverything(except: scope)
        await writer.sweep(scope: scope, now: startedAt)
      }
    } else {
      disk = nil
      writer = nil
    }
  }

  /// `Library/Caches/PCOBoosterQueries`.
  public nonisolated static var defaultCacheDirectory: URL? {
    QueryDiskStore.defaultDirectory
  }

  // MARK: - Reads

  /// A state for `key`, loading it with `fetch` when nothing fresh is cached. `fetch` receives
  /// an `RPCCaller` bound to this load's lane; use it for every call so prefetch priority and
  /// promotion work. Combine continuation calls or batches inside `fetch` when the screen needs
  /// them as one value (see `Continuation.follow`).
  public func query<Value: Codable & Sendable>(
    _ key: QueryKey,
    policy: QueryPolicy? = nil,
    fetch: @escaping @Sendable (RPCCaller) async throws -> Value
  ) -> QueryState<Value> {
    let entry = prepare(key, policy: policy, fetch: fetch)
    let state = QueryState<Value>(entry: entry, client: self)
    entry.addObserver(state)
    observerAppeared(entry)
    return state
  }

  /// A state for `key` loaded by one call of `procedure`.
  public func query<Input, Output: Codable>(
    _ key: QueryKey,
    _ procedure: Procedure<Input, Output>,
    _ input: Input,
    policy: QueryPolicy? = nil
  ) -> QueryState<Output> {
    query(key, policy: policy) { rpc in try await rpc(procedure, input) }
  }

  /// A state for `key` loaded by one call of an empty-input `procedure`.
  public func query<Output: Codable>(
    _ key: QueryKey,
    _ procedure: Procedure<EmptyInput, Output>,
    policy: QueryPolicy? = nil
  ) -> QueryState<Output> {
    query(key, policy: policy) { rpc in try await rpc(procedure) }
  }

  /// The value for `key`: the cached one when fresh, else loaded now (sharing a load already
  /// running). For progressive loaders that compose cached parts, such as detail batches.
  public func fetch<Value: Codable & Sendable>(
    _ key: QueryKey,
    policy: QueryPolicy? = nil,
    priority: RequestPriority = .interactive,
    fetch: @escaping @Sendable (RPCCaller) async throws -> Value
  ) async throws -> Value {
    let entry = prepare(key, policy: policy, fetch: fetch)
    if let value = entry.value as? Value, !isStale(entry) {
      return value
    }
    guard let task = startFetch(entry, priority: priority) else {
      throw CancellationError()
    }
    let value = try await task.value
    guard let typed = value as? Value else {
      throw APIError(
        kind: .decoding, message: APIError.decodingMessage,
        detail: "Cached value for \(key) is \(type(of: value)), not \(Value.self)")
    }
    return typed
  }

  /// `fetch(_:policy:priority:fetch:)` with one call of `procedure`.
  public func fetch<Input, Output: Codable>(
    _ key: QueryKey,
    _ procedure: Procedure<Input, Output>,
    _ input: Input,
    policy: QueryPolicy? = nil
  ) async throws -> Output {
    try await fetch(key, policy: policy) { rpc in try await rpc(procedure, input) }
  }

  /// Loads `key` ahead of a likely next step, in the speculative lane: after interactive work
  /// has been quiet for 250 ms, one call at a time, with the speculative header. Does nothing
  /// when the value is fresh or already loading. Only on clear intent (a tap or a deliberate
  /// long press), never on scroll or row appearance.
  @discardableResult
  public func prefetch<Value: Codable & Sendable>(
    _ key: QueryKey,
    policy: QueryPolicy? = nil,
    fetch: @escaping @Sendable (RPCCaller) async throws -> Value
  ) -> PrefetchHandle {
    let entry = prepare(key, policy: policy, fetch: fetch)
    guard entry.inFlight == nil, isStale(entry) else { return PrefetchHandle(nil) }
    _ = startFetch(entry, priority: .speculative)
    guard let fetchID = entry.inFlight?.id else { return PrefetchHandle(nil) }
    return PrefetchHandle { [weak entry] in
      guard let entry, let inFlight = entry.inFlight, inFlight.id == fetchID,
        inFlight.lane.priority == .speculative
      else {
        return
      }
      inFlight.task.cancel()
    }
  }

  /// `prefetch(_:policy:fetch:)` with one call of `procedure`.
  @discardableResult
  public func prefetch<Input, Output: Codable>(
    _ key: QueryKey,
    _ procedure: Procedure<Input, Output>,
    _ input: Input,
    policy: QueryPolicy? = nil
  ) -> PrefetchHandle {
    prefetch(key, policy: policy) { rpc in try await rpc(procedure, input) }
  }

  /// The cached value for `key`, restored from disk when this launch has not loaded it yet.
  public func value<Value: Codable & Sendable>(for key: QueryKey, as type: Value.Type = Value.self)
    -> Value?
  {
    if let entry = entries[key] {
      hydrate(entry, as: Value.self)
      return entry.value as? Value
    }
    guard key.family.policy.persistence != nil else { return nil }
    let entry = makeEntry(key, policy: key.family.policy)
    hydrate(entry, as: Value.self)
    return entry.value as? Value
  }

  /// Replaces the cached value for `key`, for example with the arrangement a save returned.
  /// Counts as a fresh load, and is saved to disk for persisted families.
  public func setValue<Value: Codable & Sendable>(_ value: Value, for key: QueryKey) {
    let entry = entries[key] ?? makeEntry(key, policy: key.family.policy)
    entry.inFlight = nil
    entry.value = value
    entry.error = nil
    entry.status = .success
    entry.updatedAt = now()
    entry.invalidated = false
    entry.valueGeneration += 1
    persist(value, for: key)
  }

  // MARK: - Freshness

  /// Reloads every stale value a screen is showing. Call when the app returns to the
  /// foreground (`scenePhase == .active`).
  public func refetchStale() {
    for entry in entries.values where entry.isActive && entry.inFlight == nil && isStale(entry) {
      _ = startFetch(entry, priority: .interactive)
    }
  }

  /// Marks matching values stale. Those on screen reload now (`refetchActive`); the rest reload
  /// when a screen next shows them. Pass `refetchActive: false` for expensive reads that
  /// should wait for their screen.
  public func invalidate(_ filters: [QueryFilter], refetchActive: Bool = true) {
    for entry in matchingEntries(filters) {
      entry.invalidated = true
      if refetchActive, entry.isActive {
        forceRefetch(entry)
      }
    }
  }

  public func invalidate(_ filters: QueryFilter..., refetchActive: Bool = true) {
    invalidate(filters, refetchActive: refetchActive)
  }

  public func invalidate(_ key: QueryKey, refetchActive: Bool = true) {
    invalidate([.key(key)], refetchActive: refetchActive)
  }

  /// Forgets matching values in memory and on disk. Screens showing them load again.
  public func remove(_ filters: [QueryFilter]) {
    for entry in matchingEntries(filters) {
      entry.reset(rehydrate: false)
      if entry.isActive {
        _ = startFetch(entry, priority: .interactive)
      }
    }
    let scope = scope
    for filter in filters {
      enqueueDisk { writer in await writer.remove(matching: filter, scope: scope) }
    }
  }

  public func remove(_ filters: QueryFilter...) {
    remove(filters)
  }

  // MARK: - Scope

  /// Moves the cache to another account context. Everything cached is cleared, in memory and
  /// on disk, and loads still running for the previous scope are dropped. Rebuild the screen
  /// tree for the new scope (for example `.id(queries.scope)` at the root).
  public func switchScope(_ newScope: QueryScope) {
    guard newScope != scope else { return }
    scope = newScope
    resetEverything()
    enqueueDisk { writer in await writer.removeEverything(except: newScope) }
  }

  /// Clears everything cached for the current scope, in memory and on disk.
  public func clear() {
    resetEverything()
    enqueueDisk { writer in await writer.removeAll() }
  }

  /// Waits for pending disk writes, for tests and before the app suspends.
  public func flushPersistence() async {
    await lastDiskTask?.value
  }

  // MARK: - Internals used by QueryState and mutations

  func observerAppeared(_ entry: QueryEntry) {
    if let inFlight = entry.inFlight {
      inFlight.lane.promote()
      return
    }
    guard isStale(entry), !isCoolingDown(entry) else { return }
    _ = startFetch(entry, priority: .interactive)
  }

  /// Reloads `entry` now (joining a load in flight) and waits for it to settle.
  func refetch(_ entry: QueryEntry, force: Bool) async {
    let task: Task<any Sendable, any Error>?
    if let inFlight = entry.inFlight {
      inFlight.lane.promote()
      task = inFlight.task
    } else if force || isStale(entry) {
      task = startFetch(entry, priority: .interactive)
    } else {
      task = nil
    }
    _ = try? await task?.value
  }

  func startRefetch(_ entry: QueryEntry) {
    if let inFlight = entry.inFlight {
      inFlight.lane.promote()
    } else {
      _ = startFetch(entry, priority: .interactive)
    }
  }

  func entry(for key: QueryKey) -> QueryEntry? {
    entries[key]
  }

  func matchingEntries(_ filters: [QueryFilter]) -> [QueryEntry] {
    entries.values.filter { entry in filters.contains { $0.matches(entry.key) } }
  }

  /// Applies a value that is not a load: optimistic patches and rollbacks. A load in flight
  /// for the key is detached so its older answer cannot overwrite the patch.
  func applyLocalValue(_ value: (any Sendable)?, to entry: QueryEntry) {
    entry.inFlight = nil
    entry.value = value
    entry.valueGeneration += 1
    if entry.status == .loading || entry.status == .refreshing {
      entry.status = value == nil ? .idle : .success
    }
  }

  /// Marks matching values stale now and refetches the ones on screen after `delay`. Each
  /// call restarts the delay, so a burst of writes settles once.
  public func refetch(after delay: Duration = QueryClient.settleDelay, matching filters: [QueryFilter])
  {
    guard !filters.isEmpty else { return }
    for entry in matchingEntries(filters) {
      entry.invalidated = true
    }
    pendingSettle.append(contentsOf: filters)
    settleTimer?.cancel()
    let clock = clock
    settleTimer = Task { [weak self] in
      do {
        try await clock.sleep(for: delay)
      } catch {
        return
      }
      self?.flushSettle()
    }
  }

  /// `refetch(after:matching:)` for exact keys.
  public func refetch(after delay: Duration = QueryClient.settleDelay, keys: [QueryKey]) {
    refetch(after: delay, matching: keys.map(QueryFilter.key))
  }

  func persist<Value: Codable & Sendable>(_ value: Value, for key: QueryKey) {
    guard let persistence = entries[key]?.policy.persistence ?? key.family.policy.persistence
    else {
      return
    }
    let scope = scope
    let savedAt = now()
    enqueueDisk { writer in
      await writer.write(value, key: key, savedAt: savedAt, scope: scope, persistence: persistence)
    }
  }

  func reportWriteFailure(_ error: any Error) {
    guard !error.isCancellation, (error as? APIError)?.isUnauthorized != true else { return }
    errorSink?(WriteFailure(error: error))
  }

  // MARK: - Loading

  private func prepare<Value: Codable & Sendable>(
    _ key: QueryKey, policy: QueryPolicy?,
    fetch: @escaping @Sendable (RPCCaller) async throws -> Value
  ) -> QueryEntry {
    let entry = entries[key] ?? makeEntry(key, policy: policy ?? key.family.policy)
    if let policy {
      entry.policy = policy
    }
    entry.fetcher = .typed(fetch)
    hydrate(entry, as: Value.self)
    return entry
  }

  private func makeEntry(_ key: QueryKey, policy: QueryPolicy) -> QueryEntry {
    sweepIfDue()
    let entry = QueryEntry(key: key, policy: policy)
    entries[key] = entry
    return entry
  }

  /// Seeds an empty entry from disk once per launch (persist, then revalidate). The read is
  /// synchronous on purpose, like the web's `useHydrateQueryFromCache`: a cold screen paints its
  /// saved value in the first frame instead of flashing a skeleton. Files are small (the largest
  /// family, plan window history, is about 150 KB and capped at three dates); writes, deletions,
  /// and retention sweeps run off the main actor in `QueryDiskWriter`.
  private func hydrate<Value: Codable & Sendable>(_ entry: QueryEntry, as type: Value.Type) {
    guard !entry.hydrated, entry.value == nil else { return }
    entry.hydrated = true
    guard let disk, let persistence = entry.policy.persistence else { return }
    switch disk.read(entry.key, as: Value.self, scope: scope, persistence: persistence, now: now()) {
    case .hit(let value, let savedAt):
      entry.value = value
      entry.updatedAt = savedAt
      if entry.status == .idle {
        entry.status = .success
      }
    case .miss:
      break
    case .invalid:
      let key = entry.key
      let scope = scope
      enqueueDisk { writer in await writer.remove(key, scope: scope) }
    }
  }

  func isStale(_ entry: QueryEntry) -> Bool {
    if entry.value == nil || entry.invalidated { return true }
    guard let updatedAt = entry.updatedAt else { return true }
    guard let staleTime = entry.policy.staleTime else { return false }
    return now().timeIntervalSince(updatedAt) >= staleTime.timeInterval
  }

  private func isCoolingDown(_ entry: QueryEntry) -> Bool {
    guard entry.status == .failure, let failedAt = entry.failedAt else { return false }
    return now().timeIntervalSince(failedAt) < Self.failureCooldown.timeInterval
  }

  /// Starts a new load even if one is running (whose older answer is then ignored).
  private func forceRefetch(_ entry: QueryEntry) {
    entry.inFlight = nil
    _ = startFetch(entry, priority: .interactive)
  }

  /// Starts a load, or joins the one in flight (promoting it for interactive callers).
  private func startFetch(_ entry: QueryEntry, priority: RequestPriority) -> Task<
    any Sendable, any Error
  >? {
    if let inFlight = entry.inFlight {
      if priority == .interactive {
        inFlight.lane.promote()
      }
      return inFlight.task
    }
    guard let fetcher = entry.fetcher else { return nil }
    let lane = RequestLane(priority)
    let fetchID = nextFetchID
    nextFetchID += 1
    let generation = (scope: scopeGeneration, value: entry.valueGeneration)
    let caller = RPCCaller(client: rpc, lane: lane)
    let retries = entry.policy.retries
    let clock = clock
    entry.status = entry.value == nil ? .loading : .refreshing
    let task = Task<any Sendable, any Error> { [weak self] in
      var attempt = 0
      while true {
        do {
          let value = try await Self.run(fetcher.fetch, caller)
          self?.fetchSucceeded(
            entry, fetchID: fetchID, value: value, fetcher: fetcher, generation: generation)
          return value
        } catch {
          let transient = (error as? APIError)?.shouldRetryAutomatically == true
          if retries, transient, attempt == 0, !Task.isCancelled {
            attempt += 1
            do {
              try await clock.sleep(for: Self.retryDelay)
              continue
            } catch {
              self?.fetchFailed(
                entry, fetchID: fetchID, error: CancellationError(), generation: generation)
              throw CancellationError()
            }
          }
          self?.fetchFailed(
            entry, fetchID: fetchID, error: error, generation: generation,
            speculative: lane.priority == .speculative)
          throw error
        }
      }
    }
    entry.inFlight = QueryEntry.InFlight(id: fetchID, task: task, lane: lane)
    return task
  }

  @concurrent
  private nonisolated static func run(
    _ fetch: @Sendable (RPCCaller) async throws -> any Sendable, _ caller: RPCCaller
  ) async throws -> any Sendable {
    try await fetch(caller)
  }

  private func fetchSucceeded(
    _ entry: QueryEntry, fetchID: Int, value: any Sendable, fetcher: QueryFetcher,
    generation: (scope: Int, value: Int)
  ) {
    guard generation.scope == scopeGeneration, entry.inFlight?.id == fetchID else { return }
    entry.inFlight = nil
    guard generation.value == entry.valueGeneration else {
      // A local change landed while this load ran; its answer predates that change. The
      // settle refetch (or the next appearance) brings the server's view.
      entry.invalidated = true
      entry.status = entry.value == nil ? .idle : .success
      return
    }
    entry.value = value
    entry.error = nil
    entry.failedAt = nil
    entry.updatedAt = now()
    entry.invalidated = false
    entry.status = .success
    if entry.policy.persistence != nil {
      fetcher.save(self, value, entry.key)
    }
  }

  private func fetchFailed(
    _ entry: QueryEntry, fetchID: Int, error: any Error, generation: (scope: Int, value: Int),
    speculative: Bool = false
  ) {
    guard generation.scope == scopeGeneration, entry.inFlight?.id == fetchID else { return }
    entry.inFlight = nil
    // A prefetch nobody is waiting on fails quietly (the API holds speculative reads back when
    // the budget is busy); the screen that needs the value loads it and owns visible errors.
    if error.isCancellation || speculative {
      entry.status = entry.value == nil ? (entry.error == nil ? .idle : .failure) : .success
      return
    }
    entry.error = error
    entry.failedAt = now()
    entry.status = .failure
    analytics.capture(.readFailed(entry.key.family, errorCode: WorkflowErrorCode(error)))
  }

  private func flushSettle() {
    let filters = pendingSettle
    pendingSettle = []
    settleTimer = nil
    for entry in matchingEntries(filters) {
      entry.invalidated = true
      if entry.isActive {
        forceRefetch(entry)
      }
    }
  }

  private func resetEverything() {
    scopeGeneration += 1
    settleTimer?.cancel()
    settleTimer = nil
    pendingSettle = []
    for entry in entries.values {
      entry.reset(rehydrate: true)
    }
    entries = entries.filter { $0.value.hasObservers }
  }

  /// Drops entries no screen has held for `QueryPolicy.memoryRetention` (`gcTime`).
  private func sweepIfDue() {
    let current = now()
    if let lastSweep, current.timeIntervalSince(lastSweep) < 60 { return }
    lastSweep = current
    let retention = QueryPolicy.memoryRetention.timeInterval
    for (key, entry) in entries where entry.inFlight == nil && !entry.hasObservers {
      if let since = entry.unobservedSince {
        if current.timeIntervalSince(since) > retention {
          entries[key] = nil
        }
      } else {
        entry.unobservedSince = current
      }
    }
  }

  /// Runs disk work in order, off the main actor.
  private func enqueueDisk(_ work: @escaping @Sendable (QueryDiskWriter) async -> Void) {
    guard let writer else { return }
    let previous = lastDiskTask
    lastDiskTask = Task {
      await previous?.value
      await work(writer)
    }
  }
}

import Foundation
import Observation

/// How an entry loads its value, with the value's type erased so one cache holds every family.
struct QueryFetcher: Sendable {
  let fetch: @Sendable (RPCCaller) async throws -> any Sendable
  /// Saves a loaded value to disk with its concrete type.
  let save: @MainActor @Sendable (QueryClient, any Sendable, QueryKey) -> Void

  static func typed<Value: Codable & Sendable>(
    _ fetch: @escaping @Sendable (RPCCaller) async throws -> Value
  ) -> QueryFetcher {
    QueryFetcher(
      fetch: { caller in try await fetch(caller) },
      save: { client, value, key in
        if let value = value as? Value {
          client.persist(value, for: key)
        }
      })
  }
}

/// The shared cache record for one key. `QueryState`s read it; only `QueryClient` writes it.
@MainActor
@Observable
final class QueryEntry {
  struct InFlight {
    let id: Int
    let task: Task<any Sendable, any Error>
    let lane: RequestLane
  }

  private struct WeakObserver {
    weak var observer: (any QueryObserving)?
  }

  let key: QueryKey
  var value: (any Sendable)?
  var status: QueryStatus = .idle
  var error: (any Error)?
  var updatedAt: Date?

  @ObservationIgnored var policy: QueryPolicy
  @ObservationIgnored var fetcher: QueryFetcher?
  @ObservationIgnored var inFlight: InFlight?
  /// Set by invalidation: stale regardless of `updatedAt` until the next successful load.
  @ObservationIgnored var invalidated = false
  /// Bumped by every value change that is not a load (optimistic patches, rollbacks, direct
  /// sets), so a load that started before one cannot overwrite it.
  @ObservationIgnored var valueGeneration = 0
  @ObservationIgnored var failedAt: Date?
  @ObservationIgnored var hydrated = false
  @ObservationIgnored var unobservedSince: Date?
  @ObservationIgnored private var observers: [WeakObserver] = []

  init(key: QueryKey, policy: QueryPolicy) {
    self.key = key
    self.policy = policy
  }

  func addObserver(_ observer: any QueryObserving) {
    observers.removeAll { $0.observer == nil }
    observers.append(WeakObserver(observer: observer))
    unobservedSince = nil
  }

  /// Some screen holding a state for this key is showing.
  var isActive: Bool {
    observers.contains { $0.observer?.isVisible == true }
  }

  var hasObservers: Bool {
    observers.contains { $0.observer != nil }
  }

  /// Back to nothing loaded. A load in flight is cancelled. `rehydrate` lets the next read
  /// restore a saved value (a new scope); a removal passes false, since its file is being
  /// deleted.
  func reset(rehydrate: Bool) {
    inFlight?.task.cancel()
    inFlight = nil
    value = nil
    error = nil
    updatedAt = nil
    status = .idle
    invalidated = false
    failedAt = nil
    hydrated = !rehydrate
    valueGeneration += 1
  }
}

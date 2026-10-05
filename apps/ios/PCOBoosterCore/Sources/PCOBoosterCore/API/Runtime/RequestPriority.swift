import Foundation
import Synchronization

/// Who is waiting on a call (`packages/contracts/src/request-priority.ts`). `interactive` loads
/// what is on screen or what a tap just asked for; `speculative` loads ahead of a likely next
/// step. Every call spends the same Planning Center user's budget (shared with the web app), so
/// the API admits speculative reads only while most of that budget is unused and rejects them
/// with `TOO_MANY_REQUESTS` otherwise.
public enum RequestPriority: String, Sendable, Hashable, CaseIterable {
  case interactive
  case speculative

  /// The `x-pcobooster-priority` value; nil means interactive (the header is left out).
  public var headerValue: String? {
    switch self {
    case .interactive: nil
    case .speculative: "speculative"
    }
  }
}

/// The priority of one piece of work, which can rise while it waits. A prefetch starts in a
/// speculative lane; when a screen starts observing the same query, `QueryClient` promotes the
/// lane, so a call still queued leaves the speculative line at once and a call the API rejected
/// as speculative is sent again as interactive (the web's `callForQuery`).
public final class RequestLane: Sendable {
  private struct State {
    var priority: RequestPriority
    var nextObserverID: UInt64 = 0
    var observers: [UInt64: @Sendable () -> Void] = [:]
  }

  private let state: Mutex<State>

  public init(_ priority: RequestPriority = .interactive) {
    state = Mutex(State(priority: priority))
  }

  public var priority: RequestPriority {
    state.withLock { $0.priority }
  }

  /// Raises the lane to interactive. Promotion never reverses.
  public func promote() {
    let observers = state.withLock { state -> [@Sendable () -> Void] in
      guard state.priority == .speculative else { return [] }
      state.priority = .interactive
      let observers = Array(state.observers.values)
      state.observers = [:]
      return observers
    }
    for observer in observers {
      observer()
    }
  }

  /// Runs `action` once when the lane is promoted. Returns nil (without registering) when the
  /// lane is already interactive.
  func observePromotion(_ action: @escaping @Sendable () -> Void) -> UInt64? {
    state.withLock { state in
      guard state.priority == .speculative else { return nil }
      let id = state.nextObserverID
      state.nextObserverID += 1
      state.observers[id] = action
      return id
    }
  }

  func removePromotionObserver(_ id: UInt64) {
    _ = state.withLock { $0.observers.removeValue(forKey: id) }
  }
}

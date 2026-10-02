import Foundation
import Observation

/// Where a cached read stands.
public enum QueryStatus: String, Sendable, Hashable {
  /// Nothing loaded and nothing loading (signed out, or the key was reset).
  case idle
  /// The first load, with no value yet: show a skeleton.
  case loading
  /// Loading again behind a value that stays on screen.
  case refreshing
  /// `value` is the latest answer.
  case success
  /// The last load failed; `error` says why. A previous `value` stays available.
  case failure
}

@MainActor
protocol QueryObserving: AnyObject {
  var isVisible: Bool { get }
}

/// One screen's view of a cached read. `QueryClient.query` returns it; hold it in an
/// `@Observable` model (or `@State`) and read it in `body`, which updates as the shared cache
/// entry changes. Every state for the same key shares one entry, one request, and one value.
///
/// ```swift
/// if let items = state.value { RunSheet(items) }
/// else if state.isLoading { RunSheetSkeleton() }
/// else if let message = state.errorMessage { ErrorState(message) { state.retry() } }
/// // .refreshable { await state.refresh() }
/// ```
///
/// A state counts as on screen from creation until `disappear()`; call `appear()` and
/// `disappear()` from the view's `onAppear` and `onDisappear` so returning to a screen
/// revalidates stale data and invalidations skip screens nobody is looking at.
@MainActor
@Observable
public final class QueryState<Value: Codable & Sendable>: QueryObserving {
  @ObservationIgnored let entry: QueryEntry
  @ObservationIgnored private weak var client: QueryClient?
  @ObservationIgnored private(set) var isVisible = true

  init(entry: QueryEntry, client: QueryClient) {
    self.entry = entry
    self.client = client
  }

  public var key: QueryKey { entry.key }

  /// The latest value: live, optimistic, or saved from a previous launch.
  public var value: Value? { entry.value as? Value }

  public var status: QueryStatus { entry.status }

  /// Why the last load failed (usually `APIError`); nil after a success.
  public var error: (any Error)? { entry.error }

  /// When `value` was loaded (its save time for a value restored from disk).
  public var updatedAt: Date? { entry.updatedAt }

  /// The first load is running and there is nothing to show yet.
  public var isLoading: Bool { entry.status == .loading }

  /// A reload is running behind a value on screen.
  public var isRefreshing: Bool { entry.status == .refreshing }

  /// Copy for `error`, for error states and toasts.
  public var errorMessage: String? { entry.error?.userFacingMessage }

  /// Reloads now, even when fresh, and returns when the load settles (pull to refresh). Joins a
  /// load already running. Failures land in `error`.
  public func refresh() async {
    await client?.refetch(entry, force: true)
  }

  /// Reloads now without waiting, for a Retry button.
  public func retry() {
    client?.startRefetch(entry)
  }

  /// The screen is showing again: revalidates when stale.
  public func appear() {
    isVisible = true
    client?.observerAppeared(entry)
  }

  /// The screen is covered or gone: invalidations no longer refetch for it.
  public func disappear() {
    isVisible = false
  }
}

/// Undoes optimistic changes. `QueryClient.mutate` returns one; `perform` and `write` call
/// `rollback()` when the write fails.
@MainActor
public struct QueryRollback {
  private var actions: [@MainActor () -> Void]

  /// A rollback that does nothing.
  public init() {
    actions = []
  }

  init(_ action: @escaping @MainActor () -> Void) {
    actions = [action]
  }

  /// Restores every value this rollback covers, newest change first.
  public func rollback() {
    for action in actions.reversed() {
      action()
    }
  }

  public mutating func append(_ other: QueryRollback) {
    actions.append(contentsOf: other.actions)
  }

  public static func + (lhs: QueryRollback, rhs: QueryRollback) -> QueryRollback {
    var combined = lhs
    combined.append(rhs)
    return combined
  }
}

/// A write that failed, for the app's error toast.
public struct WriteFailure: Sendable {
  public let error: any Error
  /// `error.userFacingMessage`: the API's `data.message` when present.
  public var message: String { error.userFacingMessage }

  public init(error: any Error) {
    self.error = error
  }
}

/// A speculative load started by `QueryClient.prefetch`. Cancel it when the intent goes away
/// (the row scrolls off, the press ends without a tap); a load a screen has since joined keeps
/// running.
@MainActor
public struct PrefetchHandle {
  private let cancelAction: (@MainActor () -> Void)?

  init(_ cancel: (@MainActor () -> Void)?) {
    cancelAction = cancel
  }

  public func cancel() {
    cancelAction?()
  }
}

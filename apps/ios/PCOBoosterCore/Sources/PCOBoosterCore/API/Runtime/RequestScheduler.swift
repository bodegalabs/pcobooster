import Foundation

/// Two request lanes over one Planning Center budget, mirroring the web's `requestScheduler`
/// (`apps/web/src/lib/request-priority.ts`):
///
/// - Interactive calls go out at once, any number at a time.
/// - Speculative calls (prefetches, warm-ups) wait until no interactive call has been in flight
///   for `quietPeriod` (250 ms), then run one at a time, oldest first, each sent with
///   `x-pcobooster-priority: speculative`. The quiet period restarts after every call, so a
///   follow-up the next screen starts from a response is never beaten by a warm-up.
/// - A waiting call whose lane is promoted leaves the line and goes out as interactive. A
///   speculative call the API rejects with `TOO_MANY_REQUESTS` is sent again as interactive when
///   its lane was promoted meanwhile; otherwise the rejection is the result.
/// - Cancelling the waiting task drops it from the line; cancelling a running call cancels the
///   request. Either way the lane bookkeeping stays balanced.
///
/// `RPCClient` routes every call through its scheduler; feature code does not call it directly.
public actor RequestScheduler {
  /// How long interactive calls must be quiet before speculative work starts (`SPECULATIVE_QUIET_MS`).
  public static let defaultQuietPeriod: Duration = .milliseconds(250)

  private enum Grant {
    case speculative
    case interactive
  }

  private struct Waiter {
    let id: UInt64
    let continuation: CheckedContinuation<Grant, any Error>
    let lane: RequestLane
    var promotionObserver: UInt64?
  }

  private let quietPeriod: Duration
  private let clock: any Clock<Duration>
  private var interactiveInFlight = 0
  private var speculativeRunning = false
  private var queue: [Waiter] = []
  private var quietTimer: Task<Void, Never>?
  private var timerGeneration = 0
  private var nextWaiterID: UInt64 = 0

  public init(
    quietPeriod: Duration = RequestScheduler.defaultQuietPeriod,
    clock: any Clock<Duration> = ContinuousClock()
  ) {
    self.quietPeriod = quietPeriod
    self.clock = clock
  }

  /// Runs one request in `lane`. `send` receives the priority to send it with: the header must
  /// match, since the API paces the two lanes differently.
  public nonisolated func perform<Value: Sendable>(
    _ lane: RequestLane,
    _ send: @Sendable (RequestPriority) async throws -> Value
  ) async throws -> Value {
    guard lane.priority == .speculative else {
      return try await runInteractive(send)
    }
    switch try await waitForSpeculativeTurn(lane) {
    case .interactive:
      return try await runInteractive(send)
    case .speculative:
      let result: Result<Value, any Error>
      do {
        result = .success(try await send(.speculative))
      } catch {
        result = .failure(error)
      }
      await finishSpeculative()
      if case .failure(let error) = result, Self.isSpeculativeRejection(error),
        lane.priority == .interactive
      {
        return try await runInteractive(send)
      }
      return try result.get()
    }
  }

  /// Runs one request with a fixed priority.
  public nonisolated func perform<Value: Sendable>(
    _ priority: RequestPriority,
    _ send: @Sendable (RequestPriority) async throws -> Value
  ) async throws -> Value {
    try await perform(RequestLane(priority), send)
  }

  // MARK: - Introspection (tests and diagnostics)

  /// Speculative calls waiting for their turn.
  public var waitingSpeculativeCount: Int { queue.count }

  /// Interactive calls in flight.
  public var interactiveCount: Int { interactiveInFlight }

  /// Whether a speculative call is running.
  public var isSpeculativeRunning: Bool { speculativeRunning }

  // MARK: - Lanes

  private static func isSpeculativeRejection(_ error: any Error) -> Bool {
    (error as? APIError)?.code == .tooManyRequests
  }

  private nonisolated func runInteractive<Value: Sendable>(
    _ send: @Sendable (RequestPriority) async throws -> Value
  ) async throws -> Value {
    await beginInteractive()
    do {
      let value = try await send(.interactive)
      await endInteractive()
      return value
    } catch {
      await endInteractive()
      throw error
    }
  }

  private func beginInteractive() {
    interactiveInFlight += 1
    cancelQuietTimer()
  }

  private func endInteractive() {
    interactiveInFlight -= 1
    pump()
  }

  private func finishSpeculative() {
    speculativeRunning = false
    pump()
  }

  private func waitForSpeculativeTurn(_ lane: RequestLane) async throws -> Grant {
    try Task.checkCancellation()
    let id = nextWaiterID
    nextWaiterID += 1
    return try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { continuation in
        guard !Task.isCancelled else {
          continuation.resume(throwing: CancellationError())
          return
        }
        var waiter = Waiter(id: id, continuation: continuation, lane: lane)
        waiter.promotionObserver = lane.observePromotion { [weak self] in
          Task { await self?.promoteWaiter(id) }
        }
        if waiter.promotionObserver == nil {
          // Promoted between the priority check and now.
          continuation.resume(returning: .interactive)
          return
        }
        queue.append(waiter)
        pump()
      }
    } onCancel: {
      Task { await self.cancelWaiter(id) }
    }
  }

  private func promoteWaiter(_ id: UInt64) {
    guard let index = queue.firstIndex(where: { $0.id == id }) else { return }
    let waiter = queue.remove(at: index)
    disarmIfIdle()
    waiter.continuation.resume(returning: .interactive)
  }

  private func cancelWaiter(_ id: UInt64) {
    guard let index = queue.firstIndex(where: { $0.id == id }) else { return }
    let waiter = queue.remove(at: index)
    if let observer = waiter.promotionObserver {
      waiter.lane.removePromotionObserver(observer)
    }
    disarmIfIdle()
    waiter.continuation.resume(throwing: CancellationError())
  }

  /// Stops the quiet timer once nothing waits for it.
  private func disarmIfIdle() {
    if queue.isEmpty {
      cancelQuietTimer()
    }
  }

  private func cancelQuietTimer() {
    quietTimer?.cancel()
    quietTimer = nil
    timerGeneration += 1
  }

  /// Arms the quiet timer when the speculative lane could open.
  private func pump() {
    guard interactiveInFlight == 0, !speculativeRunning, !queue.isEmpty, quietTimer == nil else {
      return
    }
    timerGeneration += 1
    let generation = timerGeneration
    let clock = clock
    let quietPeriod = quietPeriod
    quietTimer = Task {
      do {
        try await clock.sleep(for: quietPeriod)
      } catch {
        return
      }
      self.quietPeriodElapsed(generation)
    }
  }

  private func quietPeriodElapsed(_ generation: Int) {
    guard generation == timerGeneration else { return }
    quietTimer = nil
    guard interactiveInFlight == 0, !speculativeRunning, !queue.isEmpty else { return }
    let next = queue.removeFirst()
    if let observer = next.promotionObserver {
      next.lane.removePromotionObserver(observer)
    }
    speculativeRunning = true
    next.continuation.resume(returning: .speculative)
  }
}

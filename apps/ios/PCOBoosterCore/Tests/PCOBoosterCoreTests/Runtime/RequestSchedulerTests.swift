import Foundation
import PCOBoosterCore
import Testing

struct RequestSchedulerTests {
  private let quiet: Duration = .milliseconds(250)

  /// Starts an interactive call that holds until `gate` opens.
  private func holdInteractive(
    _ scheduler: RequestScheduler, gate: Gate, log: Recorder<String>, name: String
  ) -> Task<Void, any Error> {
    Task {
      try await scheduler.perform(.interactive) { priority in
        log.append("\(name) start \(priority.rawValue)")
        await gate.wait()
        log.append("\(name) end")
      }
    }
  }

  private func speculative(
    _ scheduler: RequestScheduler, lane: RequestLane = RequestLane(.speculative),
    log: Recorder<String>, name: String, gate: Gate? = nil
  ) -> Task<Void, any Error> {
    Task {
      try await scheduler.perform(lane) { priority in
        log.append("\(name) start \(priority.rawValue)")
        await gate?.wait()
        log.append("\(name) end")
      }
    }
  }

  @Test func interactiveCallsRunAtOnce() async throws {
    let clock = TestClock()
    let scheduler = RequestScheduler(quietPeriod: quiet, clock: clock)
    let log = Recorder<String>()
    try await scheduler.perform(.interactive) { priority in log.append("a \(priority.rawValue)") }
    #expect(log.values == ["a interactive"])
    #expect(clock.sleeperCount == 0)
  }

  @Test func speculativeWaitsForTheQuietPeriodAfterInteractiveWork() async throws {
    let clock = TestClock()
    let scheduler = RequestScheduler(quietPeriod: quiet, clock: clock)
    let log = Recorder<String>()
    let gate = Gate()

    let interactive = holdInteractive(scheduler, gate: gate, log: log, name: "i")
    await eventually { log.values == ["i start interactive"] }
    let prefetch = speculative(scheduler, log: log, name: "s")
    await eventually { await scheduler.waitingSpeculativeCount == 1 }

    // No timer while interactive work is in flight.
    #expect(clock.sleeperCount == 0)
    gate.open()
    try await interactive.value
    await clock.waitForSleepers()

    clock.advance(by: .milliseconds(249))
    #expect(clock.sleeperCount == 1)
    #expect(!log.values.contains("s start speculative"))

    clock.advance(by: .milliseconds(1))
    try await prefetch.value
    #expect(log.values == ["i start interactive", "i end", "s start speculative", "s end"])
  }

  @Test func interactiveWorkRestartsTheQuietPeriod() async throws {
    let clock = TestClock()
    let scheduler = RequestScheduler(quietPeriod: quiet, clock: clock)
    let log = Recorder<String>()

    let prefetch = speculative(scheduler, log: log, name: "s")
    await clock.waitForSleepers()
    clock.advance(by: .milliseconds(200))

    // An interactive call cancels the armed timer...
    let gate = Gate()
    let interactive = holdInteractive(scheduler, gate: gate, log: log, name: "i")
    await eventually { clock.sleeperCount == 0 }
    clock.advance(by: .milliseconds(100))
    #expect(!log.values.contains("s start speculative"))

    // ...and the full period starts over once it settles.
    gate.open()
    try await interactive.value
    await clock.waitForSleepers()
    clock.advance(by: .milliseconds(249))
    #expect(!log.values.contains("s start speculative"))
    clock.advance(by: .milliseconds(1))
    try await prefetch.value
    #expect(log.values.last == "s end")
  }

  @Test func speculativeCallsRunOneAtATimeInOrder() async throws {
    let clock = TestClock()
    let scheduler = RequestScheduler(quietPeriod: quiet, clock: clock)
    let log = Recorder<String>()
    let firstGate = Gate()

    let first = speculative(scheduler, log: log, name: "a", gate: firstGate)
    await eventually { await scheduler.waitingSpeculativeCount == 1 }
    let second = speculative(scheduler, log: log, name: "b")
    await eventually { await scheduler.waitingSpeculativeCount == 2 }

    await clock.waitForSleepers()
    clock.advance(by: quiet)
    await eventually { log.values == ["a start speculative"] }
    // `b` waits while `a` runs: no timer is armed.
    #expect(clock.sleeperCount == 0)
    #expect(await scheduler.isSpeculativeRunning)

    firstGate.open()
    try await first.value
    await clock.waitForSleepers()
    clock.advance(by: quiet)
    try await second.value
    #expect(log.values == ["a start speculative", "a end", "b start speculative", "b end"])
  }

  @Test func promotionWhileWaitingSendsAtOnceAsInteractive() async throws {
    let clock = TestClock()
    let scheduler = RequestScheduler(quietPeriod: quiet, clock: clock)
    let log = Recorder<String>()
    let lane = RequestLane(.speculative)

    let prefetch = speculative(scheduler, lane: lane, log: log, name: "s")
    await eventually { await scheduler.waitingSpeculativeCount == 1 }
    lane.promote()
    try await prefetch.value
    #expect(log.values == ["s start interactive", "s end"])
    #expect(await scheduler.waitingSpeculativeCount == 0)
  }

  @Test func resendsARejectedSpeculativeCallAsInteractiveOnceObserved() async throws {
    let clock = TestClock()
    let scheduler = RequestScheduler(quietPeriod: .zero, clock: clock)
    let lane = RequestLane(.speculative)
    let sent = Recorder<RequestPriority>()

    let result = try await scheduler.perform(lane) { priority -> String in
      sent.append(priority)
      if priority == .speculative {
        lane.promote()  // A screen opened what was being prefetched.
        throw APIError(kind: .response, code: .tooManyRequests, status: 429, message: "busy")
      }
      return "loaded"
    }
    #expect(result == "loaded")
    #expect(sent.values == [.speculative, .interactive])
  }

  @Test func keepsTheRejectionWhenStillSpeculative() async throws {
    let scheduler = RequestScheduler(quietPeriod: .zero, clock: TestClock())
    let sent = Recorder<RequestPriority>()
    await #expect(throws: APIError.self) {
      try await scheduler.perform(.speculative) { priority in
        sent.append(priority)
        throw APIError(kind: .response, code: .tooManyRequests, status: 429, message: "busy")
      }
    }
    #expect(sent.values == [.speculative])
    #expect(await scheduler.isSpeculativeRunning == false)
  }

  @Test func cancellingAWaitingCallDropsItFromTheLine() async throws {
    let clock = TestClock()
    let scheduler = RequestScheduler(quietPeriod: quiet, clock: clock)
    let log = Recorder<String>()

    let dropped = speculative(scheduler, log: log, name: "dropped")
    await eventually { await scheduler.waitingSpeculativeCount == 1 }
    let kept = speculative(scheduler, log: log, name: "kept")
    await eventually { await scheduler.waitingSpeculativeCount == 2 }

    dropped.cancel()
    await #expect(throws: CancellationError.self) { try await dropped.value }
    await eventually { await scheduler.waitingSpeculativeCount == 1 }

    await clock.waitForSleepers()
    clock.advance(by: quiet)
    try await kept.value
    #expect(log.values == ["kept start speculative", "kept end"])
  }

  @Test func cancellingInteractiveWorkKeepsTheLaneBalanced() async throws {
    let scheduler = RequestScheduler(quietPeriod: quiet, clock: TestClock())
    let started = Gate()
    let task = Task {
      try await scheduler.perform(.interactive) { _ in
        started.open()
        try await Task.sleep(for: .seconds(60))
      }
    }
    await started.wait()
    task.cancel()
    await #expect(throws: CancellationError.self) { try await task.value }
    await eventually { await scheduler.interactiveCount == 0 }
  }
}

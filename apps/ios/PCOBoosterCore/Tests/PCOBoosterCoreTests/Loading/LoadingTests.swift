import Foundation
import PCOBoosterCore
import Synchronization
import Testing

struct ContinuationTests {
  private struct Page: Sendable {
    let items: [Int]
    let deferred: [Int]
  }

  @Test func followsCursorsUntilDone() async throws {
    let calls = Recorder<[Int]?>()
    let pages = try await Continuation.follow(
      "people.dashboardActivity",
      fetch: { (cursor: [Int]?) -> Page in
        calls.append(cursor)
        let wanted = cursor ?? [1, 2, 3, 4, 5]
        return Page(items: Array(wanted.prefix(2)), deferred: Array(wanted.dropFirst(2)))
      },
      next: { $0.deferred.isEmpty ? nil : $0.deferred },
      madeProgress: { cursor, page in page.deferred.count < cursor.count })
    #expect(pages.flatMap(\.items) == [1, 2, 3, 4, 5])
    #expect(calls.values == [nil, [3, 4, 5], [5]])
  }

  @Test func throwsWhenAContinuationCallMakesNoProgress() async throws {
    let calls = Recorder<Int>()
    let error = await #expect(throws: ContinuationStalled.self) {
      _ = try await Continuation.follow(
        "people.candidateDetails",
        fetch: { (_: [Int]?) -> Page in
          calls.append(calls.count)
          return Page(items: [], deferred: [7, 8])
        },
        next: { $0.deferred.isEmpty ? nil : $0.deferred },
        madeProgress: { cursor, page in !page.items.isEmpty || page.deferred.count < cursor.count })
    }
    // The first call has nothing to compare against; the second repeats it.
    #expect(calls.count == 2)
    #expect(error?.operation == "people.candidateDetails")
    #expect(error?.reachedCallLimit == false)
    #expect(error?.userFacingMessage == "Planning Center is taking longer than usual. Please try again.")
  }

  @Test func equatableCursorsStallWhenRepeated() async throws {
    await #expect(throws: ContinuationStalled.self) {
      _ = try await Continuation.follow(
        "people.planWindowHistory",
        fetch: { (_: String?) in "same" },
        next: { (page: String) -> String? in page })
    }
  }

  @Test func stopsAtTheCallLimit() async throws {
    let error = await #expect(throws: ContinuationStalled.self) {
      _ = try await Continuation.follow(
        "op", callLimit: 3,
        fetch: { (cursor: Int?) in (cursor ?? 0) + 1 },
        next: { (page: Int) -> Int? in page })
    }
    #expect(error?.calls == 3)
    #expect(error?.reachedCallLimit == true)
  }
}

struct BatchedLoadTests {
  @Test func cutsBatchesOfSixteen() {
    let batches = BatchedLoad.batches(Array(0..<40))
    #expect(batches.map(\.count) == [16, 16, 8])
    #expect(batches.flatMap(\.self) == Array(0..<40))
    #expect(BatchedLoad.batches([Int]()).isEmpty)
  }

  @Test func runsAtMostTwoBatchesAtOnceAndReportsProgress() async {
    let inFlight = Mutex((current: 0, peak: 0))
    let progress = Recorder<LoadProgress>()
    let outcomes = await BatchedLoad.run(Array(0..<70)) { batch, index in
      inFlight.withLock {
        $0.current += 1
        $0.peak = max($0.peak, $0.current)
      }
      try await Task.sleep(for: .milliseconds(5))
      inFlight.withLock { $0.current -= 1 }
      if index == 2 { throw URLError(.timedOut) }
      return batch.reduce(0, +)
    } onBatch: { _, current in
      progress.append(current)
    }

    #expect(inFlight.withLock { $0.peak } == 2)
    #expect(outcomes.map(\.index) == [0, 1, 2, 3, 4])
    #expect(outcomes.map(\.items.count) == [16, 16, 16, 16, 6])
    #expect(outcomes[0].output == (0..<16).reduce(0, +))
    #expect(outcomes[2].error is URLError)
    #expect(progress.values.last == LoadProgress(total: 5, completed: 4, failed: 1))
    #expect(progress.values.last?.isFinished == true)
    #expect(progress.values.map(\.settled) == [1, 2, 3, 4, 5])
  }

  @Test func handlesAnEmptyLoad() async {
    let outcomes = await BatchedLoad.run([String]()) { _, _ in 1 }
    #expect(outcomes.isEmpty)
    #expect(LoadProgress(total: 0).fractionSettled == 1)
  }
}

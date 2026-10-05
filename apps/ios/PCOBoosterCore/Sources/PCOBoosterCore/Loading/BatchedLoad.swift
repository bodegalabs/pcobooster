import Foundation

/// How far a progressive load has come, for progress capsules and "Loaded 32 of 48".
public struct LoadProgress: Sendable, Hashable {
  /// Batches (or parts) in the load.
  public var total: Int
  /// Batches that loaded.
  public var completed: Int
  /// Batches that failed; offer Retry for them.
  public var failed: Int

  public init(total: Int, completed: Int = 0, failed: Int = 0) {
    self.total = total
    self.completed = completed
    self.failed = failed
  }

  /// Settled batches, loaded or failed.
  public var settled: Int { completed + failed }

  /// Every batch settled.
  public var isFinished: Bool { settled >= total }

  /// From 0 to 1; 1 for an empty load.
  public var fractionSettled: Double {
    total == 0 ? 1 : Double(settled) / Double(total)
  }
}

/// One batch's result.
public struct BatchOutcome<Item: Sendable, Output: Sendable>: Sendable {
  /// The batch's position, from 0.
  public let index: Int
  public let items: [Item]
  public let result: Result<Output, any Error>

  public var output: Output? {
    try? result.get()
  }

  public var error: (any Error)? {
    if case .failure(let error) = result { error } else { nil }
  }
}

/// Fan-out for the batched procedures (`people.candidateDetails`, `people.dashboardActivity`):
/// the web's batch size (16) and concurrency (2 in flight), so the shared Planning Center budget
/// holds up. A failed batch does not stop the others; count it and offer Retry.
public enum BatchedLoad {
  /// `PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE` and `PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE`.
  public static let batchSize = 16
  /// `CANDIDATE_DETAILS_BATCH_CONCURRENCY` and `PEOPLE_DASHBOARD_BATCH_CONCURRENCY`.
  public static let maxConcurrentBatches = 2

  /// `items` cut into batches of `size`, in order.
  public static func batches<Item>(_ items: [Item], size: Int = batchSize) -> [[Item]] {
    let size = max(size, 1)
    return stride(from: 0, to: items.count, by: size).map {
      Array(items[$0..<min($0 + size, items.count)])
    }
  }

  /// Loads `items` in batches, at most `maxConcurrent` at a time, starting batches in order.
  /// `onBatch` runs in the caller's isolation as each batch settles (in completion order), with
  /// the progress so far, so a `@MainActor` model can render people as their batch lands.
  ///
  /// ```swift
  /// let outcomes = await BatchedLoad.run(personIds) { ids, _ in
  ///   try await queries.fetch(.peopleDashboardActivity(personIds: ids)) { rpc in
  ///     try await loadActivity(ids, rpc)
  ///   }
  /// } onBatch: { outcome, progress in
  ///   self.progress = progress
  /// }
  /// ```
  ///
  /// - Returns: Every batch's outcome, in batch order.
  public static func run<Item: Sendable, Output: Sendable>(
    _ items: [Item],
    batchSize: Int = batchSize,
    maxConcurrent: Int = maxConcurrentBatches,
    load: @escaping @Sendable (_ batch: [Item], _ index: Int) async throws -> Output,
    onBatch: (BatchOutcome<Item, Output>, LoadProgress) -> Void = { _, _ in }
  ) async -> [BatchOutcome<Item, Output>] {
    let batches = batches(items, size: batchSize)
    var progress = LoadProgress(total: batches.count)
    var outcomes: [BatchOutcome<Item, Output>?] = Array(repeating: nil, count: batches.count)
    let limit = max(maxConcurrent, 1)

    await withTaskGroup(of: BatchOutcome<Item, Output>.self) { group in
      var nextIndex = 0
      func startNext() {
        guard nextIndex < batches.count else { return }
        let index = nextIndex
        let batch = batches[index]
        nextIndex += 1
        group.addTask {
          do {
            return BatchOutcome(index: index, items: batch, result: .success(try await load(batch, index)))
          } catch {
            return BatchOutcome(index: index, items: batch, result: .failure(error))
          }
        }
      }
      for _ in 0..<min(limit, batches.count) {
        startNext()
      }
      for await outcome in group {
        outcomes[outcome.index] = outcome
        switch outcome.result {
        case .success: progress.completed += 1
        case .failure: progress.failed += 1
        }
        onBatch(outcome, progress)
        startNext()
      }
    }
    return outcomes.compactMap(\.self)
  }
}

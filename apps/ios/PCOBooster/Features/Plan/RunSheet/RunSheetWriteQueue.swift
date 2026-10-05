import Foundation

/// Runs one plan's run sheet writes one after another, in the order they were asked for, like the
/// web's mutation scope (`plan-items:<serviceTypeId, planId>` in `use-plan-tab-controller.ts`).
/// Quick edits (a drag, then a key change, then a note) reach Planning Center in order, and a
/// create's follow-up reorder reads the cache only after earlier writes have landed.
///
/// Optimistic changes are applied before a write is queued, so the run sheet answers at once;
/// only the requests wait their turn.
@MainActor
final class RunSheetWriteQueue {
  private var tail: Task<Void, Never>?

  /// Runs `work` after every write already queued and returns its result.
  @discardableResult
  func run<Result: Sendable>(_ work: @escaping @MainActor () async -> Result) async -> Result {
    let task = enqueue(work)
    return await task.value
  }

  /// Queues `work` without waiting for it, for fire-and-forget writes such as committed deletes.
  func send(_ work: @escaping @MainActor () async -> Void) {
    _ = enqueue(work)
  }

  private func enqueue<Result: Sendable>(_ work: @escaping @MainActor () async -> Result) -> Task<
    Result, Never
  > {
    let previous = tail
    let task = Task { @MainActor in
      await previous?.value
      return await work()
    }
    tail = Task { @MainActor in _ = await task.value }
    return task
  }
}

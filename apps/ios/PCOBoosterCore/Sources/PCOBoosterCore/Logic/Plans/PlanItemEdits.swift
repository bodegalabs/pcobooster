import Foundation

// Port of the pure run sheet edits in apps/web/src/lib/plan-items-query-state.ts: optimistic
// items, insert, move, shift, remove (renumbering 1, 2, 3...), applying and diffing an
// editor draft, and the song options to prefetch. The TanStack cache plumbing in the same file
// (snapshot, restore, settle) is the native query layer's job. Pinned by the `plans.*PlanItem*`
// parity suites.

/// How long after a run sheet edit settles the web refetches the plan's items to reconcile
/// with Planning Center (`PLAN_ITEMS_MUTATION_RECONCILE_DELAY_MS`).
public let planItemsMutationReconcileDelay: Duration = .milliseconds(2500)

/// How many of a plan's songs get their song options prefetched
/// (`PLAN_SONG_OPTIONS_PREFETCH_LIMIT`).
public let planSongOptionsPrefetchLimit = 6

/// Adds an item and orders the list by sequence, keeping the order of equal sequences
/// (`appendPlanItem`).
public func appendPlanItem(_ items: [PlanItem], _ item: PlanItem) -> [PlanItem] {
  PlanLogic.stableSorted(items + [item]) { $0.sequence < $1.sequence }
}

/// One past the highest sequence, and at least 1 (`nextPlanItemSequence`).
public func nextPlanItemSequence(_ items: [PlanItem]) -> Double {
  items.reduce(0) { max($0, $1.sequence) } + 1
}

/// A placeholder header or item shown until Planning Center returns the real one
/// (`createOptimisticBasicPlanItem`).
public func createOptimisticBasicPlanItem(
  id: String, kind: PlanItemsCreateInputItemType, sequence: Double
) -> PlanItem {
  PlanItem(
    id: id,
    title: kind == .header ? "New Header" : "New Item",
    itemType: PlanItemType(rawValue: kind.rawValue),
    sequence: sequence,
    servicePosition: .during,
    description: "",
    htmlDetails: "",
    customArrangementSequence: []
  )
}

/// A placeholder song item shown until Planning Center returns the real one
/// (`createOptimisticSongPlanItem`).
public func createOptimisticSongPlanItem(
  id: String, song: SongCatalogEntry, sequence: Double
) -> PlanItem {
  PlanItem(
    song: PlanItemSong(
      lastScheduledAt: song.lastScheduledAt, id: song.id, title: song.title, author: song.author,
      themes: song.themes),
    id: id,
    title: song.title,
    itemType: .song,
    sequence: sequence,
    servicePosition: .during,
    description: "",
    htmlDetails: "",
    customArrangementSequence: []
  )
}

/// Swaps in the item with the same id (`replacePlanItem`).
public func replacePlanItem(_ items: [PlanItem], with updatedItem: PlanItem) -> [PlanItem] {
  replacePlanItem(items, id: updatedItem.id, with: updatedItem)
}

/// Swaps in `updatedItem` wherever the id is `itemId`, as when Planning Center's item replaces
/// an optimistic one (`replacePlanItemById`).
public func replacePlanItem(
  _ items: [PlanItem], id itemId: String, with updatedItem: PlanItem
) -> [PlanItem] {
  items.map { $0.id == itemId ? updatedItem : $0 }
}

/// The item as it will look once the editor's draft saves, for immediate feedback
/// (`applyPlanItemDraft`). A song keeps its title; an unknown service position keeps the
/// item's; a length of 0 or less clears it.
public func applyPlanItemDraft(
  _ item: PlanItem, draft: PlanItemDraft, length: Double?, arrangement: PlanItemArrangement?,
  key: PlanItemKey?
) -> PlanItem {
  var updated = item
  if item.song == nil {
    updated.title = draft.title
  }
  let servicePosition = PlanItemServicePosition(rawValue: draft.servicePosition)
  if PlanItemServicePosition.allCases.contains(servicePosition) {
    updated.servicePosition = servicePosition
  }
  updated.length = length.flatMap { $0 > 0 ? $0 : nil }
  updated.description = draft.description
  updated.arrangement = arrangement
  updated.key = key
  return updated
}

/// Whether saving the draft would change the item, so a save can skip a no-op update
/// (`planItemDraftChangesItem`). Only songs compare the arrangement and key.
///
/// Like the web, an empty arrangement or key id in the draft differs from a song with none,
/// so such a song always reads as changed.
public func planItemDraftChangesItem(_ item: PlanItem, draft: PlanItemDraft, length: Double?)
  -> Bool
{
  let normalizedLength = length.flatMap { $0 > 0 ? $0 : nil }
  if item.song == nil, !PlanLogic.identical(draft.title, item.title) {
    return true
  }
  if !PlanLogic.identical(draft.servicePosition, item.servicePosition.rawValue) {
    return true
  }
  if normalizedLength != item.length {
    return true
  }
  if !PlanLogic.identical(draft.description, item.description) {
    return true
  }
  if item.song != nil, draft.arrangementId != item.arrangement?.id {
    return true
  }
  if item.song != nil, draft.keyId != item.key?.id {
    return true
  }
  return false
}

private func renumbered(_ items: [PlanItem]) -> [PlanItem] {
  items.enumerated().map { index, item in
    var numbered = item
    numbered.sequence = Double(index + 1)
    return numbered
  }
}

/// Drops an item and renumbers the rest (`removePlanItem`).
public func removePlanItem(_ items: [PlanItem], id itemId: String) -> [PlanItem] {
  renumbered(items.filter { $0.id != itemId })
}

/// `Array.prototype.splice`'s start: a negative index counts back from the end, and the
/// result stays within `0...count`.
private func spliceIndex(_ index: Int, count: Int) -> Int {
  index < 0 ? max(count + index, 0) : min(index, count)
}

/// Moves the item at `fromIndex` to `toIndex` and renumbers (`movePlanItem`). Indexes behave
/// like `splice`'s: negative ones count from the end. When `fromIndex` names no item, the list
/// comes back unchanged.
public func movePlanItem(_ items: [PlanItem], from fromIndex: Int, to toIndex: Int) -> [PlanItem] {
  var moved = items
  let removeAt = spliceIndex(fromIndex, count: moved.count)
  guard removeAt < moved.count else {
    return items
  }
  let item = moved.remove(at: removeAt)
  moved.insert(item, at: spliceIndex(toIndex, count: moved.count))
  return renumbered(moved)
}

/// Moves the dragged item to the target item's place (`reorderPlanItems`). Unchanged when
/// either id is missing or they are the same.
public func reorderPlanItems(
  _ items: [PlanItem], dragged draggedItemId: String, target targetItemId: String
) -> [PlanItem] {
  if draggedItemId == targetItemId {
    return items
  }
  guard let fromIndex = items.firstIndex(where: { $0.id == draggedItemId }),
    let toIndex = items.firstIndex(where: { $0.id == targetItemId })
  else {
    return items
  }
  return movePlanItem(items, from: fromIndex, to: toIndex)
}

/// Where a new item goes in the plan (`PlanInsertion`): after `afterItemId`, or at the top
/// when it is nil. Passing no insertion at all adds the item at the end.
public struct PlanInsertion: Codable, Hashable, Sendable {
  public var afterItemId: String?

  public init(afterItemId: String?) {
    self.afterItemId = afterItemId
  }

  /// Before every other item.
  public static let top = PlanInsertion(afterItemId: nil)
}

/// Adds an item after the insertion point and renumbers (`insertPlanItem`). No insertion, or
/// an `afterItemId` that isn't in the list, adds it at the end.
public func insertPlanItem(
  _ items: [PlanItem], _ item: PlanItem, at insertion: PlanInsertion? = nil
) -> [PlanItem] {
  guard let insertion else {
    return renumbered(items + [item])
  }
  var index = 0
  if let afterItemId = insertion.afterItemId {
    index = items.firstIndex(where: { $0.id == afterItemId }).map { $0 + 1 } ?? items.count
  }
  var inserted = items
  inserted.insert(item, at: index)
  return renumbered(inserted)
}

/// Moves an item `offset` places (the web uses -1 and 1); unchanged when the item is missing
/// or would leave the list (`shiftPlanItem`).
public func shiftPlanItem(_ items: [PlanItem], id itemId: String, by offset: Int) -> [PlanItem] {
  guard let fromIndex = items.firstIndex(where: { $0.id == itemId }) else {
    return items
  }
  let (toIndex, overflow) = fromIndex.addingReportingOverflow(offset)
  guard !overflow, items.indices.contains(toIndex) else {
    return items
  }
  return movePlanItem(items, from: fromIndex, to: toIndex)
}

/// Whether two lists hold the same item ids in the same order, whatever their sequences
/// (`planItemsHaveSameOrder`).
public func planItemsHaveSameOrder(_ currentItems: [PlanItem], _ nextItems: [PlanItem]) -> Bool {
  currentItems.map(\.id) == nextItems.map(\.id)
}

/// The first `limit` distinct song ids in plan order, to prefetch their song options
/// (`collectPlanSongOptionPrefetchIds`).
public func collectPlanSongOptionPrefetchIds(
  _ items: [PlanItem], limit: Int = planSongOptionsPrefetchLimit
) -> [String] {
  if limit <= 0 {
    return []
  }
  var songIds: [String] = []
  var seen = Set<String>()
  for item in items {
    guard let songId = item.song?.id, !songId.isEmpty else {
      continue
    }
    if seen.insert(songId).inserted {
      songIds.append(songId)
    }
    if songIds.count >= limit {
      break
    }
  }
  return songIds
}

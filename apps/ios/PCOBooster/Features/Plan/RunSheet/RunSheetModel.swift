import Foundation
import Observation
import PCOBoosterCore

/// A removed run sheet item still inside its undo window.
struct RunSheetRemoval: Identifiable, Equatable {
  /// The plan item's id.
  let id: String
  let title: String
}

/// The run sheet's data and writes: the plan's items (`planItems.list`, shared through the cache
/// with Overview), removals waiting out their undo window, and the song options the rows read
/// for tempo facts and quick key changes. Port of `hooks/use-plan-tab-controller.ts`; the pure
/// edits come from `Logic/Plans` (`insertPlanItem`, `applyPlanItemDraft`, ...).
@MainActor
@Observable
final class RunSheetModel {
  /// How long a removed item can be restored before the delete reaches Planning Center
  /// (`DELETE_UNDO_WINDOW_MS`).
  static let undoWindow: Duration = .seconds(5)

  let serviceTypeId: String
  let planId: String
  let items: QueryState<[PlanItem]>

  /// Items hidden while their delete waits out the undo window or is in flight. A refetch can
  /// bring such an item back, so the list filters it rather than dropping it from the cache.
  var hiddenItemIds: Set<String> = []
  /// Removals that can still be undone, oldest first.
  var removals: [RunSheetRemoval] = []
  /// The item a write is in flight for; its row dims after a moment.
  var busyItemId: String?
  /// A header or item is being created (the web disables Header and Item meanwhile).
  var isCreatingBasicItem = false
  /// The song being added, so the palette can show it as pending.
  var pendingSongId: String?
  /// Songs whose cached options the rows may read.
  var warmedSongIds: Set<String> = []
  /// Bumps when an add or a save lands, for the success haptic.
  var landedWrites = 0
  /// Bumps when a reorder is applied, for the drop haptic.
  var reorderCount = 0
  /// The newest item added (its optimistic id, then Planning Center's), for scrolling to it.
  var lastAddedItemId: String?

  @ObservationIgnored let queries: QueryClient
  @ObservationIgnored let writes = RunSheetWriteQueue()
  @ObservationIgnored var undoTimers: [String: Task<Void, Never>] = [:]
  @ObservationIgnored var pendingRemovedItems: [String: PlanItem] = [:]
  @ObservationIgnored var prefetches: [PrefetchHandle] = []
  @ObservationIgnored private var prefetchedSongIds: [String] = []

  init(queries: QueryClient, serviceTypeId: String, planId: String) {
    self.queries = queries
    self.serviceTypeId = serviceTypeId
    self.planId = planId
    items = queries.query(
      .planItems(serviceTypeId: serviceTypeId, planId: planId), RPC.PlanItems.list,
      PlanItemsListInput(serviceTypeId: serviceTypeId, planId: planId))
  }

  var itemsKey: QueryKey { .planItems(serviceTypeId: serviceTypeId, planId: planId) }

  /// What a run sheet write marks stale and refetches 2.5 s after the last one lands
  /// (`settlePlanItemsQuery`, which also drops saved song searches).
  var settleFilters: [QueryFilter] { [.key(itemsKey), .family(.songSearch)] }

  /// The items in order, without the ones waiting to be deleted.
  var visibleItems: [PlanItem] {
    let all = items.value ?? []
    guard !hiddenItemIds.isEmpty else { return all }
    return all.filter { !hiddenItemIds.contains($0.id) }
  }

  func item(id: String?) -> PlanItem? {
    guard let id else { return nil }
    return visibleItems.first { $0.id == id }
  }

  /// A row added on this device that Planning Center hasn't returned yet. It can't be opened,
  /// removed, or reordered until it has its real id.
  nonisolated static func isOptimistic(_ itemId: String) -> Bool {
    itemId.hasPrefix("optimistic-")
  }

  // MARK: Song options

  func songOptionsKey(_ songId: String) -> QueryKey {
    .songOptions(songId: songId, serviceTypeId: serviceTypeId)
  }

  /// The song's cached arrangements and keys, when they are already on this device. Never
  /// loads anything; safe to read while drawing.
  func cachedSongOptions(_ songId: String?) -> SongOptionSet? {
    guard let songId, warmedSongIds.contains(songId) else { return nil }
    return queries.value(for: songOptionsKey(songId), as: SongOptionSet.self)
  }

  /// Restores saved song options for the plan's songs (no requests), then loads the first six
  /// songs' options one at a time in the speculative lane, after the run sheet itself, like the
  /// web (`collectPlanSongOptionPrefetchIds`). Call when the items change, never while drawing.
  func warmSongOptions(for items: [PlanItem]) {
    var warmed = warmedSongIds
    for songId in items.compactMap(\.song?.id) where !warmed.contains(songId) {
      _ = queries.value(for: songOptionsKey(songId), as: SongOptionSet.self)
      warmed.insert(songId)
    }
    if warmed != warmedSongIds {
      warmedSongIds = warmed
    }
    let songIds = collectPlanSongOptionPrefetchIds(items)
    guard songIds != prefetchedSongIds else { return }
    prefetchedSongIds = songIds
    for songId in songIds {
      prefetches.append(
        queries.prefetch(
          songOptionsKey(songId), RPC.Songs.options,
          SongsOptionsInput(serviceTypeId: serviceTypeId, songId: songId)))
    }
  }

  /// Loads one song's options in the speculative lane on a deliberate long press, so its keys
  /// are ready in the menu and the details (`getItemIntentProps` on the web). Nothing loads
  /// when they are fresh.
  func prefetchSongOptions(for item: PlanItem) {
    guard let songId = item.song?.id else { return }
    warmedSongIds.insert(songId)
    prefetches.append(
      queries.prefetch(
        songOptionsKey(songId), RPC.Songs.options,
        SongsOptionsInput(serviceTypeId: serviceTypeId, songId: songId)))
  }

  /// Leaving the plan: sends the deletes the person already chose (undo ends with the screen)
  /// and drops prefetches nobody is waiting for.
  func leave() {
    commitPendingRemovals()
    for handle in prefetches {
      handle.cancel()
    }
    prefetches = []
    prefetchedSongIds = []
  }
}

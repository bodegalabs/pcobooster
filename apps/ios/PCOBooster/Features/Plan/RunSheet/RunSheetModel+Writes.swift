import Foundation
import PCOBoosterCore

// Run sheet writes, each optimistic with rollback, sent one at a time per plan, then settled by
// the refetch 2.5 s after the last one (`QueryClient.write`). Removals wait out a 5 second undo
// window, and every other write sends the pending deletes first so Planning Center sees the
// plan as shown (`commitPendingDeletes` in `use-plan-tab-controller.ts`).
extension RunSheetModel {
  // MARK: Adding

  /// Adds a "New Header" or "New Item" at `insertion` (nil adds at the end) and returns
  /// Planning Center's item, or nil when the create failed (already reported).
  @discardableResult
  func addBasicItem(_ kind: PlanItemsCreateInputItemType, at insertion: PlanInsertion?) async
    -> PlanItem?
  {
    commitPendingRemovals()
    let optimisticId = "optimistic-\(kind.rawValue)-\(UUID().uuidString)"
    let rollback = queries.mutate(itemsKey, as: [PlanItem].self) { items in
      items = insertPlanItem(
        items,
        createOptimisticBasicPlanItem(
          id: optimisticId, kind: kind, sequence: nextPlanItemSequence(items)),
        at: insertion)
    }
    isCreatingBasicItem = true
    defer { isCreatingBasicItem = false }
    let input = PlanItemsCreateInput(
      serviceTypeId: serviceTypeId, planId: planId,
      title: kind == .header ? "New Header" : "New Item", itemType: kind)
    return await create(input, optimisticId: optimisticId, insertion: insertion, rollback: rollback)
  }

  /// Adds a song at `insertion` with the arrangement, key, layout, and length its cached
  /// options suggest; without cached options Planning Center picks them (`addSongMutation`).
  @discardableResult
  func addSong(_ song: SongCatalogEntry, at insertion: PlanInsertion?) async -> PlanItem? {
    commitPendingRemovals()
    let optimisticId = "optimistic-song-\(song.id)-\(UUID().uuidString)"
    let rollback = queries.mutate(itemsKey, as: [PlanItem].self) { items in
      items = insertPlanItem(
        items,
        createOptimisticSongPlanItem(
          id: optimisticId, song: song, sequence: nextPlanItemSequence(items)),
        at: insertion)
    }
    pendingSongId = song.id
    defer { pendingSongId = nil }
    let options = queries.value(for: songOptionsKey(song.id), as: SongOptionSet.self)
    let suggested = options?.arrangements.first { $0.id == options?.suggestedArrangementId }
    let input = PlanItemsCreateInput(
      serviceTypeId: serviceTypeId, planId: planId,
      title: options?.song.title ?? song.title,
      length: suggested?.length.map { Nullable.value(Int($0.rounded())) },
      songId: .value(song.id),
      arrangementId: options?.suggestedArrangementId.map { Nullable.value($0) },
      keyId: options?.suggestedKeyId.map { Nullable.value($0) },
      selectedLayoutId: options?.suggestedLayoutId.map { Nullable.value($0) })
    return await create(input, optimisticId: optimisticId, insertion: insertion, rollback: rollback)
  }

  /// Swaps a song for another in the same place: the new one goes in after it, then the old
  /// one leaves with an undo (`chooseSong` in `plan-tab.tsx`).
  func replaceSong(_ itemId: String, with song: SongCatalogEntry) async {
    guard await addSong(song, at: PlanInsertion(afterItemId: itemId)) != nil else { return }
    remove(itemId)
  }

  private func create(
    _ input: PlanItemsCreateInput, optimisticId: String, insertion: PlanInsertion?,
    rollback: QueryRollback
  ) async -> PlanItem? {
    busyItemId = optimisticId
    lastAddedItemId = optimisticId
    let serviceTypeId = serviceTypeId
    let planId = planId
    let created = await writes.run { [self] in
      await queries.write(optimistic: { _ in rollback }, settle: settleFilters) { [self] rpc in
        let created = try await rpc(RPC.PlanItems.create, input)
        // Planning Center appends, so an item placed mid-plan moves into place with a reorder
        // in the cache's order, where the optimistic row already sits (`placeCreatedItem`).
        if let sequence = await placementSequence(
          for: created, replacing: optimisticId, insertion: insertion)
        {
          _ = try await rpc(
            RPC.PlanItems.reorder,
            PlanItemsReorderInput(serviceTypeId: serviceTypeId, planId: planId, sequence: sequence))
        }
        return created
      }
    }
    if busyItemId == optimisticId {
      busyItemId = nil
    }
    guard let created else {
      if lastAddedItemId == optimisticId {
        lastAddedItemId = nil
      }
      return nil
    }
    _ = queries.mutate(itemsKey, as: [PlanItem].self) { items in
      items = replacePlanItem(items, id: optimisticId, with: created)
    }
    if lastAddedItemId == optimisticId {
      lastAddedItemId = created.id
    }
    landedWrites += 1
    return created
  }

  /// The order to send after creating `created` in place of `optimisticId`, or nil when it
  /// already sits last (or was added at the end).
  private func placementSequence(
    for created: PlanItem, replacing optimisticId: String, insertion: PlanInsertion?
  ) -> [String]? {
    guard insertion != nil else { return nil }
    let sequence = currentSequence { $0 == optimisticId ? created.id : $0 }
    return sequence.last == created.id ? nil : sequence
  }

  /// Item ids in the cache's current order, without rows Planning Center hasn't created yet.
  private func currentSequence(mapping map: (String) -> String = { $0 }) -> [String] {
    (queries.value(for: itemsKey, as: [PlanItem].self) ?? []).compactMap { item in
      let id = map(item.id)
      return Self.isOptimistic(id) ? nil : id
    }
  }

  // MARK: Editing

  /// Saves an edited draft, skipping a save that changes nothing (`saveItem`). Headers never
  /// send a length and songs never send their title, as on the web.
  func save(
    _ item: PlanItem, draft: PlanItemDraft, length: Double?, arrangement: PlanItemArrangement?,
    key: PlanItemKey?
  ) {
    guard !Self.isOptimistic(item.id),
      planItemDraftChangesItem(item, draft: draft, length: length)
    else { return }
    commitPendingRemovals()
    let updated = applyPlanItemDraft(
      item, draft: draft, length: length, arrangement: arrangement, key: key)
    let rollback = queries.mutate(itemsKey, as: [PlanItem].self) { items in
      items = replacePlanItem(items, with: updated)
    }
    let servicePosition = PlanItemServicePosition(rawValue: draft.servicePosition)
    let input = PlanItemsUpdateInput(
      serviceTypeId: serviceTypeId, planId: planId,
      title: item.song == nil ? draft.title : item.title,
      servicePosition: PlanItemServicePosition.allCases.contains(servicePosition)
        ? servicePosition : nil,
      // Planning Center rejects any length on a header, even an empty one.
      length: item.itemType == .header ? nil : Nullable(Self.savedLength(length)),
      description: draft.description,
      arrangementId: draft.arrangementId.isEmpty ? nil : .value(draft.arrangementId),
      keyId: draft.keyId.isEmpty ? nil : .value(draft.keyId),
      itemId: item.id)
    busyItemId = item.id
    Task {
      let saved = await writes.run { [self] in
        await queries.write(
          RPC.PlanItems.update, input, optimistic: { _ in rollback }, settle: settleFilters)
      }
      if busyItemId == item.id {
        busyItemId = nil
      }
      guard let saved else { return }
      _ = queries.mutate(itemsKey, as: [PlanItem].self) { items in
        items = replacePlanItem(items, with: saved)
      }
      landedWrites += 1
    }
  }

  /// Picks another arrangement and key for a song, saved right away (`onChangeKey`).
  func changeKey(_ item: PlanItem, arrangement: ArrangementOption, key: KeyOption) {
    var draft = buildDraft(item)
    draft.arrangementId = arrangement.id
    draft.keyId = key.id
    save(
      item, draft: draft, length: item.length,
      arrangement: Self.optimisticArrangement(arrangement), key: Self.optimisticKey(key))
  }

  /// Sets an item's length in seconds (nil clears it).
  func changeLength(_ item: PlanItem, to length: Double?) {
    save(item, draft: buildDraft(item), length: length, arrangement: item.arrangement, key: item.key)
  }

  /// Adds a line to an item's notes, such as a key change idea (`onAddNote`).
  func addNote(_ item: PlanItem, note: String) {
    var draft = buildDraft(item)
    draft.description = appendNote(item.description, line: note)
    save(item, draft: draft, length: item.length, arrangement: item.arrangement, key: item.key)
  }

  // MARK: Reordering

  /// Applies a new order now and sends it after earlier writes. The order sent is read from the
  /// cache when the request goes out, so rows created meanwhile carry their real ids.
  func reorder(to nextItems: [PlanItem]) {
    guard !planItemsHaveSameOrder(visibleItems, nextItems),
      !nextItems.contains(where: { Self.isOptimistic($0.id) })
    else { return }
    commitPendingRemovals()
    let rollback = queries.mutate(itemsKey, as: [PlanItem].self) { items in
      items = nextItems
    }
    reorderCount += 1
    let serviceTypeId = serviceTypeId
    let planId = planId
    writes.send { [self] in
      let sequence = currentSequence()
      await queries.write(optimistic: { _ in rollback }, settle: settleFilters) { rpc in
        try await rpc(
          RPC.PlanItems.reorder,
          PlanItemsReorderInput(serviceTypeId: serviceTypeId, planId: planId, sequence: sequence))
      }
    }
  }

  /// A drag in the list (`List.onMove` offsets).
  func move(fromOffsets source: IndexSet, toOffset destination: Int) {
    guard source.count == 1, let from = source.first else { return }
    let to = destination > from ? destination - 1 : destination
    reorder(to: movePlanItem(visibleItems, from: from, to: to))
  }

  /// Moves an item one place up (-1) or down (1).
  func shift(_ itemId: String, by offset: Int) {
    reorder(to: shiftPlanItem(visibleItems, id: itemId, by: offset))
  }

  // MARK: Removing

  /// Hides the item now and deletes it once the undo window passes (`removeItem`).
  func remove(_ itemId: String) {
    guard !Self.isOptimistic(itemId), let item = visibleItems.first(where: { $0.id == itemId })
    else { return }
    hiddenItemIds.insert(itemId)
    pendingRemovedItems[itemId] = item
    removals.append(
      RunSheetRemoval(id: itemId, title: item.title.isEmpty ? "Untitled item" : item.title))
    undoTimers[itemId] = Task { [weak self] in
      try? await Task.sleep(for: Self.undoWindow)
      guard !Task.isCancelled else { return }
      self?.commitRemoval(itemId)
    }
  }

  /// Brings a removed item back before its delete is sent.
  func undoRemoval(_ itemId: String) {
    guard pendingRemovedItems.removeValue(forKey: itemId) != nil else { return }
    undoTimers.removeValue(forKey: itemId)?.cancel()
    removals.removeAll { $0.id == itemId }
    hiddenItemIds.remove(itemId)
  }

  /// Sends one removal's delete now. The row stays hidden until the delete settles; a failure
  /// brings it back with an error toast.
  func commitRemoval(_ itemId: String) {
    guard let item = pendingRemovedItems.removeValue(forKey: itemId) else { return }
    undoTimers.removeValue(forKey: itemId)?.cancel()
    removals.removeAll { $0.id == itemId }
    let input = PlanItemsDeleteInput(serviceTypeId: serviceTypeId, planId: planId, itemId: item.id)
    writes.send { [self] in
      let deleted = await queries.write(RPC.PlanItems.delete, input, settle: settleFilters)
      if deleted != nil {
        // Drop it before it stops being hidden, or it shows again until the settle refetch.
        _ = queries.mutate(itemsKey, as: [PlanItem].self) { items in
          items.removeAll { $0.id == itemId }
        }
      }
      hiddenItemIds.remove(itemId)
    }
  }

  /// Sends every delete still in its undo window, so later writes see the plan as shown.
  func commitPendingRemovals() {
    for itemId in Array(pendingRemovedItems.keys) {
      commitRemoval(itemId)
    }
  }

  // MARK: Helpers

  /// The length to send: positive seconds, else nothing (`savedLengthOf`).
  nonisolated static func savedLength(_ length: Double?) -> Int? {
    guard let length, length.isFinite, length > 0 else { return nil }
    return Int(length.rounded())
  }

  /// A song's arrangement as the run sheet shows it until Planning Center answers.
  nonisolated static func optimisticArrangement(_ arrangement: ArrangementOption)
    -> PlanItemArrangement
  {
    PlanItemArrangement(
      archivedAt: nil, id: arrangement.id, sequence: arrangement.sequence,
      length: arrangement.length, name: arrangement.name)
  }

  nonisolated static func optimisticKey(_ key: KeyOption) -> PlanItemKey {
    PlanItemKey(id: key.id, name: key.name, startingKey: key.startingKey, endingKey: key.endingKey)
  }
}

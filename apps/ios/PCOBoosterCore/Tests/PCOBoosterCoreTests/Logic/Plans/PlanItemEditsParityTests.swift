import Foundation
import PCOBoosterCore
import Testing

/// Replays the run sheet edit fixtures that scripts/parity/plans.parity.ts writes from
/// apps/web/src/lib/plan-items-query-state.ts. Reordering edits are compared by id and
/// sequence, the only fields they change.
struct PlanItemEditsParityTests {
  struct ItemPosition: Decodable, Sendable, Equatable {
    let id: String
    let sequence: Double
  }

  struct AppendInput: Decodable, Sendable {
    let item: PlanItem
    let items: [PlanItem]
  }

  struct BasicItemInput: Decodable, Sendable {
    let id: String
    let kind: PlanItemsCreateInputItemType
    let sequence: Double
  }

  struct SongItemInput: Decodable, Sendable {
    let id: String
    let sequence: Double
    let song: SongCatalogEntry
  }

  struct ReplaceInput: Decodable, Sendable {
    let itemId: String?
    let items: [PlanItem]
    let updatedItem: PlanItem
  }

  struct ApplyDraftInput: Decodable, Sendable {
    let arrangement: PlanItemArrangement?
    let draft: PlanItemDraft
    let item: PlanItem
    let key: PlanItemKey?
    let length: Double?
  }

  struct DraftVariant: Decodable, Sendable {
    let draft: PlanItemDraft
    let length: Double?
  }

  struct DraftChangeInput: Decodable, Sendable {
    let item: PlanItem
    let variants: [DraftVariant]
  }

  struct RemoveInput: Decodable, Sendable {
    let itemIds: [String]
    let items: [PlanItem]
  }

  struct Move: Decodable, Sendable {
    let fromIndex: Int
    let toIndex: Int
  }

  struct MoveInput: Decodable, Sendable {
    let items: [PlanItem]
    let moves: [Move]
  }

  struct Reorder: Decodable, Sendable {
    let draggedItemId: String
    let targetItemId: String
  }

  struct ReorderInput: Decodable, Sendable {
    let items: [PlanItem]
    let reorders: [Reorder]
  }

  struct InsertInput: Decodable, Sendable {
    let insertion: PlanInsertion?
    let item: PlanItem
    let items: [PlanItem]
  }

  struct ShiftInput: Decodable, Sendable {
    let itemId: String
    let items: [PlanItem]
    let offset: Int
  }

  struct SameOrderInput: Decodable, Sendable {
    let current: [PlanItem]
    let next: [PlanItem]
  }

  struct PrefetchInput: Decodable, Sendable {
    let items: [PlanItem]
    /// Nil stands for the default limit.
    let limits: [Int?]
  }

  private static func positions(_ items: [PlanItem]) -> [ItemPosition] {
    items.map { ItemPosition(id: $0.id, sequence: $0.sequence) }
  }

  @Test(arguments: Parity.cases("plans.appendPlanItem", AppendInput.self, [ItemPosition].self))
  func append(_ parity: ParityCase<AppendInput, [ItemPosition]>) {
    let input = parity.input
    #expect(Self.positions(appendPlanItem(input.items, input.item)) == parity.output)
  }

  @Test(arguments: Parity.cases("plans.nextPlanItemSequence", [PlanItem].self, Double.self))
  func nextSequence(_ parity: ParityCase<[PlanItem], Double>) {
    #expect(nextPlanItemSequence(parity.input) == parity.output)
  }

  @Test(
    arguments: Parity.cases(
      "plans.createOptimisticBasicPlanItem", BasicItemInput.self, PlanItem.self)
  )
  func optimisticBasicItem(_ parity: ParityCase<BasicItemInput, PlanItem>) {
    let input = parity.input
    #expect(
      createOptimisticBasicPlanItem(id: input.id, kind: input.kind, sequence: input.sequence)
        == parity.output)
  }

  @Test(
    arguments: Parity.cases("plans.createOptimisticSongPlanItem", SongItemInput.self, PlanItem.self)
  )
  func optimisticSongItem(_ parity: ParityCase<SongItemInput, PlanItem>) {
    let input = parity.input
    #expect(
      createOptimisticSongPlanItem(id: input.id, song: input.song, sequence: input.sequence)
        == parity.output)
  }

  @Test(arguments: Parity.cases("plans.replacePlanItem", ReplaceInput.self, [PlanItem].self))
  func replace(_ parity: ParityCase<ReplaceInput, [PlanItem]>) {
    let input = parity.input
    let replaced =
      if let itemId = input.itemId {
        replacePlanItem(input.items, id: itemId, with: input.updatedItem)
      } else {
        replacePlanItem(input.items, with: input.updatedItem)
      }
    #expect(replaced == parity.output)
  }

  @Test(arguments: Parity.cases("plans.applyPlanItemDraft", ApplyDraftInput.self, PlanItem.self))
  func applyDraft(_ parity: ParityCase<ApplyDraftInput, PlanItem>) {
    let input = parity.input
    #expect(
      applyPlanItemDraft(
        input.item, draft: input.draft, length: input.length, arrangement: input.arrangement,
        key: input.key) == parity.output)
  }

  @Test(
    arguments: Parity.cases("plans.planItemDraftChangesItem", DraftChangeInput.self, [Bool].self))
  func draftChanges(_ parity: ParityCase<DraftChangeInput, [Bool]>) {
    let input = parity.input
    let changes = input.variants.map {
      planItemDraftChangesItem(input.item, draft: $0.draft, length: $0.length)
    }
    #expect(changes == parity.output)
  }

  @Test(arguments: Parity.cases("plans.removePlanItem", RemoveInput.self, [[ItemPosition]].self))
  func remove(_ parity: ParityCase<RemoveInput, [[ItemPosition]]>) {
    let input = parity.input
    let results = input.itemIds.map { Self.positions(removePlanItem(input.items, id: $0)) }
    #expect(results == parity.output)
  }

  @Test(arguments: Parity.cases("plans.movePlanItem", MoveInput.self, [[ItemPosition]].self))
  func move(_ parity: ParityCase<MoveInput, [[ItemPosition]]>) {
    let input = parity.input
    let results = input.moves.map {
      Self.positions(movePlanItem(input.items, from: $0.fromIndex, to: $0.toIndex))
    }
    #expect(results == parity.output)
  }

  @Test(arguments: Parity.cases("plans.reorderPlanItems", ReorderInput.self, [[ItemPosition]].self))
  func reorder(_ parity: ParityCase<ReorderInput, [[ItemPosition]]>) {
    let input = parity.input
    let results = input.reorders.map {
      Self.positions(
        reorderPlanItems(input.items, dragged: $0.draggedItemId, target: $0.targetItemId))
    }
    #expect(results == parity.output)
  }

  @Test(arguments: Parity.cases("plans.insertPlanItem", InsertInput.self, [ItemPosition].self))
  func insert(_ parity: ParityCase<InsertInput, [ItemPosition]>) {
    let input = parity.input
    #expect(
      Self.positions(insertPlanItem(input.items, input.item, at: input.insertion))
        == parity.output)
  }

  @Test(arguments: Parity.cases("plans.shiftPlanItem", ShiftInput.self, [ItemPosition].self))
  func shift(_ parity: ParityCase<ShiftInput, [ItemPosition]>) {
    let input = parity.input
    #expect(
      Self.positions(shiftPlanItem(input.items, id: input.itemId, by: input.offset))
        == parity.output)
  }

  @Test(arguments: Parity.cases("plans.planItemsHaveSameOrder", SameOrderInput.self, Bool.self))
  func sameOrder(_ parity: ParityCase<SameOrderInput, Bool>) {
    #expect(planItemsHaveSameOrder(parity.input.current, parity.input.next) == parity.output)
  }

  @Test(
    arguments: Parity.cases(
      "plans.collectPlanSongOptionPrefetchIds", PrefetchInput.self, [[String]].self))
  func prefetchIds(_ parity: ParityCase<PrefetchInput, [[String]]>) {
    let input = parity.input
    let results = input.limits.map { limit in
      if let limit {
        collectPlanSongOptionPrefetchIds(input.items, limit: limit)
      } else {
        collectPlanSongOptionPrefetchIds(input.items)
      }
    }
    #expect(results == parity.output)
  }
}

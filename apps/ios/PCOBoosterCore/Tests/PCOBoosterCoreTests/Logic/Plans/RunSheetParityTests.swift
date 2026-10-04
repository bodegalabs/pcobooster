import Foundation
import PCOBoosterCore
import Testing

/// Replays the run sheet helper fixtures that scripts/parity/plans.parity.ts writes from
/// apps/web/src/components/schedule/plan-tab-helpers.ts.
struct RunSheetParityTests {
  struct RunSheetRow: Decodable, Sendable {
    let id: String
    let sectionLength: Double?
  }

  struct PickKeyInput: Decodable, Sendable {
    let arrangement: ArrangementOption
    let currentKeyId: String
    let suggestedKeyId: String?
  }

  struct SynchronizeInput: Decodable, Sendable {
    let drafts: [PlanItemDraft]
    let songOptions: SongOptionSet?
  }

  @Test(arguments: Parity.cases("plans.buildDraft", PlanItem.self, PlanItemDraft.self))
  func draft(_ parity: ParityCase<PlanItem, PlanItemDraft>) {
    #expect(buildDraft(parity.input) == parity.output)
  }

  @Test(arguments: Parity.cases("plans.parseLengthText", String.self, ParsedLengthText.self))
  func lengthText(_ parity: ParityCase<String, ParsedLengthText>) {
    #expect(parseLengthText(parity.input) == parity.output)
  }

  @Test(arguments: Parity.cases("plans.formatLength", Double?.self, String?.self))
  func length(_ parity: ParityCase<Double?, String?>) {
    #expect(formatLength(parity.input) == parity.output)
  }

  /// The web's map keeps insertion order; lookups are by id, so the port returns a dictionary.
  @Test(arguments: Parity.cases("plans.buildRunSheet", [PlanItem].self, [RunSheetRow].self))
  func runSheet(_ parity: ParityCase<[PlanItem], [RunSheetRow]>) {
    let expected = Dictionary(
      parity.output.map { ($0.id, RunSheetEntry(sectionLength: $0.sectionLength)) },
      uniquingKeysWith: { _, last in last })
    #expect(buildRunSheet(parity.input) == expected)
  }

  @Test(arguments: Parity.cases("plans.itemTypeLabel", PlanItem.self, String.self))
  func typeLabel(_ parity: ParityCase<PlanItem, String>) {
    #expect(itemTypeLabel(parity.input) == parity.output)
  }

  @Test(arguments: Parity.cases("plans.servicePositionLabel", String?.self, String.self))
  func positionLabel(_ parity: ParityCase<String?, String>) {
    #expect(servicePositionLabel(parity.input) == parity.output)
  }

  @Test(arguments: Parity.cases("plans.pickKeyId", PickKeyInput.self, String.self))
  func keyId(_ parity: ParityCase<PickKeyInput, String>) {
    let input = parity.input
    #expect(
      pickKeyId(
        input.arrangement, currentKeyId: input.currentKeyId, suggestedKeyId: input.suggestedKeyId)
        == parity.output)
  }

  @Test(
    arguments: Parity.cases("plans.synchronizeDraft", SynchronizeInput.self, [PlanItemDraft].self))
  func synchronize(_ parity: ParityCase<SynchronizeInput, [PlanItemDraft]>) {
    let input = parity.input
    #expect(input.drafts.map { synchronizeDraft($0, with: input.songOptions) } == parity.output)
  }
}

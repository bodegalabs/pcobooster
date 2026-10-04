import Foundation

// Port of apps/web/src/components/schedule/plan-tab-helpers.ts: the plan item editor's draft,
// length text, run sheet section lengths, and labels. Pinned by the `plans.buildDraft`,
// `plans.parseLengthText`, `plans.formatLength`, `plans.buildRunSheet`,
// `plans.servicePositionLabel`, `plans.itemTypeLabel`, `plans.pickKeyId`, and
// `plans.synchronizeDraft` parity suites.

/// The plan item editor's fields as the person edits them (`DraftState` on the web). Empty
/// strings mean no arrangement or key.
public struct PlanItemDraft: Codable, Hashable, Sendable {
  public var title: String
  /// "4:05" or "1:02:03".
  public var lengthText: String
  /// A `PlanItemServicePosition` raw value.
  public var servicePosition: String
  public var description: String
  public var arrangementId: String
  public var keyId: String

  public init(
    title: String, lengthText: String, servicePosition: String, description: String,
    arrangementId: String, keyId: String
  ) {
    self.title = title
    self.lengthText = lengthText
    self.servicePosition = servicePosition
    self.description = description
    self.arrangementId = arrangementId
    self.keyId = keyId
  }
}

/// The editor's starting draft for an item (`buildDraft`).
public func buildDraft(_ item: PlanItem) -> PlanItemDraft {
  let length = max(0, PlanLogic.floor(item.length ?? 0))
  let hours = PlanLogic.floor(length / 3600)
  let minutes = PlanLogic.floor(length.truncatingRemainder(dividingBy: 3600) / 60)
  let seconds = length.truncatingRemainder(dividingBy: 60)
  let lengthText =
    hours > 0
    ? "\(MusicText.numberString(hours)):\(PlanLogic.twoDigits(minutes)):\(PlanLogic.twoDigits(seconds))"
    : "\(MusicText.numberString(minutes)):\(PlanLogic.twoDigits(seconds))"
  let servicePosition = item.servicePosition.rawValue
  return PlanItemDraft(
    title: item.title,
    lengthText: lengthText,
    servicePosition: servicePosition.isEmpty ? "during" : servicePosition,
    description: item.description,
    arrangementId: item.arrangement?.id ?? "",
    keyId: item.key?.id ?? ""
  )
}

/// A length typed into the editor, in seconds, or why it can't be read.
public struct ParsedLengthText: Codable, Hashable, Sendable {
  /// Seconds; nil for an empty field or an error.
  public var length: Double?
  public var error: String?

  public init(length: Double?, error: String?) {
    self.length = length
    self.error = error
  }
}

private let lengthFormatError = "Length must be in mm:ss or h:mm:ss format."
private let lengthNumericError = "Length must be numeric values separated by ':'."

/// Reads "ss", "mm:ss", or "h:mm:ss" (`parseLengthText`). Each part is whole ASCII digits;
/// parts are not range checked, so "1:75" is 135 seconds.
public func parseLengthText(_ value: String) -> ParsedLengthText {
  let normalized = JSParity.trim(value)
  if normalized.isEmpty {
    return ParsedLengthText(length: nil, error: nil)
  }
  let parts = JSParity.split(normalized, separator: ":").map(JSParity.trim)
  if parts.contains(where: \.isEmpty) {
    return ParsedLengthText(length: nil, error: lengthFormatError)
  }
  var numbers: [Double] = []
  for part in parts {
    guard part.unicodeScalars.allSatisfy(MusicText.isDigit), let number = Double(part) else {
      return ParsedLengthText(length: nil, error: lengthNumericError)
    }
    numbers.append(number)
  }
  switch numbers.count {
  case 1:
    return ParsedLengthText(length: numbers[0], error: nil)
  case 2:
    return ParsedLengthText(length: numbers[0] * 60 + numbers[1], error: nil)
  case 3:
    return ParsedLengthText(length: numbers[0] * 3600 + numbers[1] * 60 + numbers[2], error: nil)
  default:
    return ParsedLengthText(length: nil, error: lengthFormatError)
  }
}

/// "45s" or "4:05" for a positive length in seconds; nil otherwise (`formatLength`).
public func formatLength(_ length: Double?) -> String? {
  guard let length, length > 0 else {
    return nil
  }
  let minutes = PlanLogic.floor(length / 60)
  let seconds = length.truncatingRemainder(dividingBy: 60)
  if minutes == 0 {
    return "\(MusicText.numberString(seconds))s"
  }
  return "\(MusicText.numberString(minutes)):\(PlanLogic.twoDigits(seconds))"
}

/// Where an item sits in the service's running order.
public struct RunSheetEntry: Codable, Hashable, Sendable {
  /// For headers, the total seconds of the items under them; nil for other items and for
  /// headers whose items have no length.
  public var sectionLength: Double?

  public init(sectionLength: Double?) {
    self.sectionLength = sectionLength
  }
}

/// Each header totals the lengths of the items until the next one (`buildRunSheet`), keyed
/// by item id.
public func buildRunSheet(_ items: [PlanItem]) -> [String: RunSheetEntry] {
  var entries: [String: RunSheetEntry] = [:]
  var sectionLengths: [String: Double] = [:]
  var currentHeaderId: String?
  for item in items {
    if item.itemType == .header {
      currentHeaderId = item.id
      sectionLengths[item.id] = 0
      continue
    }
    let length = item.length.map { $0.isFinite && $0 > 0 ? $0 : 0 } ?? 0
    entries[item.id] = RunSheetEntry(sectionLength: nil)
    if let currentHeaderId {
      sectionLengths[currentHeaderId, default: 0] += length
    }
  }
  for (headerId, sectionLength) in sectionLengths {
    entries[headerId] = RunSheetEntry(sectionLength: sectionLength > 0 ? sectionLength : nil)
  }
  return entries
}

/// "Song", "Header", or "Item"; other types show their raw name, as on the web
/// (`getItemTypeLabel`).
public func itemTypeLabel(_ item: PlanItem) -> String {
  switch item.itemType {
  case .song: "Song"
  case .header: "Header"
  case .item: "Item"
  case .media, .unknown: item.itemType.rawValue.isEmpty ? "Item" : item.itemType.rawValue
  }
}

/// "Pre-service", "During service", or "Post-service" for a service position's raw value;
/// other values show as they are, and nil as "Unassigned" (`getServicePositionLabel`).
public func servicePositionLabel(_ servicePosition: String?) -> String {
  switch servicePosition {
  case "pre": "Pre-service"
  case "during": "During service"
  case "post": "Post-service"
  default: servicePosition ?? "Unassigned"
  }
}

/// The key to select after choosing an arrangement: the current key when the arrangement has
/// it, else the suggested key, else the arrangement's first key, else "" (`pickKeyId`).
public func pickKeyId(
  _ arrangement: ArrangementOption, currentKeyId: String, suggestedKeyId: String?
) -> String {
  if arrangement.keys.contains(where: { $0.id == currentKeyId }) {
    return currentKeyId
  }
  let picked =
    arrangement.keys.first(where: { $0.id == suggestedKeyId })?.id ?? arrangement.keys.first?.id
  return picked ?? ""
}

/// Repairs a draft's arrangement and key against freshly loaded song options
/// (`synchronizeDraftWithSongOptions`): an arrangement that no longer exists clears both, a
/// key the arrangement lacks moves to the suggested or first key, and an explicitly empty
/// arrangement stays empty. Returns the draft unchanged when there is nothing to repair.
public func synchronizeDraft(_ draft: PlanItemDraft, with songOptions: SongOptionSet?)
  -> PlanItemDraft
{
  guard let songOptions else {
    return draft
  }
  var repaired = draft
  if songOptions.arrangements.isEmpty {
    repaired.arrangementId = ""
    repaired.keyId = ""
    return repaired
  }
  if draft.arrangementId.isEmpty {
    repaired.keyId = ""
    return repaired
  }
  guard
    let selected = songOptions.arrangements.first(where: { $0.id == draft.arrangementId })
  else {
    repaired.arrangementId = ""
    repaired.keyId = ""
    return repaired
  }
  repaired.keyId = pickKeyId(
    selected, currentKeyId: draft.keyId, suggestedKeyId: songOptions.suggestedKeyId)
  return repaired
}

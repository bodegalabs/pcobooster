import Foundation

// Port of apps/web/src/lib/ranking-reasons.ts. Pinned by the `scheduling.groupRankingReasons`
// and `scheduling.preferenceConflicts` parity suites in scripts/parity/scheduling.parity.ts,
// which replay every reasoning list the scoring suites produce, so the prefixes matched here
// stay in step with the copy `scoreAndNormalize` and `scoreSchedulingPreferences` write.

/// What a line of ranking reasoning is about, for its icon (`RankingFactKind`).
public enum RankingFactKind: String, Codable, Hashable, Sendable, CaseIterable {
  case history
  case fresh
  case service
  case rehearsal
  case load
  case preference
  case note
}

/// One fact about a candidate, with the ranking adjustments it caused (`RankingFact`).
public struct RankingFact: Codable, Hashable, Sendable {
  public var kind: RankingFactKind
  public var text: String
  /// "Ranked lower: ..." and penalty lines that follow the fact.
  public var adjustments: [String]

  public init(kind: RankingFactKind, text: String, adjustments: [String] = []) {
    self.kind = kind
    self.text = text
    self.adjustments = adjustments
  }
}

/// Groups ranking reasons into facts, attaching each adjustment ("Ranked lower: ...") to the
/// upcoming service, rehearsal, or preference it follows (`groupRankingReasons`). Recent-load
/// adjustments become their own `load` facts.
public func groupRankingReasons(_ reasons: [String]) -> [RankingFact] {
  var facts: [RankingFact] = []
  for reason in reasons {
    if JSString.hasSuffix(reason, RankingReasonText.loadSuffix) {
      facts.append(RankingFact(kind: .load, text: reason))
    } else if RankingReasonText.isAdjustment(reason), !facts.isEmpty {
      facts[facts.count - 1].adjustments.append(reason)
    } else {
      facts.append(RankingFact(kind: RankingReasonText.factKind(reason), text: reason))
    }
  }
  return facts
}

/// Scheduling preferences this plan goes against, as short phrases ("Prefers every other
/// week", "Marked Unavailable for this position") (`preferenceConflicts`). Preferences the
/// plan fits are left out.
public func preferenceConflicts(_ reasons: [String]) -> [String] {
  groupRankingReasons(reasons).compactMap { fact in
    guard fact.kind == .preference, !fact.adjustments.isEmpty else { return nil }
    var text = fact.text
    // `/^Prefers to serve /u` becomes "Prefers ", and `/ in Planning Center$/u` goes.
    if JSString.hasPrefix(text, "Prefers to serve ") {
      text = "Prefers " + JSString.suffix(text, from: "Prefers to serve ".utf16.count)
    }
    let suffix = " in Planning Center"
    if JSString.hasSuffix(text, suffix) {
      text = String(decoding: Array(text.utf16.dropLast(suffix.utf16.count)), as: UTF16.self)
    }
    return text
  }
}

/// The prefixes of the lines the scoring writes.
private enum RankingReasonText {
  /// Recent-load adjustments stand alone: no fact line comes before them.
  static let loadSuffix = "before this plan"

  private static let factPrefixes: [(prefixes: [String], kind: RankingFactKind)] = [
    (["Last served"], .history),
    (["No past services", "No service history"], .fresh),
    (["Upcoming:"], .service),
    (["Rehearsal upcoming:", "Rehearsals upcoming:"], .rehearsal),
    (["Prefers ", "At most ", "Marked Unavailable "], .preference),
  ]

  static func factKind(_ reason: String) -> RankingFactKind {
    factPrefixes.first { entry in
      entry.prefixes.contains { JSString.hasPrefix(reason, $0) }
    }?.kind ?? .note
  }

  /// `/^(?:Ranked (?:slightly )?lower|\w+ (?:rehearsal )?penalty):/u`, where `\w` is ASCII.
  static func isAdjustment(_ reason: String) -> Bool {
    if JSString.hasPrefix(reason, "Ranked lower:")
      || JSString.hasPrefix(reason, "Ranked slightly lower:")
    {
      return true
    }
    let units = Array(reason.utf16)
    let word = units.prefix(while: isWordCharacter)
    guard !word.isEmpty, units.count > word.count, units[word.count] == 0x20 else {
      return false
    }
    let rest = String(decoding: units[(word.count + 1)...], as: UTF16.self)
    return JSString.hasPrefix(rest, "penalty:") || JSString.hasPrefix(rest, "rehearsal penalty:")
  }

  private static func isWordCharacter(_ unit: UInt16) -> Bool {
    switch unit {
    case 0x30...0x39, 0x41...0x5A, 0x61...0x7A, 0x5F: true
    default: false
    }
  }
}

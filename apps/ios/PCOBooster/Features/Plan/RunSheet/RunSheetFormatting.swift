import Foundation
import PCOBoosterCore

/// Small labels the run sheet shares between rows, previews, and the item details.
enum RunSheetFormatting {
  /// The item's title, or "Untitled item".
  static func title(_ item: PlanItem) -> String {
    item.title.isEmpty ? "Untitled item" : item.title
  }

  /// "4:05" for a length chip, nil when the item has none (the web's `formatDuration`).
  static func lengthLabel(_ length: Double?) -> String? {
    guard let length, length > 0 else { return nil }
    return formatDuration(seconds: length)
  }

  /// "before" or "after" for items off the service clock; nil for items during it.
  static func offClockCaption(_ position: PlanItemServicePosition) -> String? {
    switch position {
    case .pre: String(localized: "before")
    case .post: String(localized: "after")
    case .during, .unknown: nil
    }
  }

  /// "3d ago" or "2w ago" for a song sung 1 to 28 days before the plan (`RecentPlayHint`).
  static func recentPlayLabel(days: Int) -> String {
    days < 7
      ? String(localized: "\(days)d ago")
      : String(localized: "\(Int((Double(days) / 7).rounded()))w ago")
  }

  /// "3w" before the plan, "later" when it's already planned after it, or "" for a song that
  /// was never scheduled (`whenLabel` in `add-song-palette.tsx`).
  static func whenLabel(_ lastScheduledAt: Date?, planDate: Date) -> String {
    guard let lastScheduledAt else { return "" }
    return lastScheduledAt > planDate
      ? String(localized: "later") : formatCompactAgo(lastScheduledAt, reference: planDate)
  }

  /// The key a song row shows: its starting key ("G" or "G to A" as two keys), the key's name
  /// when it has no starting key, or nil for a song with no key.
  enum KeyDisplay: Equatable {
    case none
    case key(String)
    case change(from: String, to: String)
    case named(String)
  }

  static func keyDisplay(_ key: PlanItemKey?) -> KeyDisplay {
    guard let key else { return .none }
    guard let start = key.startingKey, !start.isEmpty else {
      return key.name.isEmpty ? .none : .named(key.name)
    }
    if let end = key.endingKey, !end.isEmpty, end != start {
      return .change(from: start, to: end)
    }
    return .key(start)
  }

  /// "Default Arrangement · 74 bpm · 4/4": the song's arrangement and tempo facts.
  static func songFacts(_ item: PlanItem, options: SongOptionSet?) -> String? {
    let parts = [arrangementName(item), tempo(item, options: options)].compactMap(\.self)
    return parts.isEmpty ? nil : parts.joined(separator: " \u{B7} ")
  }

  /// The song's arrangement name, or nil when it has none.
  static func arrangementName(_ item: PlanItem) -> String? {
    guard let name = item.arrangement?.name, !name.isEmpty else { return nil }
    return name
  }

  /// "74 bpm · 4/4" from the arrangement's cached options, or nil before they load.
  static func tempo(_ item: PlanItem, options: SongOptionSet?) -> String? {
    let arrangement = options?.arrangements.first { $0.id == item.arrangement?.id }
    let tempo = tempoLabel(arrangement)
    return tempo.isEmpty ? nil : tempo
  }
}

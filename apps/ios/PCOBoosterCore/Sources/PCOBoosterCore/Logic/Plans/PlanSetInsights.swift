import Foundation

// Port of apps/web/src/lib/plan-set-insights.ts: key changes between consecutive songs and
// recent repeats. `formatPlayedAgo` from the same file lives in Logic/Text. Pinned by the
// `plans.keyTransitions`, `plans.daysSinceRecentPlay`, and `plans.buildPlanInsights` parity
// suites.

/// Songs played within this many days before the plan count as a repeat (`RECENT_REPEAT_DAYS`).
public let recentRepeatDays = 28

/// A timed item at least this many seconds long between two songs gives the band room to
/// change key (`BRIDGING_ITEM_SECONDS`).
public let bridgingItemSeconds = 60

/// The key change from one song into the next within a section.
public struct KeyTransition: Codable, Hashable, Sendable {
  public var fromItemId: String
  public var toItemId: String
  /// The previous song's ending key, spelled from its scale ("Eb").
  public var from: String
  /// This song's starting key ("Bb").
  public var to: String
  public var fromKey: SpelledKey
  public var toKey: SpelledKey
  /// The previous song's title, or "the last song".
  public var fromTitle: String
  /// This song's title, or "the next song".
  public var toTitle: String
  /// Smooth whenever a bridging item covers the change.
  public var level: KeyTransitionLevel
  public var kind: KeyChangeKind
  /// The rating's reason, such as "Closely related key".
  public var description: String
  /// The title of a timed item between the songs that covers the change (or "an item"), so
  /// it isn't flagged.
  public var bridgedBy: String?

  public init(
    fromItemId: String, toItemId: String, from: String, to: String, fromKey: SpelledKey,
    toKey: SpelledKey, fromTitle: String, toTitle: String, level: KeyTransitionLevel,
    kind: KeyChangeKind, description: String, bridgedBy: String?
  ) {
    self.fromItemId = fromItemId
    self.toItemId = toItemId
    self.from = from
    self.to = to
    self.fromKey = fromKey
    self.toKey = toKey
    self.fromTitle = fromTitle
    self.toTitle = toTitle
    self.level = level
    self.kind = kind
    self.description = description
    self.bridgedBy = bridgedBy
  }

  /// The songs and keys `transitionSuggestions(_:kind:)` and `rankAlternateKeys` take.
  public var songs: TransitionSongs {
    TransitionSongs(fromTitle: fromTitle, toTitle: toTitle, fromKey: fromKey, toKey: toKey)
  }
}

/// The key a song ends in: its ending key, or its starting key when it doesn't modulate.
private func songEndKey(_ item: PlanItem) -> SpelledKey? {
  KeyTheory.parse(item.key?.endingKey) ?? KeyTheory.parse(item.key?.startingKey)
}

/// Key changes between songs that follow each other within a section (`keyTransitions`). A
/// header starts a new section, so a sermon or break between sets never counts, and a timed
/// item of a minute or more between two songs covers the change. Songs without a readable key
/// are skipped.
public func keyTransitions(_ items: [PlanItem]) -> [KeyTransition] {
  var transitions: [KeyTransition] = []
  var previousSong: PlanItem?
  var bridge: PlanItem?
  for item in items {
    if item.itemType == .header {
      previousSong = nil
      bridge = nil
      continue
    }
    if item.itemType != .song {
      if (item.length ?? 0) >= Double(bridgingItemSeconds) {
        bridge = item
      }
      continue
    }
    if let previous = previousSong, let fromKey = songEndKey(previous),
      let toKey = KeyTheory.parse(item.key?.startingKey)
    {
      let rating = rateKeyChange(from: fromKey, to: toKey)
      transitions.append(
        KeyTransition(
          fromItemId: previous.id,
          toItemId: item.id,
          from: KeyTheory.name(fromKey),
          to: KeyTheory.name(toKey),
          fromKey: fromKey,
          toKey: toKey,
          fromTitle: previous.title.isEmpty ? "the last song" : previous.title,
          toTitle: item.title.isEmpty ? "the next song" : item.title,
          level: bridge == nil ? rating.level : .smooth,
          kind: rating.kind,
          description: rating.reason,
          bridgedBy: bridge.map { $0.title.isEmpty ? "an item" : $0.title }
        ))
    }
    previousSong = item
    bridge = nil
  }
  return transitions
}

private let dayMilliseconds: Double = 86_400_000

/// Whole 24-hour periods between a song's last play and this plan, when that was 1 to 28 days
/// before it (`daysSinceRecentPlay`). Plays on or after the plan's date (this plan, or later
/// ones) don't count. Like the web, this counts elapsed time rather than organization
/// calendar days.
public func daysSinceRecentPlay(_ item: PlanItem, planDate: Date?) -> Int? {
  guard let planDate, let lastScheduledAt = item.song?.lastScheduledAt else {
    return nil
  }
  let elapsed = Double(JSParity.time(planDate) - JSParity.time(lastScheduledAt))
  let days = PlanLogic.floor(elapsed / dayMilliseconds)
  guard days >= 1, days <= Double(recentRepeatDays) else {
    return nil
  }
  return Int(days)
}

/// Key changes and recent repeats across a plan's items.
public struct PlanInsights: Hashable, Sendable {
  /// The key change into each song, by the song's item id.
  public var transitions: [String: KeyTransition]
  /// Days since each recently repeated song was last played, by item id.
  public var recentPlays: [String: Int]

  public init(transitions: [String: KeyTransition], recentPlays: [String: Int]) {
    self.transitions = transitions
    self.recentPlays = recentPlays
  }
}

/// Indexes a plan's key changes and recent repeats by item id (`buildPlanInsights`).
public func buildPlanInsights(_ items: [PlanItem], planDate: Date?) -> PlanInsights {
  var transitions: [String: KeyTransition] = [:]
  for transition in keyTransitions(items) {
    transitions[transition.toItemId] = transition
  }
  var recentPlays: [String: Int] = [:]
  for item in items {
    if let days = daysSinceRecentPlay(item, planDate: planDate) {
      recentPlays[item.id] = days
    }
  }
  return PlanInsights(transitions: transitions, recentPlays: recentPlays)
}

import Foundation

// Port of the plan-item and history parts of apps/web/src/lib/song-library.ts: the song a new
// song would follow, a song's history from a plan's point of view, and the facts the add-song
// palette shows. The primitive parts (`describeKeyChange`, `tempoLabel(bpm:meter:)`,
// `formatCompactAgo`) live in Logic/Music and Logic/Text. Pinned by the
// `songs.previousSongBefore`, `songs.summarizeSongHistory`, `songs.songHistoryCountLabel`,
// `songs.tempoLabel`, and `songs.songPreviewFacts` parity suites.
//
// These are facts about a song, never suggestions.

/// The song a new song would follow, and the key it ends in.
public struct PreviousSong: Codable, Hashable, Sendable {
  /// The song's title, or "the last song".
  public var title: String
  /// The ending key spelled from its scale ("F#m").
  public var endKey: String

  public init(title: String, endKey: String) {
    self.title = title
    self.endKey = endKey
  }
}

/// The song right before the insertion point in the same section (`previousSongBefore`). A
/// header starts a new section, so nothing before it counts, and the closest song decides: nil
/// when it has no readable key. `insertAfterId` nil inserts at the end of the plan; an id that
/// isn't in the plan finds nothing.
public func previousSong(before items: [PlanItem], insertAfterId: String?) -> PreviousSong? {
  let insertIndex: Int
  if let insertAfterId {
    guard let index = items.firstIndex(where: { $0.id == insertAfterId }) else {
      return nil
    }
    insertIndex = index
  } else {
    insertIndex = items.count - 1
  }
  guard insertIndex >= 0 else {
    return nil
  }
  for item in items[...insertIndex].reversed() {
    if item.itemType == .header {
      return nil
    }
    if item.itemType != .song {
      continue
    }
    guard
      let endKey = KeyTheory.parse(item.key?.endingKey) ?? KeyTheory.parse(item.key?.startingKey)
    else {
      return nil
    }
    return PreviousSong(
      title: item.title.isEmpty ? "the last song" : item.title, endKey: KeyTheory.name(endKey))
  }
  return nil
}

/// What a song's history adds up to from one plan's point of view.
public struct SongHistorySummary: Codable, Hashable, Sendable {
  /// The latest time it was sung before the plan, at any service.
  public var last: SongHistoryEntry?
  /// The soonest plan after this one that already has it.
  public var next: SongHistoryEntry?
  /// Plans before this one in the history (the API returns the past year).
  public var timesThisYear: Int
  /// Of those, the plans at this plan's service type.
  public var timesHere: Int
  /// Keys it has been sung in, most recent first.
  public var keys: [String]

  public init(
    last: SongHistoryEntry?, next: SongHistoryEntry?, timesThisYear: Int, timesHere: Int,
    keys: [String]
  ) {
    self.last = last
    self.next = next
    self.timesThisYear = timesThisYear
    self.timesHere = timesHere
    self.keys = keys
  }
}

/// Counts a song's history from the plan's service date, newest-first history in
/// (`summarizeSongHistory`): what came before it and what is planned after it, for one service
/// type. Entries at the plan's exact date (the plan itself) are neither. A nil
/// `serviceTypeId` matches entries without one.
public func summarizeSongHistory(
  _ history: [SongHistoryEntry], planDate: Date, serviceTypeId: String?
) -> SongHistorySummary {
  let planTime = JSParity.time(planDate)
  let past = history.filter { JSParity.time($0.sortDate) < planTime }
  let upcoming = history.filter { JSParity.time($0.sortDate) > planTime }
  return SongHistorySummary(
    last: past.first,
    next: upcoming.last,
    timesThisYear: past.count,
    timesHere: past.count(where: { $0.serviceTypeId == serviceTypeId }),
    keys: PlanLogic.orderedUnique(history.compactMap(\.startingKey))
  )
}

/// "Sung 4 times in the past year · 2 at Youth": how often the song came before the plan,
/// and how many of those were at the plan's service type, by name when known
/// (`songHistoryCountLabel`).
public func songHistoryCountLabel(
  timesThisYear: Int, timesHere: Int, serviceTypeName: String?
) -> String {
  if timesThisYear == 0 {
    return "Not sung in the past year"
  }
  let times = timesThisYear == 1 ? "once" : "\(timesThisYear) times"
  let sung = "Sung \(times) in the past year"
  guard let serviceTypeName, !serviceTypeName.isEmpty else {
    return sung
  }
  return "\(sung) \u{B7} \(timesHere) at \(serviceTypeName)"
}

/// "Sung 4 times in the past year · 2 at Youth" for a history summary.
public func songHistoryCountLabel(
  _ summary: SongHistorySummary, serviceTypeName: String?
) -> String {
  songHistoryCountLabel(
    timesThisYear: summary.timesThisYear, timesHere: summary.timesHere,
    serviceTypeName: serviceTypeName)
}

/// "78 bpm · 6/8" for an arrangement, or "" when it sets neither (`tempoLabel`).
public func tempoLabel(_ arrangement: ArrangementOption?) -> String {
  tempoLabel(bpm: arrangement?.bpm, meter: arrangement?.meter)
}

/// How a song's latest key sits against the previous song's ending.
public struct SongKeyChange: Codable, Hashable, Sendable {
  /// The song's latest key.
  public var key: String
  /// "up a whole step", "relative minor", and so on (`describeKeyChange`).
  public var change: String

  public init(key: String, change: String) {
    self.key = key
    self.change = change
  }
}

/// What to show about a song being considered for a plan.
public struct SongPreviewFacts: Codable, Hashable, Sendable {
  /// Nil until the song's history loads.
  public var summary: SongHistorySummary?
  /// Keys it was sung in, else its active arrangements' starting keys.
  public var keys: [String]
  /// Distinct tempo labels of its active arrangements.
  public var tempos: [String]
  /// How its latest key sits against the previous song's ending.
  public var keyChange: SongKeyChange?

  public init(
    summary: SongHistorySummary?, keys: [String], tempos: [String], keyChange: SongKeyChange?
  ) {
    self.summary = summary
    self.keys = keys
    self.tempos = tempos
    self.keyChange = keyChange
  }
}

/// The facts the add-song palette shows for a song, from its history (nil while loading) and
/// arrangements; archived arrangements don't count (`songPreviewFacts`).
public func songPreviewFacts(
  history: [SongHistoryEntry]?, arrangements: [ArrangementOption], serviceTypeId: String?,
  previousSong: PreviousSong?, planDate: Date
) -> SongPreviewFacts {
  let active = arrangements.filter { !$0.archived }
  let summary = history.map {
    summarizeSongHistory($0, planDate: planDate, serviceTypeId: serviceTypeId)
  }
  let arrangementKeys = active.flatMap { $0.keys.compactMap(\.startingKey) }
  let keys =
    if let summary, !summary.keys.isEmpty {
      summary.keys
    } else {
      PlanLogic.orderedUnique(arrangementKeys)
    }
  let latestKey = keys.first
  var keyChange: SongKeyChange?
  if let previousSong, let latestKey,
    let change = describeKeyChange(from: previousSong.endKey, to: latestKey)
  {
    keyChange = SongKeyChange(key: latestKey, change: change)
  }
  return SongPreviewFacts(
    summary: summary,
    keys: keys,
    tempos: PlanLogic.orderedUnique(active.map { tempoLabel($0) }.filter { !$0.isEmpty }),
    keyChange: keyChange
  )
}

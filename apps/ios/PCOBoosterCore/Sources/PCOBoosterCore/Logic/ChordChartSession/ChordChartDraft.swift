// Port of the values in apps/web/src/lib/chord-chart-draft.ts. Pinned by the
// `chordsession.*` parity suites. The stores that keep them live in ChordChartDraftStore.swift.

import Foundation

/// What the chord chart editor changes; saving writes it to the arrangement
/// (`ChordChartDraft`).
///
/// Drafts compare like the web's `isSameDraft`: text by exact code points (JavaScript's `===`),
/// so a chart rewritten in another Unicode normalization still counts as an edit to send.
public struct ChordChartDraft: Hashable, Codable, Sendable {
  public var chart: String
  /// The key the chords are written in.
  public var key: String?
  public var layout: ChordChartLayout

  public init(chart: String, key: String?, layout: ChordChartLayout) {
    self.chart = chart
    self.key = key
    self.layout = layout
  }

  /// The arrangement's chart, key, and print settings.
  public init(arrangement: ChordChartArrangement) {
    self.init(
      chart: arrangement.chordChart, key: arrangement.chordChartKey, layout: arrangement.layout)
  }

  public static func == (left: Self, right: Self) -> Bool {
    ExactText.equal(left.chart, right.chart) && ExactText.equal(left.key, right.key)
      && ChordChartLayoutField.same(left.layout, right.layout)
  }

  public func hash(into hasher: inout Hasher) {
    // String hashing follows canonical equivalence, which exact equality implies.
    hasher.combine(chart)
    hasher.combine(key)
    ChordChartLayoutField.hash(layout, into: &hasher)
  }

  private enum CodingKeys: String, CodingKey {
    case chart
    case key
    case layout
  }

  /// Every key must be present, as the web's schema requires; `key` may be null.
  public init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    chart = try container.decode(String.self, forKey: .chart)
    key = try container.decode(String?.self, forKey: .key)
    let layoutFields = try container.nestedContainer(
      keyedBy: ChordChartLayoutField.self, forKey: .layout)
    guard ChordChartLayoutField.allCases.allSatisfy(layoutFields.contains) else {
      throw DecodingError.dataCorruptedError(
        forKey: .layout, in: container, debugDescription: "A print setting is missing")
    }
    layout = try container.decode(ChordChartLayout.self, forKey: .layout)
  }

  public func encode(to encoder: any Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(chart, forKey: .chart)
    try container.encode(key, forKey: .key)
    try container.encode(layout, forKey: .layout)
  }
}

/// Whether two drafts hold the same chart, key, and print settings (`isSameDraft`).
public func isSameDraft(_ left: ChordChartDraft, _ right: ChordChartDraft) -> Bool {
  left == right
}

/// What the app keeps of one arrangement's editing between visits
/// (`StoredChordChartSession`). Encodes as the web's JSON, with `savedAt` in whole epoch
/// milliseconds.
public struct StoredChordChartSession: Hashable, Codable, Sendable {
  /// A draft left alone this long is dropped rather than resurfacing over newer work
  /// (`CHORD_CHART_DRAFT_LIFETIME_MS`, 14 days).
  public static let lifetimeMilliseconds = 14 * 24 * 60 * 60 * 1000
  public static let lifetime = Duration.milliseconds(lifetimeMilliseconds)

  /// When the app last wrote it.
  public var savedAt: Date
  /// The Planning Center version (`updated_at`) the edits build on.
  public var baseUpdatedAt: String?
  /// Edits not yet saved to Planning Center, or nil when everything is saved.
  public var draft: ChordChartDraft?
  /// The chart as it was when editing began, so Revert all changes survives a relaunch.
  public var opening: ChordChartDraft

  public init(
    savedAt: Date, baseUpdatedAt: String?, draft: ChordChartDraft?, opening: ChordChartDraft
  ) {
    self.savedAt = savedAt
    self.baseUpdatedAt = baseUpdatedAt
    self.draft = draft
    self.opening = opening
  }

  /// Whether it has been left alone past its lifetime at `now`.
  public func isExpired(at now: Date) -> Bool {
    JSParity.time(now) - JSParity.time(savedAt) > Self.lifetimeMilliseconds
  }

  /// A stored session from its JSON, or nil when it is unreadable or past its lifetime
  /// (`parseStoredChordChartSession`).
  public static func parse(_ data: Data, now: Date) -> Self? {
    guard let session = try? JSONDecoder().decode(Self.self, from: data),
      !session.isExpired(at: now)
    else {
      return nil
    }
    return session
  }

  /// The JSON `parse` reads.
  public func encoded() throws -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    return try encoder.encode(self)
  }

  public static func == (left: Self, right: Self) -> Bool {
    JSParity.time(left.savedAt) == JSParity.time(right.savedAt)
      && ExactText.equal(left.baseUpdatedAt, right.baseUpdatedAt) && left.draft == right.draft
      && left.opening == right.opening
  }

  public func hash(into hasher: inout Hasher) {
    hasher.combine(JSParity.time(savedAt))
    hasher.combine(baseUpdatedAt)
    hasher.combine(draft)
    hasher.combine(opening)
  }

  private enum CodingKeys: String, CodingKey {
    case savedAt
    case baseUpdatedAt
    case draft
    case opening
  }

  /// Every key must be present, as the web's schema requires; `baseUpdatedAt` and `draft` may
  /// be null.
  public init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let milliseconds = try container.decode(Double.self, forKey: .savedAt)
    guard milliseconds.isFinite else {
      throw DecodingError.dataCorruptedError(
        forKey: .savedAt, in: container, debugDescription: "savedAt is not a time")
    }
    savedAt = Date(timeIntervalSince1970: milliseconds / 1000)
    baseUpdatedAt = try container.decode(String?.self, forKey: .baseUpdatedAt)
    draft = try container.decode(ChordChartDraft?.self, forKey: .draft)
    opening = try container.decode(ChordChartDraft.self, forKey: .opening)
  }

  public func encode(to encoder: any Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(JSParity.time(savedAt), forKey: .savedAt)
    try container.encode(baseUpdatedAt, forKey: .baseUpdatedAt)
    try container.encode(draft, forKey: .draft)
    try container.encode(opening, forKey: .opening)
  }
}

/// `chordChartLayoutSchema`'s fields, in the order `changedLayout` checks them, and the web's
/// layout comparison (`JSON.stringify` of both layouts). Layouts from the API and from storage
/// always list their fields in the schema's order, so key order, which Swift values lack, never
/// decides it; every field must match exactly.
enum ChordChartLayoutField: String, CaseIterable, CodingKey {
  case font
  case fontSize
  case columns
  case chordColor
  case pageSize
  case orientation
  case margin

  func isSame(_ left: ChordChartLayout, _ right: ChordChartLayout) -> Bool {
    switch self {
    case .font: ExactText.equal(left.font, right.font)
    case .fontSize: left.fontSize == right.fontSize
    case .columns: left.columns == right.columns
    case .chordColor: left.chordColor == right.chordColor
    case .pageSize: ExactText.equal(left.pageSize, right.pageSize)
    case .orientation: ExactText.equal(left.orientation, right.orientation)
    case .margin: ExactText.equal(left.margin, right.margin)
    }
  }

  static func same(_ left: ChordChartLayout, _ right: ChordChartLayout) -> Bool {
    allCases.allSatisfy { $0.isSame(left, right) }
  }

  /// Hashes what `same` compares, enums by raw value, so `hash(into:)` agrees with `==`.
  static func hash(_ layout: ChordChartLayout, into hasher: inout Hasher) {
    hasher.combine(layout.font)
    hasher.combine(layout.fontSize)
    hasher.combine(layout.columns)
    hasher.combine(layout.chordColor)
    hasher.combine(layout.pageSize?.rawValue)
    hasher.combine(layout.orientation?.rawValue)
    hasher.combine(layout.margin?.rawValue)
  }
}

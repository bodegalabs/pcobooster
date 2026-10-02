// Port of `ChordChartVersion`, `versionOf`, `ChordChartConflict`, and `isNewerVersion` from
// apps/web/src/lib/chord-chart-session.ts. Pinned by the `chordsession.*` parity suites.

/// A chart as Planning Center holds it at one version (`ChordChartVersion`).
public struct ChordChartVersion: Hashable, Codable, Sendable {
  public var draft: ChordChartDraft
  /// Planning Center's `updated_at` for this version; nil when it reports none.
  public var updatedAt: String?

  public init(draft: ChordChartDraft, updatedAt: String?) {
    self.draft = draft
    self.updatedAt = updatedAt
  }

  /// The arrangement as the API returned it (`versionOf`).
  public init(arrangement: ChordChartArrangement) {
    self.init(draft: ChordChartDraft(arrangement: arrangement), updatedAt: arrangement.updatedAt)
  }

  private enum CodingKeys: String, CodingKey {
    case draft
    case updatedAt
  }

  public func encode(to encoder: any Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(draft, forKey: .draft)
    try container.encode(updatedAt, forKey: .updatedAt)
  }
}

/// Someone saved a newer version in Planning Center while this editor had unsaved edits
/// (`ChordChartConflict`).
public struct ChordChartConflict: Hashable, Codable, Sendable {
  /// Their version; nil until Planning Center answers with it.
  public var theirs: ChordChartVersion?

  public init(theirs: ChordChartVersion?) {
    self.theirs = theirs
  }

  private enum CodingKeys: String, CodingKey {
    case theirs
  }

  public func encode(to encoder: any Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(theirs, forKey: .theirs)
  }
}

/// Whether `candidate` is a later Planning Center version than `known` (`isNewerVersion`).
/// Timestamps compare as times; when either is not an ISO 8601 timestamp, any difference in
/// the text counts as newer.
public func isNewerVersion(_ candidate: String?, than known: String?) -> Bool {
  guard let candidate else {
    return false
  }
  guard let known else {
    return true
  }
  guard let candidateTime = ECMAScriptTimestamp.parse(candidate),
    let knownTime = ECMAScriptTimestamp.parse(known)
  else {
    return !ExactText.equal(candidate, known)
  }
  return candidateTime > knownTime
}

/// `Date.parse` for the ECMAScript date time string format, which is what Planning Center's
/// `updated_at` uses: `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` (a year may also be `+YYYYYY` or
/// `-YYYYYY`), then optionally `THH:mm`, `:ss`, and a fraction of any length (milliseconds are
/// its first three digits), then `Z` or an offset `+HH:mm`. V8 also accepts a lowercase `t` or
/// `z`, a space before the time, and an offset without its colon, so these do too. Like V8,
/// a day up to 31 rolls into the next month, `24:00` is the end of the day, a date without a
/// time is UTC, and a result beyond 100,000,000 days from 1970 is invalid.
///
/// A date with a time but no offset is local time to JavaScript, and UTC here (Vitest and
/// Workers run in UTC). V8 reads many other formats through a legacy parser; those return nil
/// here, which `isNewerVersion` handles as text.
enum ECMAScriptTimestamp {
  /// Milliseconds since 1970, or nil when JavaScript would give NaN (or for a format only
  /// V8's legacy parser reads).
  static func parse(_ text: String) -> Int? {
    var scanner = Scanner(Array(text.utf8))
    guard let time = scanner.timestamp(), scanner.isAtEnd,
      abs(time) <= JSParity.maxTime
    else {
      return nil
    }
    return time
  }

  private struct Scanner {
    let bytes: [UInt8]
    var index = 0

    init(_ bytes: [UInt8]) {
      self.bytes = bytes
    }

    var isAtEnd: Bool { index == bytes.count }

    private var current: UInt8? { index < bytes.count ? bytes[index] : nil }

    private mutating func take(_ byte: UInt8) -> Bool {
      guard current == byte else {
        return false
      }
      index += 1
      return true
    }

    private mutating func take(anyOf choices: Set<UInt8>) -> UInt8? {
      guard let byte = current, choices.contains(byte) else {
        return nil
      }
      index += 1
      return byte
    }

    private mutating func digits(_ count: Int) -> Int? {
      guard index + count <= bytes.count else {
        return nil
      }
      var value = 0
      for byte in bytes[index..<index + count] {
        guard (UInt8(ascii: "0")...UInt8(ascii: "9")).contains(byte) else {
          return nil
        }
        value = value * 10 + Int(byte - UInt8(ascii: "0"))
      }
      index += count
      return value
    }

    mutating func timestamp() -> Int? {
      guard let year = year() else {
        return nil
      }
      var month = 1
      var day = 1
      if take(UInt8(ascii: "-")) {
        guard let parsed = digits(2), (1...12).contains(parsed) else {
          return nil
        }
        month = parsed
        if take(UInt8(ascii: "-")) {
          guard let parsed = digits(2), (1...31).contains(parsed) else {
            return nil
          }
          day = parsed
        }
      }
      let days = OrgCalendar.daysFromCivil(year: year, month: month, day: 1) + day - 1
      let date = days * OrgCalendar.millisecondsPerDay
      if isAtEnd {
        return date
      }
      guard take(anyOf: [UInt8(ascii: "T"), UInt8(ascii: "t"), UInt8(ascii: " ")]) != nil,
        let time = timeOfDay()
      else {
        return nil
      }
      guard let offset = offset() else {
        return nil
      }
      return date + time - offset
    }

    /// `YYYY`, or `+YYYYYY` / `-YYYYYY` (but not `-000000`).
    private mutating func year() -> Int? {
      if let sign = take(anyOf: [UInt8(ascii: "+"), UInt8(ascii: "-")]) {
        guard let value = digits(6) else {
          return nil
        }
        if sign == UInt8(ascii: "-") {
          return value == 0 ? nil : -value
        }
        return value
      }
      return digits(4)
    }

    /// `HH:mm`, then optionally `:ss` and a fraction, in milliseconds.
    private mutating func timeOfDay() -> Int? {
      guard let hour = digits(2), take(UInt8(ascii: ":")), let minute = digits(2) else {
        return nil
      }
      var second = 0
      var millisecond = 0
      if take(UInt8(ascii: ":")) {
        guard let parsed = digits(2) else {
          return nil
        }
        second = parsed
        if take(UInt8(ascii: ".")) {
          guard let parsed = fraction() else {
            return nil
          }
          millisecond = parsed
        }
      }
      guard hour <= 24, minute <= 59, second <= 59,
        hour < 24 || (minute == 0 && second == 0 && millisecond == 0)
      else {
        return nil
      }
      return ((hour * 60 + minute) * 60 + second) * 1000 + millisecond
    }

    /// One or more digits; the first three are milliseconds, the rest are ignored.
    private mutating func fraction() -> Int? {
      var millisecond = 0
      var count = 0
      while let byte = current, (UInt8(ascii: "0")...UInt8(ascii: "9")).contains(byte) {
        if count < 3 {
          millisecond = millisecond * 10 + Int(byte - UInt8(ascii: "0"))
        }
        count += 1
        index += 1
      }
      guard count > 0 else {
        return nil
      }
      for _ in count..<max(count, 3) {
        millisecond *= 10
      }
      return millisecond
    }

    /// The offset east of UTC in milliseconds: none (UTC), `Z`, `+HH:mm`, or `+HHmm`.
    private mutating func offset() -> Int? {
      if isAtEnd || take(anyOf: [UInt8(ascii: "Z"), UInt8(ascii: "z")]) != nil {
        return 0
      }
      guard let sign = take(anyOf: [UInt8(ascii: "+"), UInt8(ascii: "-")]),
        let hours = digits(2)
      else {
        return nil
      }
      _ = take(UInt8(ascii: ":"))
      guard let minutes = digits(2), hours <= 23, minutes <= 59 else {
        return nil
      }
      let offset = (hours * 60 + minutes) * OrgCalendar.millisecondsPerMinute
      return sign == UInt8(ascii: "-") ? -offset : offset
    }
  }
}

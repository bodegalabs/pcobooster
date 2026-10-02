import Foundation

// JavaScript semantics the scheduling ports order and match by: `localeCompare`, the stable
// `Array.prototype.sort`, `===` on strings, and `new Date(text)` for ISO 8601 text. Pinned by
// the `scheduling.localeCompare` parity suite and, through the ports, every other
// `scheduling.*` suite in scripts/parity/scheduling.parity.ts.

/// `String.prototype.localeCompare` with no locale or options, as Node's ICU writes it
/// (en-US, which uses the CLDR root collation at tertiary strength).
///
/// Foundation's locale-aware comparison is ICU underneath but differs in three ways, each
/// corrected here: it counts characters ICU ignores entirely (controls, zero-width and other
/// format characters), and it treats compatibility variants (full-width letters, ligatures,
/// superscripts, other spaces) and kana forms as equal where ICU still orders them, which
/// `.forcedOrdering` restores. One known difference remains: a titlecase digraph letter such
/// as U+01C8 can order the other way round against its all-capital spelling ("LJ").
enum JSCollator {
  private static let locale = Locale(identifier: "en_US")

  /// Negative when `a` sorts first, positive when `b` does, 0 when ICU calls them equal.
  static func compare(_ a: String, _ b: String) -> Int {
    let left = removingIgnorables(a)
    let right = removingIgnorables(b)
    // Swift's `==` is canonical equivalence, which ICU also treats as equal.
    if left == right {
      return 0
    }
    let plain = left.compare(right, options: [], range: nil, locale: locale)
    if plain != .orderedSame {
      return plain == .orderedAscending ? -1 : 1
    }
    let forced = left.compare(right, options: [.forcedOrdering], range: nil, locale: locale)
    switch forced {
    case .orderedAscending: return -1
    case .orderedDescending: return 1
    case .orderedSame: return 0
    }
  }

  /// Code points ICU's root collation ignores completely (enumerated from Node 26, ICU 78):
  /// most C0 and C1 controls, format characters such as zero-width spaces, joiners, bidi
  /// marks and the byte order mark, variation selectors, tags, and some combining marks.
  private static let ignorableRanges: [ClosedRange<UInt32>] = [
    0x0...0x8, 0xE...0x1F, 0x7F...0x84, 0x86...0x9F, 0xAD...0xAD, 0x34F...0x34F,
    0x488...0x489, 0x591...0x5AF, 0x5BD...0x5BD, 0x5C4...0x5C5, 0x600...0x605,
    0x610...0x61A, 0x61C...0x61C, 0x640...0x640, 0x6D6...0x6DD, 0x6DF...0x6E4,
    0x6E7...0x6E8, 0x6EA...0x6ED, 0x70F...0x70F, 0x740...0x740, 0x743...0x744,
    0x747...0x74A, 0x7FA...0x7FA, 0x890...0x891, 0x898...0x89D, 0x8CA...0x8E2,
    0x8EA...0x8EF, 0x8F3...0x8F3, 0x951...0x952, 0xF18...0xF19, 0xF35...0xF35,
    0xF37...0xF37, 0xF3E...0xF3F, 0xF86...0xF87, 0xFC6...0xFC6, 0x17B4...0x17B5,
    0x17D3...0x17D3, 0x180A...0x180F, 0x1A7F...0x1A7F, 0x1B6B...0x1B73, 0x1CD0...0x1CE8,
    0x1CF4...0x1CF4, 0x1CF7...0x1CF9, 0x200B...0x200F, 0x202A...0x202E, 0x2060...0x2064,
    0x2066...0x206F, 0x2D7F...0x2D7F, 0xA670...0xA672, 0xA8E0...0xA8F1, 0xFE00...0xFE0F,
    0xFE21...0xFE21, 0xFE23...0xFE26, 0xFE28...0xFE28, 0xFE2A...0xFE2D, 0xFE2F...0xFE2F,
    0xFE73...0xFE73, 0xFEFF...0xFEFF, 0xFFF9...0xFFFB, 0x102E0...0x102E0,
    0x10EFB...0x10EFB, 0x10EFD...0x10EFF, 0x110BD...0x110BD, 0x110CD...0x110CD,
    0x11366...0x1136C, 0x11370...0x11374, 0x113E1...0x113E2, 0x13430...0x13440,
    0x13447...0x13455, 0x16FE4...0x16FE4, 0x1BCA0...0x1BCA3, 0x1CF00...0x1CF2D,
    0x1CF30...0x1CF46, 0x1D165...0x1D169, 0x1D16D...0x1D182, 0x1D185...0x1D18B,
    0x1D1AA...0x1D1AD, 0x1D242...0x1D244, 0x1DA00...0x1DA36, 0x1DA3B...0x1DA6C,
    0x1DA75...0x1DA75, 0x1DA84...0x1DA84, 0x1DA9B...0x1DA9F, 0x1DAA1...0x1DAAF,
    0x1E8D0...0x1E8D6, 0xE0001...0xE0001, 0xE0020...0xE007F, 0xE0100...0xE01EF,
  ]

  static func isIgnorable(_ scalar: Unicode.Scalar) -> Bool {
    let value = scalar.value
    // Printable ASCII is never ignorable; most names are nothing else.
    if (0x20...0x7E).contains(value) {
      return false
    }
    var low = 0
    var high = ignorableRanges.count - 1
    while low <= high {
      let middle = (low + high) / 2
      let range = ignorableRanges[middle]
      if value < range.lowerBound {
        high = middle - 1
      } else if value > range.upperBound {
        low = middle + 1
      } else {
        return true
      }
    }
    return false
  }

  private static func removingIgnorables(_ text: String) -> String {
    guard text.unicodeScalars.contains(where: isIgnorable) else {
      return text
    }
    var scalars = String.UnicodeScalarView()
    scalars.append(contentsOf: text.unicodeScalars.filter { !isIgnorable($0) })
    return String(scalars)
  }
}

/// `Array.prototype.sort` and `toSorted`: stable, so elements the comparator calls equal (0,
/// or NaN) keep their input order. Swift's `sorted` does not promise stability.
enum JSSort {
  static func sorted<Element>(
    _ elements: [Element], by compare: (Element, Element) -> Double
  ) -> [Element] {
    elements.enumerated()
      .sorted { lhs, rhs in
        let order = compare(lhs.element, rhs.element)
        if order < 0 {
          return true
        }
        if order > 0 {
          return false
        }
        return lhs.offset < rhs.offset
      }
      .map(\.element)
  }
}

/// JavaScript string operations by UTF-16 code unit. Swift's `==`, `hasPrefix`, and
/// `Set<String>` compare by canonical equivalence and grapheme cluster instead, so `"é"`
/// equals `"e\u{301}"` and `"e\u{301}x"` does not start with `"e"` there.
enum JSString {
  /// `a === b`.
  static func equal(_ a: String, _ b: String) -> Bool {
    a.utf16.elementsEqual(b.utf16)
  }

  /// `a === b` for optionals; `null` equals only `null`.
  static func equal(_ a: String?, _ b: String?) -> Bool {
    switch (a, b) {
    case (nil, nil): true
    case (let a?, let b?): equal(a, b)
    default: false
    }
  }

  /// A dictionary or set key that matches the way a JavaScript `Map` or `Set` keys strings.
  static func key(_ text: String) -> [UInt16] {
    Array(text.utf16)
  }

  /// `isNonEmptyString` in `packages/planning-center-models/src/json.ts`.
  static func isNonEmpty(_ text: String?) -> Bool {
    guard let text else { return false }
    return !text.utf16.isEmpty
  }

  /// `text.startsWith(prefix)`.
  static func hasPrefix(_ text: String, _ prefix: String) -> Bool {
    text.utf16.starts(with: prefix.utf16)
  }

  /// `text.endsWith(suffix)`.
  static func hasSuffix(_ text: String, _ suffix: String) -> Bool {
    text.utf16.reversed().starts(with: suffix.utf16.reversed())
  }

  /// `text.indexOf(needle)` in UTF-16 code units, or nil for -1.
  static func firstIndex(of needle: String, in text: String) -> Int? {
    let units = Array(text.utf16)
    let target = Array(needle.utf16)
    guard target.count <= units.count else { return nil }
    for start in 0...(units.count - target.count)
    where units[start..<(start + target.count)].elementsEqual(target) {
      return start
    }
    return nil
  }

  /// `text.includes(needle)`.
  static func contains(_ text: String, _ needle: String) -> Bool {
    firstIndex(of: needle, in: text) != nil
  }

  /// `text.slice(start)` for a UTF-16 offset.
  static func suffix(_ text: String, from start: Int) -> String {
    String(decoding: Array(text.utf16.dropFirst(max(0, start))), as: UTF16.self)
  }

  /// `text.split(separator)` for a non-empty separator: empty pieces are kept.
  static func split(_ text: String, separator: String) -> [String] {
    let units = Array(text.utf16)
    let target = Array(separator.utf16)
    guard !target.isEmpty else { return [text] }
    var pieces: [String] = []
    var pieceStart = 0
    var index = 0
    while index + target.count <= units.count {
      if units[index..<(index + target.count)].elementsEqual(target) {
        pieces.append(String(decoding: units[pieceStart..<index], as: UTF16.self))
        index += target.count
        pieceStart = index
      } else {
        index += 1
      }
    }
    pieces.append(String(decoding: units[pieceStart...], as: UTF16.self))
    return pieces
  }

  /// `[...new Set(items)]`: the first of each run of equal strings, in order.
  static func uniqued(_ items: [String]) -> [String] {
    var seen = Set<[UInt16]>()
    return items.filter { seen.insert(key($0)).inserted }
  }

  /// `` `${count} ${word}${count === 1 ? "" : "s"}` ``.
  static func plural(_ count: Int, _ word: String) -> String {
    "\(count) \(word)\(count == 1 ? "" : "s")"
  }
}

/// `new Date(text)` for the ISO 8601 shapes JavaScript reads the same way everywhere.
enum JSDate {
  /// A date, a date and time, or nil where JavaScript gives an invalid date.
  ///
  /// Reads `YYYY`, `YYYY-MM`, `YYYY-MM-DD` (or a signed six-digit year), optionally followed
  /// by `T` (or `t` or a space) and `HH:mm`, `HH:mm:ss`, or `HH:mm:ss.f...` (the first three
  /// fraction digits count), then optionally `Z` or an offset `+HH:mm` or `+HHmm`. `24:00`
  /// means the end of the day, and a day past the end of its month rolls into the next, as V8
  /// reads them. Two cases differ on purpose: a time without an offset is read as UTC (the
  /// browser reads it in its own zone; the API always sends `Z`), and text outside these
  /// shapes, which V8 hands to its lenient legacy parser, is nil.
  static func parse(_ text: String) -> Date? {
    var reader = Reader(Array(text.utf8))
    guard let time = reader.readDateTime(), reader.isAtEnd,
      abs(time) <= JSParity.maxTime
    else {
      return nil
    }
    return JSParity.date(time: time)
  }

  private struct Reader {
    let bytes: [UInt8]
    var index = 0

    init(_ bytes: [UInt8]) {
      self.bytes = bytes
    }

    var isAtEnd: Bool { index == bytes.count }

    private var current: UInt8? { index < bytes.count ? bytes[index] : nil }

    private mutating func take(_ byte: UInt8) -> Bool {
      guard current == byte else { return false }
      index += 1
      return true
    }

    private mutating func digits(_ count: Int) -> Int? {
      guard index + count <= bytes.count else { return nil }
      var value = 0
      for byte in bytes[index..<(index + count)] {
        guard (0x30...0x39).contains(byte) else { return nil }
        value = value * 10 + Int(byte - 0x30)
      }
      index += count
      return value
    }

    private mutating func year() -> Int? {
      if take(0x2B) {  // +
        return digits(6)
      }
      if take(0x2D) {  // -
        guard let value = digits(6), value != 0 else { return nil }
        return -value
      }
      return digits(4)
    }

    /// Milliseconds since 1970, or nil when the text is not one of the shapes above.
    mutating func readDateTime() -> Int? {
      guard let year = year() else { return nil }
      var month = 1
      var day = 1
      if take(0x2D) {
        guard let value = digits(2), (1...12).contains(value) else { return nil }
        month = value
        if take(0x2D) {
          guard let value = digits(2), (1...31).contains(value) else { return nil }
          day = value
        }
      }
      let days = OrgCalendar.daysFromCivil(year: year, month: month, day: 1) + day - 1
      let midnight = days * OrgCalendar.millisecondsPerDay
      guard let separator = current, separator == 0x54 || separator == 0x74 || separator == 0x20
      else {
        return midnight
      }
      index += 1
      guard let timeOfDay = readTime() else { return nil }
      return midnight + timeOfDay - readOffset()
    }

    private mutating func readTime() -> Int? {
      guard let hour = digits(2), take(0x3A), let minute = digits(2), hour <= 24, minute <= 59
      else {
        return nil
      }
      var second = 0
      var millisecond = 0
      if take(0x3A) {
        guard let value = digits(2), value <= 59 else { return nil }
        second = value
        if take(0x2E) {
          guard let value = fraction() else { return nil }
          millisecond = value
        }
      }
      if hour == 24, minute != 0 || second != 0 || millisecond != 0 {
        return nil
      }
      return hour * OrgCalendar.millisecondsPerHour + minute * OrgCalendar.millisecondsPerMinute
        + second * 1000 + millisecond
    }

    /// The fraction's first three digits as milliseconds; later digits are dropped.
    private mutating func fraction() -> Int? {
      var value = 0
      var count = 0
      while let byte = current, (0x30...0x39).contains(byte) {
        if count < 3 {
          value = value * 10 + Int(byte - 0x30)
        }
        count += 1
        index += 1
      }
      guard count > 0 else { return nil }
      for _ in min(count, 3)..<3 {
        value *= 10
      }
      return value
    }

    /// The offset in milliseconds east of UTC; 0 for `Z` or no offset. A malformed offset
    /// leaves the reader short of the end, so the parse fails.
    private mutating func readOffset() -> Int {
      if take(0x5A) || take(0x7A) {  // Z, z
        return 0
      }
      guard let sign = current, sign == 0x2B || sign == 0x2D else { return 0 }
      let start = index
      index += 1
      guard let hours = digits(2), hours <= 23 else {
        index = start
        return 0
      }
      _ = take(0x3A)
      guard let minutes = digits(2), minutes <= 59 else {
        index = start
        return 0
      }
      let offset =
        hours * OrgCalendar.millisecondsPerHour
        + minutes * OrgCalendar.millisecondsPerMinute
      return sign == 0x2B ? offset : -offset
    }
  }
}

import Foundation

/// JavaScript string and number semantics the Swift ports need to match their
/// TypeScript character for character. JavaScript strings are UTF-16, its whitespace set
/// differs from Unicode's `White_Space` (it adds U+FEFF and leaves out U+0085), and
/// `Math.round` rounds halves up rather than away from zero.
enum JSParity {
  /// `\s` in a JavaScript regular expression, which is also the set `String.prototype.trim`
  /// removes: WhiteSpace (tab, vertical tab, form feed, U+FEFF, and every `Zs` space) plus
  /// LineTerminator (line feed, carriage return, U+2028, U+2029).
  static func isWhitespace(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.value {
    case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000,
      0xFEFF:
      true
    default:
      false
    }
  }

  /// `String.prototype.trim`.
  static func trim(_ text: String) -> String {
    let scalars = text.unicodeScalars
    guard let first = scalars.firstIndex(where: { !isWhitespace($0) }),
      let last = scalars.lastIndex(where: { !isWhitespace($0) })
    else {
      return ""
    }
    return String(scalars[first...last])
  }

  /// `String.prototype.trimEnd`.
  static func trimEnd(_ text: String) -> String {
    let scalars = text.unicodeScalars
    guard let last = scalars.lastIndex(where: { !isWhitespace($0) }) else {
      return ""
    }
    return String(scalars[...last])
  }

  /// `text.split(/\s+/u).filter(Boolean)`: the runs between whitespace.
  static func words(_ text: String) -> [String] {
    text.unicodeScalars.split(whereSeparator: isWhitespace).map { String($0) }
  }

  /// `text.split(separator)` for a one-character separator: empty pieces are kept, and the
  /// split is by code point, so a separator followed by a combining mark still splits.
  static func split(_ text: String, separator: Unicode.Scalar) -> [String] {
    text.unicodeScalars.split(separator: separator, omittingEmptySubsequences: false)
      .map { String($0) }
  }

  /// `text.slice(0, count)`: the first `count` UTF-16 code units. A surrogate pair cut in
  /// half becomes U+FFFD, which is how JavaScript renders the lone surrogate it keeps.
  static func utf16Prefix(_ text: String, _ count: Int) -> String {
    String(decoding: Array(text.utf16.prefix(max(0, count))), as: UTF16.self)
  }

  /// `String(value).padStart(width, "0")`.
  static func zeroPadded(_ value: Int, width: Int) -> String {
    let digits = String(value)
    return String(repeating: "0", count: max(0, width - digits.utf16.count)) + digits
  }

  /// `Math.round`: the nearest integer, with halves going toward positive infinity
  /// (`Math.round(2.5)` is 3 and `Math.round(-2.5)` is -2).
  static func round(_ value: Double) -> Double {
    let floor = value.rounded(.down)
    return value - floor >= 0.5 ? floor + 1 : floor
  }

  /// Truncates toward zero like `Int(_:)`, but clamps instead of trapping: NaN is 0 and
  /// values beyond `Int`'s range become `Int.max` or `Int.min`.
  static func clampedInt(_ value: Double) -> Int {
    if value.isNaN {
      return 0
    }
    if value >= Double(Int.max) {
      return Int.max
    }
    if value <= Double(Int.min) {
      return Int.min
    }
    return Int(value)
  }

  /// The largest time a JavaScript `Date` holds, in milliseconds either side of 1970
  /// (100,000,000 days).
  static let maxTime = 8_640_000_000_000_000

  /// `Date.prototype.getTime()`: whole milliseconds since 1970. Rounds to the nearest
  /// millisecond, since a decoded `...T10:00:00.123Z` is stored as a binary fraction a hair
  /// off `.123`.
  static func time(_ date: Date) -> Int {
    let milliseconds = (date.timeIntervalSince1970 * 1000).rounded()
    return clampedInt(min(max(milliseconds, -Double(maxTime)), Double(maxTime)))
  }

  /// `new Date(time)`.
  static func date(time: Int) -> Date {
    Date(timeIntervalSince1970: Double(time) / 1000)
  }

  /// `Math.floor(dividend / divisor)` for integers, exact for every input.
  static func floorDivide(_ dividend: Int, _ divisor: Int) -> Int {
    let quotient = dividend / divisor
    let hasRemainder = dividend % divisor != 0
    return hasRemainder && (dividend < 0) != (divisor < 0) ? quotient - 1 : quotient
  }

  /// The remainder with the divisor's sign, for a positive divisor in `0..<divisor`.
  static func modulo(_ dividend: Int, _ divisor: Int) -> Int {
    dividend - floorDivide(dividend, divisor) * divisor
  }
}

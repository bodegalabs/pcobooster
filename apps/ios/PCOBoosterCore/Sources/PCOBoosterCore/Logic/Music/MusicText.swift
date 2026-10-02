import Foundation

/// JavaScript string semantics the music and chord chart ports share, so they
/// read text exactly as the TypeScript they port does.
///
/// The TypeScript works on code points (regular expressions with the `u` flag)
/// and UTF-16 code units (`length`, `index`, `slice`, `padEnd`). Swift's
/// `String` compares by canonical equivalence and walks grapheme clusters, so
/// `"\r\n"` is one `Character` and `"e\u{301}"` equals `"\u{E9}"`. These
/// helpers therefore work on `Unicode.Scalar` arrays and UTF-16 counts, never
/// on `Character`s, and match JavaScript's `\s`, `trim`, case-insensitive
/// (`iu`) letter matching, and `toLowerCase`.
enum MusicText {
  typealias Scalars = [Unicode.Scalar]

  static func scalars(_ text: some StringProtocol) -> Scalars {
    Array(text.unicodeScalars)
  }

  static func string(_ scalars: some Sequence<Unicode.Scalar>) -> String {
    var view = String.UnicodeScalarView()
    view.append(contentsOf: scalars)
    return String(view)
  }

  static func utf16Count(_ scalars: some Sequence<Unicode.Scalar>) -> Int {
    scalars.reduce(0) { $0 + $1.utf16.count }
  }

  // MARK: Character classes

  /// JavaScript's `\s`, which `trim` also strips: ECMAScript WhiteSpace and
  /// LineTerminator. Unlike `CharacterSet.whitespacesAndNewlines` it includes
  /// U+FEFF and excludes U+0085.
  static func isWhitespace(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.value {
    case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F,
      0x3000, 0xFEFF:
      true
    default:
      false
    }
  }

  /// What `.` refuses and a multiline `$` stops before: LF, CR, U+2028, U+2029.
  static func isLineTerminator(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.value {
    case 0x0A, 0x0D, 0x2028, 0x2029: true
    default: false
    }
  }

  /// `\d`, which is ASCII only even with the `u` flag.
  static func isDigit(_ scalar: Unicode.Scalar) -> Bool {
    ("0"..."9").contains(scalar)
  }

  /// `\w` without the `i` flag: ASCII letters, digits, and `_`.
  static func isWordCharacter(_ scalar: Unicode.Scalar) -> Bool {
    isDigit(scalar) || scalar == "_" || ("a"..."z").contains(scalar)
      || ("A"..."Z").contains(scalar)
  }

  /// `\w` with the `iu` flags, which also admits the long s and the Kelvin
  /// sign because they case-fold to `s` and `k`.
  static func isFoldedWordCharacter(_ scalar: Unicode.Scalar) -> Bool {
    isWordCharacter(folded(scalar))
  }

  /// Simple case folding as an `iu` regular expression applies it to ASCII
  /// letters: `A` to `Z` fold to lowercase, and the long s (U+017F) and Kelvin
  /// sign (U+212A) fold to `s` and `k`. No other code point folds into ASCII.
  static func folded(_ scalar: Unicode.Scalar) -> Unicode.Scalar {
    switch scalar.value {
    case 0x41...0x5A: Unicode.Scalar(scalar.value + 0x20) ?? scalar
    case 0x17F: "s"
    case 0x212A: "k"
    default: scalar
    }
  }

  /// `[a-z]` with the `iu` flags.
  static func isFoldedLetter(_ scalar: Unicode.Scalar) -> Bool {
    ("a"..."z").contains(folded(scalar))
  }

  /// Whether `literal` (lowercase ASCII) matches `scalars` at `index` the way
  /// an `iu` regular expression compares letters.
  static func matchesFolded(_ scalars: Scalars, at index: Int, _ literal: Scalars) -> Bool {
    guard index >= 0, index + literal.count <= scalars.count else { return false }
    for (offset, expected) in literal.enumerated() where folded(scalars[index + offset]) != expected
    {
      return false
    }
    return true
  }

  /// Exact code point comparison, without Swift's canonical equivalence.
  static func equals(_ scalars: some Collection<Unicode.Scalar>, _ literal: String) -> Bool {
    scalars.elementsEqual(literal.unicodeScalars)
  }

  /// `String.prototype.includes`: an exact code point substring search.
  static func contains(_ text: String, _ needle: String) -> Bool {
    firstIndex(of: scalars(needle), in: scalars(text)) != nil
  }

  static func contains(_ scalars: Scalars, _ scalar: Unicode.Scalar) -> Bool {
    scalars.contains(scalar)
  }

  static func firstIndex(of needle: Scalars, in haystack: Scalars, from start: Int = 0) -> Int? {
    guard !needle.isEmpty else { return start <= haystack.count ? start : nil }
    guard haystack.count >= needle.count else { return nil }
    var index = start
    while index + needle.count <= haystack.count {
      if haystack[index..<(index + needle.count)].elementsEqual(needle) {
        return index
      }
      index += 1
    }
    return nil
  }

  // MARK: Whitespace

  /// The end of the `\s` run that starts at `index`.
  static func whitespaceEnd(_ scalars: Scalars, from index: Int) -> Int {
    var end = index
    while end < scalars.count, isWhitespace(scalars[end]) {
      end += 1
    }
    return end
  }

  /// Where the trailing `\s` run starts: the match of `/\s*$/u`.
  static func trailingWhitespaceStart(_ scalars: Scalars) -> Int {
    var start = scalars.count
    while start > 0, isWhitespace(scalars[start - 1]) {
      start -= 1
    }
    return start
  }

  static func trimmed(_ scalars: Scalars) -> ArraySlice<Unicode.Scalar> {
    let start = whitespaceEnd(scalars, from: 0)
    let end = max(start, trailingWhitespaceStart(scalars))
    return scalars[start..<end]
  }

  /// `String.prototype.trim`.
  static func trim(_ text: String) -> String {
    string(trimmed(scalars(text)))
  }

  /// `String.prototype.trimEnd`, and `replace(/\s+$/u, "")`.
  static func trimEnd(_ text: String) -> String {
    let all = scalars(text)
    return string(all[..<trailingWhitespaceStart(all)])
  }

  // MARK: Splitting

  /// `text.split(separator)` for a one code point separator; `"\r\n"` stays
  /// two code points, so splitting on `"\n"` leaves the `"\r"` on the line.
  static func split(_ text: String, separator: Unicode.Scalar) -> [String] {
    var pieces: [String] = []
    var current = String.UnicodeScalarView()
    for scalar in text.unicodeScalars {
      if scalar == separator {
        pieces.append(String(current))
        current = String.UnicodeScalarView()
      } else {
        current.append(scalar)
      }
    }
    pieces.append(String(current))
    return pieces
  }

  /// `text.split(/\r?\n/u)`.
  static func splitLines(_ text: String) -> [String] {
    split(text, separator: "\n").map { line in
      line.unicodeScalars.last == "\r" ? String(line.unicodeScalars.dropLast()) : line
    }
  }

  // MARK: Case

  /// `String.prototype.toLowerCase`: full Unicode lowercasing, including the
  /// final sigma rule Swift's `lowercased()` skips (`"ΑΣ Β"` becomes `"ας β"`).
  static func lowercased(_ text: String) -> String {
    let all = scalars(text)
    var result = String.UnicodeScalarView()
    for (index, scalar) in all.enumerated() {
      if scalar == "\u{3A3}", isFinalSigma(all, at: index) {
        result.append("\u{3C2}")
      } else {
        result.append(contentsOf: scalar.properties.lowercaseMapping.unicodeScalars)
      }
    }
    return String(result)
  }

  /// Unicode's Final_Sigma context: a cased letter before (past any case
  /// ignorable characters) and none after.
  private static func isFinalSigma(_ scalars: Scalars, at index: Int) -> Bool {
    var before = index - 1
    while before >= 0, scalars[before].properties.isCaseIgnorable {
      before -= 1
    }
    guard before >= 0, scalars[before].properties.isCased else { return false }
    var after = index + 1
    while after < scalars.count, scalars[after].properties.isCaseIgnorable {
      after += 1
    }
    return !(after < scalars.count && scalars[after].properties.isCased)
  }

  /// `String.prototype.toUpperCase`: full Unicode uppercasing (`ß` to `SS`).
  static func uppercased(_ text: String) -> String {
    text.uppercased()
  }

  // MARK: Numbers

  /// `String(number)` for a JavaScript number: integers without a fraction,
  /// the shortest digits that round-trip, and exponents only below 1e-6 or
  /// from 1e21, as `Number.prototype.toString` writes them.
  static func numberString(_ value: Double) -> String {
    if value.isNaN { return "NaN" }
    if value.isInfinite { return value < 0 ? "-Infinity" : "Infinity" }
    if value == 0 { return "0" }
    let sign = value < 0 ? "-" : ""
    // Swift's description is also the shortest round-trip form; only its
    // layout differs, so take its digits and exponent and lay them out again.
    let description = "\(value.magnitude)"
    let parts = description.split(separator: "e", maxSplits: 1)
    let mantissa = parts.first.map(String.init) ?? description
    let exponent = parts.count > 1 ? Int(parts[1]) ?? 0 : 0
    let pieces = mantissa.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false)
    let whole = pieces.first.map(String.init) ?? ""
    let fraction = pieces.count > 1 ? String(pieces[1]) : ""
    var digits = whole + fraction
    // `n` in the specification: the value is 0.digits times 10 to the n.
    var point = whole.count + exponent
    while digits.hasPrefix("0") {
      digits.removeFirst()
      point -= 1
    }
    while digits.hasSuffix("0") {
      digits.removeLast()
    }
    let count = digits.count
    if count <= point, point <= 21 {
      return sign + digits + String(repeating: "0", count: point - count)
    }
    if 0 < point, point <= 21 {
      let split = digits.index(digits.startIndex, offsetBy: point)
      return sign + digits[..<split] + "." + digits[split...]
    }
    if -6 < point, point <= 0 {
      return sign + "0." + String(repeating: "0", count: -point) + digits
    }
    let power = point - 1
    let exponentText = power < 0 ? "e-\(-power)" : "e+\(power)"
    guard count > 1, let first = digits.first else { return sign + digits + exponentText }
    return sign + String(first) + "." + digits.dropFirst() + exponentText
  }
}

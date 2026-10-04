import Foundation

/// JavaScript behavior the People ports rely on beyond `JSParity`: `localeCompare` (name and
/// day-key tie-breaks), `toLowerCase` with its Final_Sigma rule and `includes` on UTF-16 code
/// units (people search), and `String(number)` for counts that are plain `number`s in the
/// contract. Pinned by the `people.localeCompare` parity suite and, through the functions
/// that use them, by every `people.*` suite.
enum PeopleText {
  // MARK: Numbers

  /// `String(value)` for a JavaScript number: integers without a decimal point, the shortest
  /// round-trip digits otherwise, and exponents only beyond 1e21 or below 1e-6.
  static func number(_ value: Double) -> String {
    if value.isNaN {
      return "NaN"
    }
    if value.isInfinite {
      return value < 0 ? "-Infinity" : "Infinity"
    }
    if value == 0 {
      return "0"
    }
    if value < 0 {
      return "-" + number(-value)
    }
    if value < 1e21, value == value.rounded(.towardZero), value <= 9_007_199_254_740_992 {
      return String(Int64(value))
    }
    return ecmaScriptString(value)
  }

  /// "1 person" or "3 people".
  static func peopleCount(_ count: Int) -> String {
    "\(count) \(count == 1 ? "person" : "people")"
  }

  /// ECMAScript's Number::toString from the shortest round-trip digits Swift's `description`
  /// already finds (both pick the digits closest to the exact value).
  private static func ecmaScriptString(_ value: Double) -> String {
    let text = value.description
    let parts = text.split(separator: "e", maxSplits: 1)
    let mantissa = parts.first.map(String.init) ?? text
    let exponent = parts.count > 1 ? Int(parts[1]) ?? 0 : 0
    let pieces = mantissa.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false)
    let whole = pieces.first.map(String.init) ?? ""
    let fraction = pieces.count > 1 ? String(pieces[1]) : ""
    var digits = Array(whole + fraction)
    var point = whole.count + exponent
    while digits.first == "0" {
      digits.removeFirst()
      point -= 1
    }
    while digits.last == "0" {
      digits.removeLast()
    }
    guard !digits.isEmpty else {
      return "0"
    }
    let count = digits.count
    let all = String(digits)
    if count <= point, point <= 21 {
      return all + String(repeating: "0", count: point - count)
    }
    if 0 < point, point <= 21 {
      return String(digits[..<point]) + "." + String(digits[point...])
    }
    if -6 < point, point <= 0 {
      return "0." + String(repeating: "0", count: -point) + all
    }
    let shown = point - 1
    let sign = shown < 0 ? "-" : "+"
    let head = count == 1 ? all : String(digits[0]) + "." + String(digits[1...])
    return "\(head)e\(sign)\(abs(shown))"
  }

  // MARK: Case and search

  /// `String.prototype.toLowerCase`. Swift's `lowercased()` applies the same full mappings
  /// but not the one context-sensitive rule: a capital sigma that ends a word becomes final
  /// sigma (U+03C2), as in "ΟΔΥΣΣΕΥΣ" to "οδυσσευς".
  static func lowercased(_ text: String) -> String {
    let scalars = Array(text.unicodeScalars)
    guard scalars.contains(capitalSigma) else {
      return text.lowercased()
    }
    var result = String.UnicodeScalarView()
    for (index, scalar) in scalars.enumerated() {
      if scalar == capitalSigma, isFinalSigma(at: index, in: scalars) {
        result.append(finalSigma)
      } else {
        result.append(contentsOf: String(scalar).lowercased().unicodeScalars)
      }
    }
    return String(result)
  }

  private static let capitalSigma: Unicode.Scalar = "\u{03A3}"
  private static let finalSigma: Unicode.Scalar = "\u{03C2}"

  /// Unicode's Final_Sigma condition: a cased letter before (skipping case-ignorable
  /// characters) and none after.
  private static func isFinalSigma(at index: Int, in scalars: [Unicode.Scalar]) -> Bool {
    let casedBefore =
      scalars[..<index].reversed()
      .first { !$0.properties.isCaseIgnorable }
      .map(\.properties.isCased) ?? false
    let casedAfter =
      scalars[(index + 1)...]
      .first { !$0.properties.isCaseIgnorable }
      .map(\.properties.isCased) ?? false
    return casedBefore && !casedAfter
  }

  /// `haystack.includes(needle)`: a match of UTF-16 code units, so "e" matches the first
  /// half of a decomposed "é" as it does in JavaScript.
  static func includes(_ haystack: String, _ needle: String) -> Bool {
    let target = Array(needle.utf16)
    guard !target.isEmpty else {
      return true
    }
    let source = Array(haystack.utf16)
    guard source.count >= target.count else {
      return false
    }
    for start in 0...(source.count - target.count)
    where source[start] == target[0] && source[start..<(start + target.count)].elementsEqual(target)
    {
      return true
    }
    return false
  }

  // MARK: Ordering

  /// JavaScript's stable `toSorted(comparator)`: elements the comparator calls equal keep
  /// their order, which Swift's `sorted(by:)` does not promise.
  static func stableSorted<Element>(
    _ elements: [Element], comparator: (Element, Element) -> Int
  ) -> [Element] {
    elements.enumerated()
      .sorted { left, right in
        let order = comparator(left.element, right.element)
        return order < 0 || (order == 0 && left.offset < right.offset)
      }
      .map(\.element)
  }

  /// `a.localeCompare(b)` as Node orders it (ICU root collation, the en-US default): -1, 0,
  /// or 1. Foundation's localized compare is ICU-based too but differs in two ways this
  /// corrects. It counts characters ICU ignores completely (a trailing soft hyphen, for
  /// one), so those are removed first. And it calls compatibility variants equal to their
  /// base (a no-break space and a space, "ﬁ" and "fi", full-width letters), where ICU ranks
  /// the variant after the plain form at the tertiary level.
  ///
  /// Known remaining differences. Two different kinds of compatibility variant at the same
  /// place tie here, where ICU ranks the kinds (a no-break space sorts after an ideographic
  /// space, so "Lee\u{00A0}Chan" follows "Lee\u{3000}Chan" in JavaScript). And a few symbols
  /// no roster name uses: U+013F and U+0140 (L with a middle dot), U+03F2 (lunate sigma),
  /// U+210F, U+2120, U+2122, U+24FF, and U+0363.
  static func localeCompare(_ a: String, _ b: String) -> Int {
    if a == b {
      // Canonically equivalent strings, which ICU also calls equal.
      return 0
    }
    let left = withoutIgnorables(a)
    let right = withoutIgnorables(b)
    switch left.compare(right, options: [], range: nil, locale: collationLocale) {
    case .orderedAscending:
      return -1
    case .orderedDescending:
      return 1
    case .orderedSame:
      return compatibilityOrder(left, right)
    }
  }

  private static let collationLocale = Locale(identifier: "en_US")

  private static func withoutIgnorables(_ text: String) -> String {
    guard text.unicodeScalars.contains(where: isCollationIgnorable) else {
      return text
    }
    var kept = String.UnicodeScalarView()
    kept.append(contentsOf: text.unicodeScalars.filter { !isCollationIgnorable($0) })
    return String(kept)
  }

  /// Ties Foundation leaves: the first position, after compatibility decomposition, where
  /// one string has a compatibility variant and the other the plain character decides.
  private static func compatibilityOrder(_ a: String, _ b: String) -> Int {
    for (left, right) in zip(compatibilityMarks(a), compatibilityMarks(b)) where left != right {
      return left ? 1 : -1
    }
    return 0
  }

  /// One flag per scalar of the compatibility decomposition: whether it came from a
  /// compatibility variant (whose NFKD differs from its NFD).
  private static func compatibilityMarks(_ text: String) -> [Bool] {
    var marks: [Bool] = []
    for scalar in text.unicodeScalars {
      let single = String(scalar)
      let compatibility = single.decomposedStringWithCompatibilityMapping
      let canonical = single.decomposedStringWithCanonicalMapping
      let isVariant = !compatibility.unicodeScalars.elementsEqual(canonical.unicodeScalars)
      marks.append(contentsOf: repeatElement(isVariant, count: compatibility.unicodeScalars.count))
    }
    return marks
  }

  static func isCollationIgnorable(_ scalar: Unicode.Scalar) -> Bool {
    let value = scalar.value
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

  /// Code points Node's ICU 78 root collation ignores completely (equal to nothing at every
  /// strength), found by comparing each one inside and around "ab" with `localeCompare`.
  /// Sorted, for the binary search.
  private static let ignorableRanges: [ClosedRange<UInt32>] = [
    0x0000...0x0008, 0x000E...0x001F, 0x007F...0x0084, 0x0086...0x009F, 0x00AD...0x00AD,
    0x034F...0x034F, 0x0488...0x0489, 0x0591...0x05AF, 0x05BD...0x05BD, 0x05C4...0x05C5,
    0x0600...0x0605, 0x0610...0x061A, 0x061C...0x061C, 0x0640...0x0640, 0x06D6...0x06DD,
    0x06DF...0x06E4, 0x06E7...0x06E8, 0x06EA...0x06ED, 0x070F...0x070F, 0x0740...0x0740,
    0x0743...0x0744, 0x0747...0x074A, 0x07FA...0x07FA, 0x0890...0x0891, 0x0898...0x089D,
    0x08CA...0x08E2, 0x08EA...0x08EF, 0x08F3...0x08F3, 0x0951...0x0952, 0x0F18...0x0F19,
    0x0F35...0x0F35, 0x0F37...0x0F37, 0x0F3E...0x0F3F, 0x0F86...0x0F87, 0x0FC6...0x0FC6,
    0x17B4...0x17B5, 0x17D3...0x17D3, 0x180A...0x180F, 0x1A7F...0x1A7F, 0x1B6B...0x1B73,
    0x1CD0...0x1CE8, 0x1CF4...0x1CF4, 0x1CF7...0x1CF9, 0x200B...0x200F, 0x202A...0x202E,
    0x2060...0x2064, 0x2066...0x206F, 0x2D7F...0x2D7F, 0xA670...0xA672, 0xA8E0...0xA8F1,
    0xFE00...0xFE0F, 0xFE21...0xFE21, 0xFE23...0xFE26, 0xFE28...0xFE28, 0xFE2A...0xFE2D,
    0xFE2F...0xFE2F, 0xFE73...0xFE73, 0xFEFF...0xFEFF, 0xFFF9...0xFFFB, 0x102E0...0x102E0,
    0x10EFB...0x10EFB, 0x10EFD...0x10EFF, 0x110BD...0x110BD, 0x110CD...0x110CD,
    0x11366...0x1136C, 0x11370...0x11374, 0x113E1...0x113E2, 0x13430...0x13440,
    0x13447...0x13455, 0x16FE4...0x16FE4, 0x1BCA0...0x1BCA3, 0x1CF00...0x1CF2D,
    0x1CF30...0x1CF46, 0x1D165...0x1D169, 0x1D16D...0x1D182, 0x1D185...0x1D18B,
    0x1D1AA...0x1D1AD, 0x1D242...0x1D244, 0x1DA00...0x1DA36, 0x1DA3B...0x1DA6C,
    0x1DA75...0x1DA75, 0x1DA84...0x1DA84, 0x1DA9B...0x1DA9F, 0x1DAA1...0x1DAAF,
    0x1E8D0...0x1E8D6, 0xE0001...0xE0001, 0xE0020...0xE007F, 0xE0100...0xE01EF,
  ]
}

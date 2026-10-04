import Foundation

/// `a.localeCompare(b)` as Node runs it for the web's sorts (ICU collation for `en-US`, the
/// default locale in development and CI). Pinned by the `songs.compareTitles` parity suite.
///
/// Foundation's locale-aware comparison follows the same collation order, case after base
/// letter ("a" before "A" before "b") and accents after case ("e", "E", "é"), with
/// punctuation and digits before letters. It differs from ICU in two ways, both handled here:
///
/// - It calls strings equal that differ only by compatibility variants (a full-width "Ａ",
///   a circled "①", the "ﬁ" ligature, a no-break space). ICU orders those after the plain
///   form, which `.forcedOrdering` reproduces.
/// - With `.forcedOrdering` it would also order strings that differ only by characters ICU
///   ignores entirely (zero-width spaces, soft hyphens, control characters), which ICU calls
///   equal. Those are removed before the forced comparison.
enum TitleCollation {
  private static let locale = Locale(identifier: "en_US")

  /// Negative when `a` sorts first, positive when `b` does, zero when ICU calls them equal.
  static func compare(_ a: String, _ b: String) -> Int {
    let primary = a.compare(b, options: [], range: nil, locale: locale)
    if primary != .orderedSame {
      return sign(primary)
    }
    let strippedA = withoutIgnorables(a)
    let strippedB = withoutIgnorables(b)
    if strippedA == strippedB {
      return 0
    }
    return sign(
      strippedA.compare(strippedB, options: [.forcedOrdering], range: nil, locale: locale))
  }

  private static func sign(_ result: ComparisonResult) -> Int {
    switch result {
    case .orderedAscending: -1
    case .orderedSame: 0
    case .orderedDescending: 1
    }
  }

  /// Characters ICU's root collation gives no weight at all: default ignorable code points
  /// (format characters such as U+200B and U+00AD) and control characters other than the
  /// whitespace controls.
  private static func isIgnorable(_ scalar: Unicode.Scalar) -> Bool {
    if scalar.properties.isDefaultIgnorableCodePoint {
      return true
    }
    guard scalar.properties.generalCategory == .control else {
      return false
    }
    return !(0x09...0x0D).contains(scalar.value) && scalar.value != 0x85
  }

  private static func withoutIgnorables(_ text: String) -> String {
    var scalars = String.UnicodeScalarView()
    scalars.append(contentsOf: text.unicodeScalars.lazy.filter { !isIgnorable($0) })
    return String(scalars)
  }
}

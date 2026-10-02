import Foundation

/// JavaScript array and string behavior the plan and song ports share, so they order and
/// compare exactly like the TypeScript they port.
///
/// - `Array.prototype.toSorted` is stable; Swift's `sort` makes no such promise, so sorts
///   break ties by original position.
/// - `===` and `Set` compare strings by UTF-16 code unit; Swift's `==` and `Set<String>` use
///   canonical equivalence, so a precomposed "é" and "e" plus a combining accent would be
///   equal. User text (titles, descriptions, key names) is compared code unit by code unit.
enum PlanLogic {
  /// `array.toSorted(compare)` for a consistent comparator: equal elements keep their order.
  static func stableSorted<Element>(
    _ elements: [Element], by areInIncreasingOrder: (Element, Element) -> Bool
  ) -> [Element] {
    elements.enumerated()
      .sorted { first, second in
        if areInIncreasingOrder(first.element, second.element) {
          return true
        }
        if areInIncreasingOrder(second.element, first.element) {
          return false
        }
        return first.offset < second.offset
      }
      .map(\.element)
  }

  /// `a === b` for strings: the same UTF-16 code units.
  static func identical(_ a: String, _ b: String) -> Bool {
    a.utf16.elementsEqual(b.utf16)
  }

  /// `[...new Set(values)]`: the first of each run of identical strings, in order.
  static func orderedUnique(_ values: [String]) -> [String] {
    var seen = Set<[UInt16]>()
    return values.filter { seen.insert(Array($0.utf16)).inserted }
  }

  /// `Math.floor` for the doubles the API sends as plain numbers.
  static func floor(_ value: Double) -> Double {
    value.rounded(.down)
  }

  /// `String(value).padStart(2, "0")` for a JavaScript number.
  static func twoDigits(_ value: Double) -> String {
    let text = MusicText.numberString(value)
    return text.utf16.count >= 2 ? text : "0\(text)"
  }

  /// `Number(text)`: JavaScript's string to number conversion. Surrounding whitespace is
  /// ignored and an empty string is 0. Decimal literals (with sign, fraction, and exponent),
  /// `Infinity`, and unsigned `0x`, `0o`, and `0b` integers parse; anything else is NaN.
  static func number(_ text: String) -> Double {
    let scalars = Array(JSParity.trim(text).unicodeScalars)
    if scalars.isEmpty {
      return 0
    }
    if let value = radixInteger(scalars) {
      return value
    }
    var index = 0
    var sign: Double = 1
    if scalars[0] == "+" || scalars[0] == "-" {
      sign = scalars[0] == "-" ? -1 : 1
      index = 1
    }
    let body = scalars[index...]
    if body.elementsEqual("Infinity".unicodeScalars) {
      return sign * .infinity
    }
    guard isDecimalLiteral(body), let magnitude = Double(String(String.UnicodeScalarView(body)))
    else {
      return .nan
    }
    return sign * magnitude
  }

  /// `0x1F`, `0o17`, or `0b101`, which `Number` reads without a sign.
  private static func radixInteger(_ scalars: [Unicode.Scalar]) -> Double? {
    guard scalars.count > 2, scalars[0] == "0" else {
      return nil
    }
    let radix: Double
    switch scalars[1] {
    case "x", "X": radix = 16
    case "o", "O": radix = 8
    case "b", "B": radix = 2
    default: return nil
    }
    var value: Double = 0
    for scalar in scalars[2...] {
      guard let digit = hexDigitValue(scalar), Double(digit) < radix else {
        return .nan
      }
      value = value * radix + Double(digit)
    }
    return value
  }

  private static func hexDigitValue(_ scalar: Unicode.Scalar) -> Int? {
    switch scalar {
    case "0"..."9": Int(scalar.value - 48)
    case "a"..."f": Int(scalar.value - 87)
    case "A"..."F": Int(scalar.value - 55)
    default: nil
    }
  }

  /// `StrUnsignedDecimalLiteral`: digits with an optional fraction (at least one digit in
  /// all) and an optional exponent.
  private static func isDecimalLiteral(_ scalars: ArraySlice<Unicode.Scalar>) -> Bool {
    var index = scalars.startIndex
    var digitCount = 0
    while index < scalars.endIndex, MusicText.isDigit(scalars[index]) {
      digitCount += 1
      index += 1
    }
    if index < scalars.endIndex, scalars[index] == "." {
      index += 1
      while index < scalars.endIndex, MusicText.isDigit(scalars[index]) {
        digitCount += 1
        index += 1
      }
    }
    guard digitCount > 0 else {
      return false
    }
    if index < scalars.endIndex, scalars[index] == "e" || scalars[index] == "E" {
      index += 1
      if index < scalars.endIndex, scalars[index] == "+" || scalars[index] == "-" {
        index += 1
      }
      let exponentStart = index
      while index < scalars.endIndex, MusicText.isDigit(scalars[index]) {
        index += 1
      }
      guard index > exponentStart else {
        return false
      }
    }
    return index == scalars.endIndex
  }
}

// JavaScript's string equality for the ports in Logic/Access, Logic/Account, and
// Logic/ChordChartSession.

/// JavaScript's `===` on strings, which compares code units. Swift's `==` compares by
/// canonical equivalence instead, so "e" plus a combining accent equals "\u{E9}" in Swift but
/// not in JavaScript; the ports use this wherever the TypeScript compares text.
enum ExactText {
  static func equal(_ left: String, _ right: String) -> Bool {
    left.unicodeScalars.elementsEqual(right.unicodeScalars)
  }

  static func equal(_ left: String?, _ right: String?) -> Bool {
    switch (left, right) {
    case (nil, nil): true
    case (let left?, let right?): equal(left, right)
    default: false
    }
  }

  static func equal<Value: RawRepresentable>(_ left: Value?, _ right: Value?) -> Bool
  where Value.RawValue == String {
    equal(left?.rawValue, right?.rawValue)
  }
}

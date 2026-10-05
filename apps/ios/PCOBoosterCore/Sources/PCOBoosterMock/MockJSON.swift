import Foundation
import PCOBoosterCore

/// A JSON value as the mock reads, matches, rewrites, and serves it. Fixtures stay untyped here
/// so the mock never depends on the generated models: it answers the wire format, and the
/// client's own decoding is what the previews and tests exercise.
enum MockJSON: Sendable, Equatable {
  case null
  case bool(Bool)
  case int(Int)
  case double(Double)
  case string(String)
  case array([MockJSON])
  case object([String: MockJSON])
}

extension MockJSON: Codable {
  init(from decoder: any Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .null
    } else if let value = try? container.decode(Bool.self) {
      self = .bool(value)
    } else if let value = try? container.decode(Int.self) {
      self = .int(value)
    } else if let value = try? container.decode(Double.self) {
      self = .double(value)
    } else if let value = try? container.decode(String.self) {
      self = .string(value)
    } else if let value = try? container.decode([MockJSON].self) {
      self = .array(value)
    } else {
      self = .object(try container.decode([String: MockJSON].self))
    }
  }

  func encode(to encoder: any Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .null: try container.encodeNil()
    case .bool(let value): try container.encode(value)
    case .int(let value): try container.encode(value)
    case .double(let value): try container.encode(value)
    case .string(let value): try container.encode(value)
    case .array(let value): try container.encode(value)
    case .object(let value): try container.encode(value)
    }
  }
}

extension MockJSON {
  static func parse(_ data: Data) throws -> MockJSON {
    try JSONDecoder().decode(MockJSON.self, from: data)
  }

  func encoded() throws -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    return try encoder.encode(self)
  }

  subscript(key: String) -> MockJSON? {
    get {
      guard case .object(let members) = self else { return nil }
      return members[key]
    }
    set {
      guard case .object(var members) = self else { return }
      members[key] = newValue
      self = .object(members)
    }
  }

  var string: String? {
    guard case .string(let value) = self else { return nil }
    return value
  }

  var int: Int? {
    switch self {
    case .int(let value): value
    case .double(let value) where value.rounded() == value: Int(value)
    default: nil
    }
  }

  var bool: Bool? {
    guard case .bool(let value) = self else { return nil }
    return value
  }

  var array: [MockJSON]? {
    guard case .array(let value) = self else { return nil }
    return value
  }

  var object: [String: MockJSON]? {
    guard case .object(let value) = self else { return nil }
    return value
  }

  /// Present and not `null`.
  var isPresent: Bool { self != .null }

  /// Whether every key, element, and value of `self` appears in `input`: objects by key,
  /// arrays element by element at equal length, numbers by value, and ISO 8601 date-times by
  /// instant (so `...00Z` matches `...00.000Z`).
  func matches(_ input: MockJSON) -> Bool {
    switch (self, input) {
    case (.object(let expected), .object(let actual)):
      expected.allSatisfy { key, value in actual[key].map(value.matches) ?? false }
    case (.array(let expected), .array(let actual)):
      expected.count == actual.count && zip(expected, actual).allSatisfy { $0.matches($1) }
    case (.string(let expected), .string(let actual)):
      expected == actual || Self.sameInstant(expected, actual)
    case (.int, _), (.double, _):
      numberValue != nil && numberValue == input.numberValue
    default:
      self == input
    }
  }

  /// Every string in the value, rewritten; keys are left alone.
  func mappingStrings(_ transform: (String) -> String) -> MockJSON {
    switch self {
    case .string(let value): .string(transform(value))
    case .array(let values): .array(values.map { $0.mappingStrings(transform) })
    case .object(let members): .object(members.mapValues { $0.mappingStrings(transform) })
    default: self
    }
  }

  private var numberValue: Double? {
    switch self {
    case .int(let value): Double(value)
    case .double(let value): value
    default: nil
    }
  }

  private static func sameInstant(_ first: String, _ second: String) -> Bool {
    guard let firstDate = JSONCoding.parseISODate(first),
      let secondDate = JSONCoding.parseISODate(second)
    else { return false }
    return firstDate == secondDate
  }
}

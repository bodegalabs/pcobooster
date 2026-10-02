import Foundation

/// Any JSON value: contract fields typed `z.json()`, `z.unknown()`, or `z.any()` (for example
/// `PlanTime.teamReminders`), and error `data` read before its code is known. Numbers are
/// `Double`, as in JavaScript. Decode a value into a concrete type with `decode(_:)`.
public indirect enum JSONValue: Codable, Hashable, Sendable {
  case null
  case bool(Bool)
  case number(Double)
  case string(String)
  case array([JSONValue])
  case object([String: JSONValue])

  public init(from decoder: any Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .null
    } else if let value = try? container.decode(Bool.self) {
      self = .bool(value)
    } else if let value = try? container.decode(Double.self) {
      self = .number(value)
    } else if let value = try? container.decode(String.self) {
      self = .string(value)
    } else if let value = try? container.decode([JSONValue].self) {
      self = .array(value)
    } else if let value = try? container.decode([String: JSONValue].self) {
      self = .object(value)
    } else {
      throw DecodingError.dataCorruptedError(
        in: container, debugDescription: "Expected a JSON value")
    }
  }

  public func encode(to encoder: any Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .null: try container.encodeNil()
    case .bool(let value): try container.encode(value)
    case .number(let value): try container.encode(value)
    case .string(let value): try container.encode(value)
    case .array(let value): try container.encode(value)
    case .object(let value): try container.encode(value)
    }
  }
}

// MARK: - Reading

extension JSONValue {
  public var isNull: Bool {
    if case .null = self { true } else { false }
  }

  public var boolValue: Bool? {
    if case .bool(let value) = self { value } else { nil }
  }

  public var doubleValue: Double? {
    if case .number(let value) = self { value } else { nil }
  }

  /// The number when it is a whole number that fits in `Int`.
  public var intValue: Int? {
    guard case .number(let value) = self, let exact = Int(exactly: value) else { return nil }
    return exact
  }

  public var stringValue: String? {
    if case .string(let value) = self { value } else { nil }
  }

  public var arrayValue: [JSONValue]? {
    if case .array(let value) = self { value } else { nil }
  }

  public var objectValue: [String: JSONValue]? {
    if case .object(let value) = self { value } else { nil }
  }

  /// The member named `key` of an object; nil for other values and absent keys.
  public subscript(key: String) -> JSONValue? {
    objectValue?[key]
  }

  /// The element at `index` of an array; nil for other values and out-of-range indexes.
  public subscript(index: Int) -> JSONValue? {
    guard let array = arrayValue, array.indices.contains(index) else { return nil }
    return array[index]
  }
}

// MARK: - Converting

extension JSONValue {
  /// Encodes `value` with the API's coders (`JSONCoding`), so dates become ISO 8601 strings.
  public init<Value: Encodable>(encoding value: Value) throws {
    let data = try JSONCoding.makeEncoder().encode(value)
    self = try JSONCoding.makeDecoder().decode(JSONValue.self, from: data)
  }

  /// Decodes this value as `type` with the API's coders (`JSONCoding`), for example an error's
  /// `data` as `NotFoundErrorData`.
  public func decode<Value: Decodable>(_ type: Value.Type) throws -> Value {
    let data = try JSONCoding.makeEncoder().encode(self)
    return try JSONCoding.makeDecoder().decode(type, from: data)
  }
}

// MARK: - Literals

extension JSONValue: ExpressibleByBooleanLiteral {
  public init(booleanLiteral value: Bool) {
    self = .bool(value)
  }
}

extension JSONValue: ExpressibleByIntegerLiteral {
  public init(integerLiteral value: Int) {
    self = .number(Double(value))
  }
}

extension JSONValue: ExpressibleByFloatLiteral {
  public init(floatLiteral value: Double) {
    self = .number(value)
  }
}

extension JSONValue: ExpressibleByStringLiteral {
  public init(stringLiteral value: String) {
    self = .string(value)
  }
}

extension JSONValue: ExpressibleByArrayLiteral {
  public init(arrayLiteral elements: JSONValue...) {
    self = .array(elements)
  }
}

extension JSONValue: ExpressibleByDictionaryLiteral {
  public init(dictionaryLiteral elements: (String, JSONValue)...) {
    self = .object(Dictionary(elements) { _, last in last })
  }
}

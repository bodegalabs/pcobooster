import Foundation
import PCOBoosterCore
import Testing

/// Decodes and encodes generated models with the API's coders, for the API model tests.
enum GeneratedModelJSON {
  static func decode<Value: Decodable>(_ type: Value.Type, _ json: String) throws -> Value {
    try JSONCoding.makeDecoder().decode(type, from: Data(json.utf8))
  }

  /// Sorted-key JSON, so tests compare exact strings.
  static func encode<Value: Encodable>(_ value: Value) throws -> String {
    String(decoding: try JSONCoding.makeEncoder().encode(value), as: UTF8.self)
  }

  static func date(_ iso: String) throws -> Date {
    try #require(JSONCoding.parseISODate(iso))
  }
}

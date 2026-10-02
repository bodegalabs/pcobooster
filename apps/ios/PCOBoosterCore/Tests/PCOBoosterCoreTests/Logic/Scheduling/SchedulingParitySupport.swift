import Foundation
import PCOBoosterCore

/// Shapes and comparisons the `scheduling.*` parity tests share.
enum SchedulingParity {
  /// A `Map` entry, as scripts/parity/scheduling.parity.ts writes maps.
  struct Entry<Value: Decodable & Sendable>: Decodable, Sendable {
    let key: String
    let value: Value
  }

  /// A person as the selection sort and the recommendation strip read them; the fixtures
  /// leave out everything else.
  struct RankedPerson: Decodable, Sendable {
    let id: String
    let fullName: String
    let isBlockedForDate: Bool?
    let isScheduledForSelectedPlanPosition: Bool
    let isConfirmedForSelectedPlanPosition: Bool
    let isDeclinedForSelectedPlanPosition: Bool
    let recommendationScore: Double?

    var person: CandidatePerson {
      CandidatePerson(
        id: id,
        firstName: fullName,
        lastName: "",
        fullName: fullName,
        isBlockedForDate: isBlockedForDate,
        isScheduledForSelectedPlanPosition: isScheduledForSelectedPlanPosition,
        isConfirmedForSelectedPlanPosition: isConfirmedForSelectedPlanPosition,
        isDeclinedForSelectedPlanPosition: isDeclinedForSelectedPlanPosition,
        recommendationScore: recommendationScore)
    }
  }

  /// A position as `{ teamId, positionId }`.
  struct SlotKey: Decodable, Sendable {
    let teamId: String
    let positionId: String
  }

  /// The value as the API's coders write it: keys sorted, dates to the millisecond. Values
  /// that went through different date parsers can differ in a binary fraction of a
  /// millisecond, which this hides as JavaScript's whole-millisecond dates do.
  static func json<Value: Encodable>(_ value: Value) throws -> String {
    String(decoding: try JSONCoding.makeEncoder().encode(value), as: UTF8.self)
  }

  /// A dictionary from fixture entries; the fixtures never repeat a key.
  static func dictionary<Value>(_ entries: [Entry<Value>]) -> [String: Value] {
    Dictionary(entries.map { ($0.key, $0.value) }, uniquingKeysWith: { _, last in last })
  }
}

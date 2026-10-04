import Foundation

/// One oRPC procedure from `packages/contracts`, called as
/// `POST /api/rpc/<path>` with the body `{"json": input}` (or `{}` when the
/// contract declares no input). Generated descriptors live in
/// `API/Generated/Procedures.swift`; never hand-write one for a contract
/// procedure.
public struct Procedure<Input: Encodable & Sendable, Output: Decodable & Sendable>: Sendable {
  /// The router path, for example `people/positionCandidates`.
  public let path: String
  /// False when the contract has no `.input()`; the request body is then `{}`.
  public let hasInput: Bool

  public init(_ path: String, hasInput: Bool = true) {
    self.path = path
    self.hasInput = hasInput
  }
}

/// Input for procedures whose contract input is an empty object (`z.object({})`).
public struct EmptyInput: Codable, Sendable, Equatable {
  public init() {}
}

/// Output for procedures that return nothing (`z.void()` or an empty object).
public struct EmptyOutput: Codable, Sendable, Equatable {
  public init() {}
}

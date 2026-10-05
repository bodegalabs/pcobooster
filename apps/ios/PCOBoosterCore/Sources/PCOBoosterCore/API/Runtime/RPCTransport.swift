import Foundation

/// One HTTP exchange with the API, below JSON encoding. The live transport is
/// a cookieless `URLSession`; `PCOBoosterMock.MockTransport` answers from
/// bundled fixtures. `RPCClient` builds requests and decodes responses on top.
public struct RPCRequest: Sendable, Equatable {
  /// The procedure path, for example `people/positionCandidates`.
  public var path: String
  /// The full request body: `{"json": input}` or `{}`.
  public var body: Data
  public var headers: [String: String]

  public init(path: String, body: Data, headers: [String: String] = [:]) {
    self.path = path
    self.body = body
    self.headers = headers
  }
}

public struct RPCResponse: Sendable, Equatable {
  public var status: Int
  /// The full response body: `{"json": output, "meta": [...]}` or an error
  /// envelope `{"json": {"defined", "code", "status", "message", "data"}}`.
  public var body: Data
  /// Header names are lowercased.
  public var headers: [String: String]

  public init(status: Int, body: Data, headers: [String: String] = [:]) {
    self.status = status
    self.body = body
    self.headers = headers
  }
}

public protocol RPCTransport: Sendable {
  func send(_ request: RPCRequest) async throws -> RPCResponse
}

import Foundation

/// One plain HTTP exchange with the product origin, for the Better Auth endpoints the native
/// sign-in uses (`/api/auth/native/exchange`, `/api/auth/sign-out`). oRPC calls go through
/// `RPCTransport` instead. The live implementation is `URLSessionTransport`.
public struct HTTPRequest: Sendable, Equatable {
  /// `GET`, `POST`, ...
  public var method: String
  /// The path from the origin, starting with `/`, for example `/api/auth/sign-out`.
  public var path: String
  public var headers: [String: String]
  public var body: Data?

  public init(method: String, path: String, headers: [String: String] = [:], body: Data? = nil) {
    self.method = method
    self.path = path
    self.headers = headers
    self.body = body
  }
}

/// An HTTP response: status, body, and lowercased header names, the same shape as an RPC
/// response.
public typealias HTTPResponse = RPCResponse

public protocol HTTPTransport: Sendable {
  func send(_ request: HTTPRequest) async throws -> HTTPResponse
}

/// An `HTTPTransport` for builds that never sign in (mock data, previews): every request fails
/// as offline, so nothing leaves the device by accident.
public struct UnavailableHTTPTransport: HTTPTransport {
  public init() {}

  public func send(_ request: HTTPRequest) async throws -> HTTPResponse {
    throw URLError(.notConnectedToInternet)
  }
}

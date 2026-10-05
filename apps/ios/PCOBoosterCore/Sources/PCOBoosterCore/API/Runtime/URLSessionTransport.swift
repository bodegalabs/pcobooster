import Foundation

/// The live transport: a cookieless, ephemeral `URLSession` against the product origin.
///
/// The session never stores or sends cookies. Better Auth refuses any cookie-bearing POST that
/// has no `Origin` (403 `MISSING_OR_NULL_ORIGIN`), and a stray `session_data` cookie could
/// identify the wrong user, so the bearer token and the `x-pcobooster-*` headers carry every
/// credential. `Set-Cookie` headers stay readable on responses (the demo token arrives that
/// way).
public struct URLSessionTransport: RPCTransport, HTTPTransport {
  /// The product origin, for example `https://pcobooster.com`.
  public let baseURL: URL
  private let session: URLSession

  /// Seconds before a request without a response fails.
  public static let defaultTimeout: TimeInterval = 30

  public init(baseURL: URL, session: URLSession = URLSessionTransport.makeSession()) {
    self.baseURL = baseURL
    self.session = session
  }

  /// An ephemeral session with cookies, caching, and connectivity waits turned off. Every API
  /// response is `Cache-Control: private, no-store`, so the app caches through `QueryClient`;
  /// failing fast offline lets screens show cached data with an offline error at once.
  public static func makeSession(timeout: TimeInterval = defaultTimeout) -> URLSession {
    URLSession(configuration: makeConfiguration(timeout: timeout))
  }

  /// The configuration `makeSession` uses; exposed so tests can add a `URLProtocol`.
  public static func makeConfiguration(timeout: TimeInterval = defaultTimeout)
    -> URLSessionConfiguration
  {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpCookieStorage = nil
    configuration.httpShouldSetCookies = false
    configuration.httpCookieAcceptPolicy = .never
    configuration.urlCache = nil
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.timeoutIntervalForRequest = timeout
    configuration.waitsForConnectivity = false
    return configuration
  }

  /// `POST <base>/api/rpc/<path>`.
  public func send(_ request: RPCRequest) async throws -> RPCResponse {
    try await send(
      HTTPRequest(
        method: "POST", path: "/api/rpc/\(request.path)", headers: request.headers,
        body: request.body))
  }

  public func send(_ request: HTTPRequest) async throws -> HTTPResponse {
    var urlRequest = URLRequest(url: url(for: request.path))
    urlRequest.httpMethod = request.method
    urlRequest.httpBody = request.body
    urlRequest.httpShouldHandleCookies = false
    for (name, value) in request.headers {
      urlRequest.setValue(value, forHTTPHeaderField: name)
    }
    let (data, response) = try await session.data(for: urlRequest)
    guard let http = response as? HTTPURLResponse else {
      throw URLError(.badServerResponse)
    }
    return HTTPResponse(
      status: http.statusCode, body: data, headers: Self.lowercasedHeaders(http.allHeaderFields))
  }

  /// `path` resolved against the base URL, keeping any path the base URL already has.
  func url(for path: String) -> URL {
    let trimmed = path.hasPrefix("/") ? String(path.dropFirst()) : path
    return baseURL.appending(path: trimmed)
  }

  /// Header names lowercased. `URLSession` joins repeated headers (several `Set-Cookie`
  /// lines) with commas; `DemoCookie` parses that form.
  static func lowercasedHeaders(_ fields: [AnyHashable: Any]) -> [String: String] {
    var headers: [String: String] = [:]
    for (name, value) in fields {
      guard let name = name as? String else { continue }
      headers[name.lowercased()] = value as? String ?? String(describing: value)
    }
    return headers
  }
}

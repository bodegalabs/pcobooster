import Foundation

/// One sign-in attempt: the start URL to open and the secrets to check the callback against.
/// Keep it in memory only for the attempt's lifetime.
public struct NativeSignInAttempt: Sendable, Hashable {
  /// `<base>/api/auth/native/start?redirect_uri&code_challenge&code_challenge_method&state`.
  public let startURL: URL
  /// `<scheme>://auth/callback`.
  public let redirectURI: URL
  /// The callback scheme to give `ASWebAuthenticationSession`.
  public let callbackScheme: String
  public let state: String
  public let pkce: PKCE
}

/// The person a sign-in produced, as `/api/auth/native/exchange` returns it.
public struct NativeSignInUser: Codable, Sendable, Hashable {
  public var id: String
  public var name: String
  public var email: String
  public var image: String?

  public init(id: String, name: String, email: String, image: String? = nil) {
    self.id = id
    self.name = name
    self.email = email
    self.image = image
  }
}

/// A completed sign-in.
public struct NativeSignInResult: Codable, Sendable, Hashable, CustomStringConvertible {
  /// The signed session token, sent raw as `Authorization: Bearer <token>` (it may contain
  /// `+`, `/`, and `=`).
  public var token: String
  public var user: NativeSignInUser
  /// The organization just signed in, or nil to use the person's first linked account.
  public var selectedAccountId: String?

  public init(token: String, user: NativeSignInUser, selectedAccountId: String?) {
    self.token = token
    self.user = user
    self.selectedAccountId = selectedAccountId
  }

  public var description: String {
    "NativeSignInResult(user: \(user.id), selectedAccountId: \(selectedAccountId ?? "nil"), token: redacted)"
  }
}

/// An `error` code the server can put on the redirect (`nativeSignInErrorCodes`). Unknown codes
/// are kept as `unknown` and read like `server_error`.
public enum NativeSignInCallbackError: RawRepresentable, Sendable, Hashable {
  case invalidRequest
  case accessDenied
  case signInExpired
  case emailNotFound
  case profileUnavailable
  case accountNotLinked
  case accountLinkedElsewhere
  case serverError
  case unknown(String)

  public init(rawValue: String) {
    switch rawValue {
    case "invalid_request": self = .invalidRequest
    case "access_denied": self = .accessDenied
    case "sign_in_expired": self = .signInExpired
    case "email_not_found": self = .emailNotFound
    case "profile_unavailable": self = .profileUnavailable
    case "account_not_linked": self = .accountNotLinked
    case "account_linked_elsewhere": self = .accountLinkedElsewhere
    case "server_error": self = .serverError
    default: self = .unknown(rawValue)
    }
  }

  public var rawValue: String {
    switch self {
    case .invalidRequest: "invalid_request"
    case .accessDenied: "access_denied"
    case .signInExpired: "sign_in_expired"
    case .emailNotFound: "email_not_found"
    case .profileUnavailable: "profile_unavailable"
    case .accountNotLinked: "account_not_linked"
    case .accountLinkedElsewhere: "account_linked_elsewhere"
    case .serverError: "server_error"
    case .unknown(let code): code
    }
  }
}

/// Why a sign-in did not finish.
public enum NativeSignInError: Error, Sendable, Hashable, UserFacingError {
  /// The person closed the sheet. Not an error to show.
  case cancelled
  /// The server redirected back with an `error` code.
  case callback(NativeSignInCallbackError)
  /// The callback's `state` is not this attempt's: it was not started here, or it is stale.
  case stateMismatch
  /// The callback URL is not `<scheme>://auth/callback` with a code or an error.
  case malformedCallback
  /// The code was unknown, used, expired, or the session ended (`INVALID_GRANT`).
  case invalidGrant
  /// Too many sign-in attempts from this network (30 a minute).
  case rateLimited
  /// Another server answer, with its status and `code` when it had one.
  case server(status: Int, code: String?)
  /// The exchange did not reach the server, or its answer was unreadable.
  case transport(APIError)

  public var userMessage: String {
    switch self {
    case .cancelled: "Sign-in was cancelled."
    case .callback(let code): Self.message(for: code)
    case .stateMismatch, .invalidGrant: Self.expiredMessage
    case .rateLimited: "Too many sign-in attempts. Wait a minute, then try again."
    case .malformedCallback, .server: Self.genericMessage
    case .transport(let error): error.userMessage
    }
  }

  /// The `error_code` for `sign in failed`; nil for cancellations.
  public var analyticsCode: String? {
    switch self {
    case .cancelled: nil
    case .callback(let code): code.rawValue
    case .stateMismatch: "state_mismatch"
    case .malformedCallback: "malformed_callback"
    case .invalidGrant: "invalid_grant"
    case .rateLimited: "rate_limited"
    case .server: "server_error"
    case .transport(let error): error.kind == .offline ? "offline" : "network_error"
    }
  }

  private static let expiredMessage = "That sign-in link expired. Please start again."
  private static let genericMessage =
    "Something went wrong signing in with Planning Center. Please try again."

  private static func message(for code: NativeSignInCallbackError) -> String {
    switch code {
    case .accessDenied:
      "Planning Center access wasn't granted. Try again when you're ready."
    case .signInExpired:
      expiredMessage
    case .emailNotFound:
      "Your Planning Center profile needs an email address to sign in."
    case .profileUnavailable:
      "We couldn't read your Planning Center profile. Please try again."
    case .accountNotLinked:
      "We couldn't add this Planning Center organization to your account. Please try again."
    case .accountLinkedElsewhere:
      "This Planning Center login is already connected to a different PCOBooster account."
    case .invalidRequest, .serverError, .unknown:
      genericMessage
    }
  }
}

/// The native sign-in (PR #255, `docs/native-auth.md`):
///
/// 1. `makeAttempt()` builds the start URL with a fresh PKCE pair and `state`.
/// 2. The app opens it in an ephemeral `ASWebAuthenticationSession` with the callback scheme.
/// 3. `complete(_:callbackURL:)` checks `state`, reads the code (or the server's error code),
///    and exchanges it at `POST /api/auth/native/exchange` for the bearer token.
///
/// `signIn(presenting:)` runs all three and reports `sign in started` and `sign in failed`.
/// `signOut(token:)` revokes a session (`POST /api/auth/sign-out`). Every request is cookieless.
public struct NativeSignIn: Sendable {
  public static let startPath = "/api/auth/native/start"
  public static let exchangePath = "/api/auth/native/exchange"
  public static let signOutPath = "/api/auth/sign-out"

  /// The product origin.
  public let baseURL: URL
  /// `pcobooster` in Release, `pcobooster-dev` in Debug (both allowlisted by the server).
  public let callbackScheme: String
  private let transport: any HTTPTransport
  private let clientInfo: ClientInfo
  private let analytics: any AnalyticsSink

  public init(
    baseURL: URL,
    callbackScheme: String,
    transport: any HTTPTransport,
    clientInfo: ClientInfo = .current(),
    analytics: any AnalyticsSink = NoAnalytics()
  ) {
    self.baseURL = baseURL
    self.callbackScheme = callbackScheme
    self.transport = transport
    self.clientInfo = clientInfo
    self.analytics = analytics
  }

  /// `<scheme>://auth/callback`, exactly as the server's allowlist spells it.
  public var redirectURI: URL {
    URL(string: "\(callbackScheme)://auth/callback") ?? URL(filePath: "/")
  }

  /// A new attempt with a fresh PKCE pair and a 43-character `state`.
  public func makeAttempt() -> NativeSignInAttempt {
    makeAttempt(pkce: .generate(), state: PKCE.randomURLSafeString(byteCount: 32))
  }

  func makeAttempt(pkce: PKCE, state: String) -> NativeSignInAttempt {
    var components = URLComponents(
      url: baseURL.appending(path: String(Self.startPath.dropFirst())),
      resolvingAgainstBaseURL: false)
    components?.queryItems = [
      URLQueryItem(name: "redirect_uri", value: redirectURI.absoluteString),
      URLQueryItem(name: "code_challenge", value: pkce.challenge),
      URLQueryItem(name: "code_challenge_method", value: PKCE.method),
      URLQueryItem(name: "state", value: state),
    ]
    return NativeSignInAttempt(
      startURL: components?.url ?? baseURL, redirectURI: redirectURI,
      callbackScheme: callbackScheme, state: state, pkce: pkce)
  }

  /// The code a callback carries for `attempt`. Throws the server's error code, a state
  /// mismatch, or a malformed callback.
  public func code(fromCallback url: URL, for attempt: NativeSignInAttempt) throws(NativeSignInError)
    -> String
  {
    guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
      components.scheme?.lowercased() == attempt.callbackScheme.lowercased(),
      components.host?.lowercased() == "auth", components.path == "/callback"
    else {
      throw .malformedCallback
    }
    let items = components.queryItems ?? []
    func item(_ name: String) -> String? {
      items.first { $0.name == name }?.value.flatMap { $0.isEmpty ? nil : $0 }
    }
    let state = item("state")
    if let error = item("error") {
      // The server leaves `state` off only when the one it received was itself invalid.
      if let state, state != attempt.state {
        throw .stateMismatch
      }
      throw .callback(NativeSignInCallbackError(rawValue: error))
    }
    guard state == attempt.state else { throw .stateMismatch }
    guard let code = item("code") else { throw .malformedCallback }
    return code
  }

  /// Checks the callback and exchanges its code for the session.
  public func complete(_ attempt: NativeSignInAttempt, callbackURL: URL) async throws(
    NativeSignInError
  ) -> NativeSignInResult {
    let code = try code(fromCallback: callbackURL, for: attempt)
    return try await exchange(code: code, verifier: attempt.pkce.verifier)
  }

  /// The whole flow. `authenticate` opens the start URL and returns the callback URL, for
  /// example:
  ///
  /// ```swift
  /// let result = try await signIn.signIn { url, scheme in
  ///   try await webAuthenticationSession.authenticate(
  ///     using: url, callback: .customScheme(scheme),
  ///     preferredBrowserSession: .ephemeral, additionalHeaderFields: [:])
  /// }
  /// await session.completeSignIn(result)
  /// ```
  ///
  /// A closed sheet (`ASWebAuthenticationSessionError.canceledLogin`) or a cancelled task
  /// throws `.cancelled`.
  public func signIn(
    presenting authenticate: @Sendable (_ startURL: URL, _ callbackScheme: String) async throws ->
      URL
  ) async throws(NativeSignInError) -> NativeSignInResult {
    analytics.capture(.signInStarted)
    let attempt = makeAttempt()
    do throws(NativeSignInError) {
      let callbackURL: URL
      do {
        callbackURL = try await authenticate(attempt.startURL, attempt.callbackScheme)
      } catch {
        throw Self.isCancellation(error) ? NativeSignInError.cancelled : .malformedCallback
      }
      return try await complete(attempt, callbackURL: callbackURL)
    } catch {
      if let code = error.analyticsCode {
        analytics.capture(.signInFailed(errorCode: code))
      }
      throw error
    }
  }

  /// Exchanges a callback code and the attempt's verifier for the session.
  public func exchange(code: String, verifier: String) async throws(NativeSignInError)
    -> NativeSignInResult
  {
    struct Body: Encodable {
      let code: String
      let codeVerifier: String
    }
    let body: Data
    do {
      body = try JSONEncoder().encode(Body(code: code, codeVerifier: verifier))
    } catch {
      throw .malformedCallback
    }
    let response = try await send(
      HTTPRequest(method: "POST", path: Self.exchangePath, headers: headers(), body: body))
    switch response.status {
    case 200..<300:
      do {
        return try JSONDecoder().decode(NativeSignInResult.self, from: response.body)
      } catch {
        throw .transport(
          APIError(
            kind: .decoding, status: response.status, message: APIError.decodingMessage,
            procedure: Self.exchangePath, detail: String(describing: error)))
      }
    case 429:
      throw .rateLimited
    default:
      let code = Self.errorCode(in: response.body)
      if code == "INVALID_GRANT" {
        throw .invalidGrant
      }
      throw .server(status: response.status, code: code)
    }
  }

  /// Revokes the session `token` names. A session that is already gone counts as signed out.
  public func signOut(token: String) async throws(NativeSignInError) {
    var headers = headers()
    headers[APIHeader.authorization] = "Bearer \(token)"
    let response = try await send(
      HTTPRequest(
        method: "POST", path: Self.signOutPath, headers: headers, body: Data("{}".utf8)))
    switch response.status {
    case 200..<300, 401:
      return
    case 429:
      throw .rateLimited
    default:
      throw .server(status: response.status, code: Self.errorCode(in: response.body))
    }
  }

  // MARK: - HTTP

  private func headers() -> [String: String] {
    [
      APIHeader.contentType: "application/json",
      APIHeader.accept: "application/json",
      APIHeader.userAgent: clientInfo.userAgent,
      APIHeader.client: clientInfo.clientHeader,
      APIHeader.requestID: UUID().uuidString.lowercased(),
    ]
  }

  private func send(_ request: HTTPRequest) async throws(NativeSignInError) -> HTTPResponse {
    do {
      return try await transport.send(request)
    } catch {
      guard
        let failure = APIError.transportFailure(
          error, procedure: request.path, requestID: request.headers[APIHeader.requestID])
      else {
        throw .cancelled
      }
      throw .transport(failure)
    }
  }

  private static func errorCode(in body: Data) -> String? {
    (try? JSONDecoder().decode(JSONValue.self, from: body))?["code"]?.stringValue
  }

  /// `ASWebAuthenticationSessionError.canceledLogin`, matched by domain so the package needs
  /// no AuthenticationServices import, or a cancelled task.
  private static func isCancellation(_ error: any Error) -> Bool {
    if error.isCancellation { return true }
    let nsError = error as NSError
    return nsError.domain == "com.apple.AuthenticationServices.WebAuthenticationSession"
      && nsError.code == 1
  }
}

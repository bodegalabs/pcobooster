import Foundation

/// An error with copy a person can read. Show `userMessage` in toasts and error states.
public protocol UserFacingError: Error {
  var userMessage: String { get }
}

extension Error {
  /// Copy for this error: `UserFacingError.userMessage` when it has one, else a calm generic
  /// line. Never shows raw system errors.
  public var userFacingMessage: String {
    (self as? any UserFacingError)?.userMessage ?? APIError.genericMessage
  }

  /// Whether this is a cancellation (a task or request that was given up on), which is never
  /// shown or reported.
  public var isCancellation: Bool {
    if self is CancellationError { return true }
    if let urlError = self as? URLError, urlError.code == .cancelled { return true }
    return false
  }
}

/// Every failure `RPCClient` throws, apart from `CancellationError`.
///
/// - `.response`: the API (or something in front of it) answered with an error status. `code` is
///   the oRPC code (`ContractErrorCode`, `unknown` for undeclared codes); for non-oRPC bodies it is
///   derived from the status. `message` prefers `data.message`, which the API writes for people.
/// - `.offline`: no network at all; cached data stays on screen.
/// - `.network`: the request failed on the way (timeout, lost connection, TLS).
/// - `.decoding`: a 2xx body did not match the generated model. Treated as retryable: it is
///   usually a truncated body or an edge page, and the web retries it too.
public struct APIError: Error, Sendable, Hashable, UserFacingError, CustomStringConvertible {
  public enum Kind: String, Sendable, Hashable {
    case response
    case offline
    case network
    case decoding
  }

  public let kind: Kind
  /// The oRPC error code; nil for offline, network, and decoding failures.
  public let code: ContractErrorCode?
  /// The HTTP status; nil when no response arrived.
  public let status: Int?
  /// Copy to show: `data.message`, else the error's `message`, else a generic line.
  public let message: String
  /// The error's `data`, decoded per code with `data(as:)` (for example
  /// `SchedulePositionMismatchErrorData`).
  public let data: JSONValue?
  /// Whether the procedure declares this code and `data` matched its schema.
  public let defined: Bool
  /// The procedure path, for example `schedule/assign`.
  public let procedure: String?
  /// The `x-request-id` sent, to find the call in Workers Logs.
  public let requestID: String?
  /// Diagnostics for logs (a decoding error description); never shown.
  public let detail: String?

  public init(
    kind: Kind,
    code: ContractErrorCode? = nil,
    status: Int? = nil,
    message: String,
    data: JSONValue? = nil,
    defined: Bool = false,
    procedure: String? = nil,
    requestID: String? = nil,
    detail: String? = nil
  ) {
    self.kind = kind
    self.code = code
    self.status = status
    self.message = message
    self.data = data
    self.defined = defined
    self.procedure = procedure
    self.requestID = requestID
    self.detail = detail
  }

  public var userMessage: String { message }

  /// The session is missing, expired, or revoked: sign in again.
  public var isUnauthorized: Bool {
    code == .unauthorized || status == 401
  }

  /// A later attempt may succeed: server errors (5xx), rate limits (429), network and offline
  /// failures, and undecodable bodies. Use it to offer Retry.
  public var isRetryable: Bool {
    switch kind {
    case .offline, .network, .decoding: true
    case .response: (status ?? 0) >= 500 || code == .tooManyRequests
    }
  }

  /// Whether a read retries once on its own (`retryTransientReadFailure`): server errors,
  /// network failures, and undecodable bodies. Never 4xx, including 429: those come back the
  /// same and would spend more of the shared Planning Center budget. Never while offline.
  public var shouldRetryAutomatically: Bool {
    switch kind {
    case .network, .decoding: true
    case .offline: false
    case .response: (status ?? 0) >= 500
    }
  }

  /// How long the API asked to wait (`TOO_MANY_REQUESTS` `data.retryAfterSeconds`).
  public var retryAfter: Duration? {
    guard let seconds = data?["retryAfterSeconds"]?.doubleValue, seconds.isFinite, seconds >= 0
    else {
      return nil
    }
    return .milliseconds(Int64((seconds * 1000).rounded()))
  }

  /// `data` decoded as `type`, or nil when it is absent or has another shape.
  public func data<Payload: Decodable>(as type: Payload.Type) -> Payload? {
    try? data?.decode(type)
  }

  public var description: String {
    var parts = ["APIError.\(kind.rawValue)"]
    if let code { parts.append(code.rawValue) }
    if let status { parts.append("status \(status)") }
    if let procedure { parts.append(procedure) }
    parts.append("\"\(message)\"")
    if let requestID { parts.append("request \(requestID)") }
    return parts.joined(separator: " ")
  }

  // MARK: - Copy

  static let genericMessage = "Something went wrong. Please try again."
  static let offlineMessage = "You're offline. Check your connection and try again."
  static let networkMessage = "Couldn't reach PCOBooster. Check your connection and try again."
  static let decodingMessage = "PCOBooster sent something unexpected. Please try again."

  /// Copy for a status when the body carries no message.
  static func fallbackMessage(status: Int) -> String {
    switch status {
    case 401: "Sign in to continue."
    case 403: "You don't have access to that."
    case 404: "That couldn't be found."
    case 409: "That changed while you were editing. Refresh and try again."
    case 429: "Planning Center is busy right now. Try again in a moment."
    case 500...: "Something went wrong on our end. Please try again."
    default: genericMessage
    }
  }

  /// The contract code a bare status stands for, for bodies that are not oRPC errors.
  static func code(forStatus status: Int) -> ContractErrorCode {
    switch status {
    case 400: .badRequest
    case 401: .unauthorized
    case 403: .forbidden
    case 404: .notFound
    case 409: .conflict
    case 429: .tooManyRequests
    case 502: .badGateway
    case 500: .internalServerError
    default: .unknown("HTTP_\(status)")
    }
  }

  // MARK: - Transport failures

  /// Classifies a transport error. Returns nil for cancellations, which callers rethrow as
  /// `CancellationError`.
  static func transportFailure(
    _ error: any Error, procedure: String?, requestID: String?
  ) -> APIError? {
    if error.isCancellation { return nil }
    guard let urlError = error as? URLError else {
      return APIError(
        kind: .network, message: networkMessage, procedure: procedure, requestID: requestID,
        detail: String(describing: error))
    }
    switch urlError.code {
    case .notConnectedToInternet, .dataNotAllowed, .internationalRoamingOff, .callIsActive:
      return APIError(
        kind: .offline, message: offlineMessage, procedure: procedure, requestID: requestID,
        detail: "URLError \(urlError.code.rawValue)")
    default:
      return APIError(
        kind: .network, message: networkMessage, procedure: procedure, requestID: requestID,
        detail: "URLError \(urlError.code.rawValue)")
    }
  }
}

import Foundation
import Synchronization

/// What one request is authenticated with.
public struct RequestCredentials: Sendable, Hashable, CustomStringConvertible {
  /// The signed Better Auth session token (`<token>.<signature>`), sent as
  /// `Authorization: Bearer`.
  public var bearerToken: String?
  /// The selected Planning Center account, sent as `x-pcobooster-account`.
  public var planningCenterAccountID: String?
  /// The demo token, sent as `x-pcobooster-demo`.
  public var demoToken: String?

  public init(
    bearerToken: String? = nil, planningCenterAccountID: String? = nil, demoToken: String? = nil
  ) {
    self.bearerToken = bearerToken
    self.planningCenterAccountID = planningCenterAccountID
    self.demoToken = demoToken
  }

  /// No credentials: signed out, or the local `bun run dev` PAT bypass.
  public static let none = RequestCredentials()

  public var description: String {
    "RequestCredentials(bearer: \(bearerToken == nil ? "none" : "redacted"), "
      + "account: \(planningCenterAccountID ?? "none"), "
      + "demo: \(demoToken == nil ? "none" : "redacted"))"
  }
}

/// The credentials `RPCClient` reads for every request, safe to read from any thread.
/// `SessionStore` owns and updates it; the client reports `401` answers back through it, with
/// the credentials that request carried, so a response for an account the person already left
/// cannot sign out the current one.
public final class SessionCredentials: Sendable {
  private struct State {
    var current: RequestCredentials
    var onUnauthorized: (@Sendable (RequestCredentials) -> Void)?
  }

  private let state: Mutex<State>

  public init(_ initial: RequestCredentials = .none) {
    state = Mutex(State(current: initial))
  }

  public var current: RequestCredentials {
    state.withLock { $0.current }
  }

  public func update(_ credentials: RequestCredentials) {
    state.withLock { $0.current = credentials }
  }

  /// Called with the credentials of every request the API answered with `UNAUTHORIZED`.
  public func setUnauthorizedHandler(_ handler: (@Sendable (RequestCredentials) -> Void)?) {
    state.withLock { $0.onUnauthorized = handler }
  }

  func reportUnauthorized(_ credentials: RequestCredentials) {
    let handler = state.withLock { $0.onUnauthorized }
    handler?(credentials)
  }
}

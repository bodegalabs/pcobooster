import Foundation
import Observation
import os

/// Who the app is signed in as, persisted in the Keychain, and the credentials every request
/// carries.
///
/// - Several people can be remembered on one device (up to four, like the web's device
///   accounts); one is active. Switching between them is local, with no server call.
/// - Each person has a selected Planning Center organization, sent as `x-pcobooster-account`.
/// - A demo session (from a demo link) takes precedence while it lasts.
/// - An `UNAUTHORIZED` answer for the active token marks that person `needsSignIn`.
///
/// Changing who or which organization (`queryScope`) calls `onScopeChange`, which
/// `AppServices` wires to `QueryClient.switchScope`, so caches never cross accounts.
@MainActor
@Observable
public final class SessionStore {
  public enum Phase: Sendable, Hashable {
    /// Nobody is signed in; `accounts` may still list people to resume.
    case signedOut
    case signedIn(DeviceAccount)
    /// The active person's session ended (7 idle days, or revoked): sign in again.
    case needsSignIn(DeviceAccount)
    case demo(DemoCredential)
    /// Local `bun run dev` (the API signs in with a PAT, no token needed) or mock data.
    case developmentBypass
  }

  public private(set) var phase: Phase = .signedOut
  public private(set) var stored: StoredSession

  /// Called with the new scope whenever the account context changes.
  @ObservationIgnored public var onScopeChange: (@MainActor (QueryScope) -> Void)?

  @ObservationIgnored public let credentials: SessionCredentials
  @ObservationIgnored private let store: CredentialStore
  @ObservationIgnored private let rpc: RPCClient?
  @ObservationIgnored private let signIn: NativeSignIn?
  @ObservationIgnored private let now: @Sendable () -> Date
  @ObservationIgnored private var developmentBypass = false

  private static let logger = Logger(subsystem: "com.pcobooster.core", category: "session")

  /// - Parameters:
  ///   - store: The Keychain-backed store; its saved session is loaded now.
  ///   - credentials: The credentials `rpc` reads; this store keeps them current.
  ///   - rpc: For the demo, organization switching, and the development check.
  ///   - signIn: For revoking sessions on sign-out.
  public init(
    store: CredentialStore,
    credentials: SessionCredentials,
    rpc: RPCClient? = nil,
    signIn: NativeSignIn? = nil,
    now: @escaping @Sendable () -> Date = { Date() }
  ) {
    self.store = store
    self.credentials = credentials
    self.rpc = rpc
    self.signIn = signIn
    self.now = now
    stored = store.load()
    phase = derivePhase()
    credentials.update(deriveCredentials())
    credentials.setUnauthorizedHandler { [weak self] sent in
      Task { @MainActor in self?.handleUnauthorized(sent) }
    }
  }

  // MARK: - Reading

  /// Remembered people, most recently used first.
  public var accounts: [DeviceAccount] { stored.accounts }

  /// The active person, signed in or needing to sign in again.
  public var activeAccount: DeviceAccount? {
    switch phase {
    case .signedIn(let account), .needsSignIn(let account): account
    default: nil
    }
  }

  /// Requests can be made: signed in, demo, or the development bypass.
  public var isAuthenticated: Bool {
    switch phase {
    case .signedIn, .demo, .developmentBypass: true
    case .signedOut, .needsSignIn: false
    }
  }

  public var isDemo: Bool {
    if case .demo = phase { true } else { false }
  }

  /// The account context for caches.
  public var queryScope: QueryScope {
    switch phase {
    case .signedOut: .signedOut
    case .signedIn(let account), .needsSignIn(let account):
      .account(
        userID: account.userID, planningCenterAccountID: account.selectedPlanningCenterAccountID)
    case .demo: .demo
    case .developmentBypass: .development
    }
  }

  // MARK: - Signing in and out

  /// Saves a completed sign-in and makes that person active. Signing in again as a remembered
  /// person replaces their token (the old session is revoked); a fifth person drops the least
  /// recently used one (also revoked). Ends a demo.
  public func completeSignIn(_ result: NativeSignInResult) async {
    let existing = stored.accounts.first { $0.userID == result.user.id }
    let selected = result.selectedAccountId ?? existing?.selectedPlanningCenterAccountID
    let account = DeviceAccount(
      userID: result.user.id,
      name: result.user.name,
      email: result.user.email,
      imageURL: result.user.image.flatMap(URL.init(string:)),
      token: result.token,
      selectedPlanningCenterAccountID: selected,
      organizationName: selected == existing?.selectedPlanningCenterAccountID
        ? existing?.organizationName : nil,
      lastUsedAt: now())
    var next = stored
    next.demo = nil
    var revoked = next.upsert(account).map(\.token)
    if let existing, existing.token != result.token {
      revoked.append(existing.token)
    }
    next.activeUserID = account.userID
    developmentBypass = false
    apply(next)
    await revoke(revoked)
  }

  /// Makes a remembered person active, without a server call.
  public func switchAccount(to userID: String) {
    guard stored.accounts.contains(where: { $0.userID == userID }) else { return }
    var next = stored
    next.demo = nil
    next.update(userID: userID) { $0.lastUsedAt = now() }
    next.accounts.sort { $0.lastUsedAt > $1.lastUsedAt }
    next.activeUserID = userID
    apply(next)
  }

  /// Signs the active person out of this device: revokes their session and forgets them. Ends
  /// a demo or the development bypass instead when one is active.
  public func signOut() async {
    switch phase {
    case .demo:
      await exitDemo()
    case .developmentBypass:
      developmentBypass = false
      apply(stored)
    case .signedIn(let account), .needsSignIn(let account):
      await remove(userID: account.userID)
    case .signedOut:
      break
    }
  }

  /// Forgets a remembered person and revokes their session.
  public func remove(userID: String) async {
    var next = stored
    guard let removed = next.remove(userID: userID) else { return }
    apply(next)
    await revoke([removed.token])
  }

  // MARK: - Organizations

  /// Switches the active person to another of their Planning Center organizations through
  /// `accounts.select` (which checks the account belongs to them), then clears the caches.
  public func switchOrganization(to accountID: String) async throws {
    guard let rpc, let account = activeAccount else { return }
    let result = try await rpc.call(RPC.Accounts.select, AccountsSelectInput(accountId: accountID))
    guard activeAccount?.userID == account.userID else { return }
    var next = stored
    next.update(userID: account.userID) {
      $0.selectedPlanningCenterAccountID = result.selectedAccountId
      $0.organizationName = nil
    }
    apply(next)
  }

  /// Updates the active person's profile and organization from `accounts.list`. The server
  /// reports the organization it actually used (it falls back to the first linked one when the
  /// stored id is unknown), so that becomes the selection.
  public func refresh(from response: PlanningCenterAccounts) {
    guard !response.demo, let account = activeAccount,
      account.userID == response.session.userId
    else {
      return
    }
    let selected = response.selectedAccountId ?? account.selectedPlanningCenterAccountID
    let organization = response.accounts.first { $0.id == selected }?.identity?.organizationName
    var next = stored
    next.update(userID: account.userID) {
      $0.name = response.session.name
      $0.email = response.session.email
      $0.imageURL = response.session.image.flatMap(URL.init(string:))
      $0.selectedPlanningCenterAccountID = selected
      $0.organizationName = organization ?? $0.organizationName
    }
    guard next != stored else { return }
    apply(next)
  }

  // MARK: - Demo

  /// Starts a read-only demo session from a demo link key (`pcobooster://demo/<key>` or a
  /// pasted link). Throws when the key is not valid (`NOT_FOUND`) or no token came back.
  public func startDemo(key: String) async throws {
    guard let rpc else { return }
    let result = try await rpc.callWithHeaders(RPC.Demo.start, DemoStartInput(key: key))
    let url = signIn?.baseURL ?? Self.defaultCookieURL
    guard result.output.demo, let token = DemoCookie.token(fromHeaders: result.headers, url: url)
    else {
      throw APIError(
        kind: .response, code: .notFound, status: 404,
        message: "That demo link isn't valid anymore.", procedure: RPC.Demo.start.path)
    }
    var next = stored
    next.demo = DemoCredential(token: token, startedAt: now())
    apply(next)
  }

  /// Ends the demo and returns to the remembered person, if any.
  public func exitDemo() async {
    guard stored.demo != nil else { return }
    if let rpc {
      _ = try? await rpc.call(RPC.Demo.exit)
    }
    var next = stored
    next.demo = nil
    apply(next)
  }

  // MARK: - Development

  /// With nobody signed in, asks `session.status` whether the API signs requests in on its own
  /// (local `bun run dev` with the PAT bypass) and, if so, enters `developmentBypass`. Only
  /// call for development builds against a local API.
  public func checkDevelopmentBypass() async {
    guard case .signedOut = phase, let rpc else { return }
    guard let status = try? await rpc.call(RPC.Session.status), status.authenticated else { return }
    enterDevelopmentBypass()
  }

  /// Enters `developmentBypass` when nobody is signed in (mock data, previews, local dev).
  public func enterDevelopmentBypass() {
    guard case .signedOut = phase else { return }
    developmentBypass = true
    apply(stored)
  }

  // MARK: - Session expiry

  /// An `UNAUTHORIZED` answer: if it was for the active token, that person must sign in again;
  /// if it was for the demo token, the demo ended.
  public func handleUnauthorized(_ sent: RequestCredentials) {
    switch phase {
    case .signedIn(let account) where sent.bearerToken == account.token && sent.demoToken == nil:
      var next = stored
      next.update(userID: account.userID) { $0.needsSignIn = true }
      apply(next)
    case .demo(let demo) where sent.demoToken == demo.token:
      var next = stored
      next.demo = nil
      apply(next)
    case .developmentBypass where sent.bearerToken == nil && sent.demoToken == nil:
      // The local API no longer signs requests in on its own.
      developmentBypass = false
      apply(stored)
    default:
      break
    }
  }

  // MARK: - State

  private static let defaultCookieURL = URL(string: "https://pcobooster.com/")!

  private func apply(_ next: StoredSession) {
    let previousScope = queryScope
    if next != stored {
      stored = next
      do {
        try store.save(next)
      } catch {
        Self.logger.error("Saving the session failed: \(String(describing: error), privacy: .public)")
      }
    }
    phase = derivePhase()
    credentials.update(deriveCredentials())
    let scope = queryScope
    if scope != previousScope {
      onScopeChange?(scope)
    }
  }

  private func derivePhase() -> Phase {
    if let demo = stored.demo {
      return .demo(demo)
    }
    if let account = stored.activeAccount {
      return account.needsSignIn ? .needsSignIn(account) : .signedIn(account)
    }
    return developmentBypass ? .developmentBypass : .signedOut
  }

  private func deriveCredentials() -> RequestCredentials {
    switch phase {
    case .signedIn(let account):
      RequestCredentials(
        bearerToken: account.token,
        planningCenterAccountID: account.selectedPlanningCenterAccountID)
    case .demo(let demo):
      RequestCredentials(demoToken: demo.token)
    case .signedOut, .needsSignIn, .developmentBypass:
      .none
    }
  }

  /// Revokes sessions this device no longer holds; failures are logged, never shown (the
  /// session ages out after 7 days regardless).
  private func revoke(_ tokens: [String]) async {
    guard let signIn else { return }
    for token in tokens {
      do {
        try await signIn.signOut(token: token)
      } catch {
        Self.logger.info("Revoking a session failed: \(String(describing: error), privacy: .public)")
      }
    }
  }
}

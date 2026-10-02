import AuthenticationServices
import Foundation
import Observation
import PCOBoosterCore
import SwiftUI
import os

#if DEBUG
import PCOBoosterMock
#endif

/// The app's root state, injected at the window with `.environment(app)` and read with
/// `@Environment(AppModel.self) private var app`.
///
/// It owns the runtime (`services`: RPC client, query cache, session), the shared per-account
/// reads (`account`), navigation (`router`), error toasts (`toasts`), analytics, connectivity,
/// and the appearance override, and it runs the session flows: launch, sign-in, account
/// switching, the demo, and sign-out.
@MainActor
@Observable
final class AppModel {
  /// Which top-level screen the window shows.
  enum SessionState: Equatable {
    /// Restoring the session or loading the first feature flags (the brand splash).
    case launching
    /// The sign-in screen; `expired` is the person whose session ended, for a gentle notice.
    case signedOut(expired: DeviceAccount?)
    /// The sign-in screen while Planning Center sign-in runs.
    case signingIn
    case signedIn
    case demo
  }

  /// Progress of a sign-in started from the sign-in screen or the account sheet.
  enum SignInActivity: Equatable {
    case idle
    /// The Planning Center sheet is open or the code is being exchanged. `userID` is the
    /// remembered person being resumed, if any.
    case authenticating(userID: String?)
    /// Signed in; the rocket launches away before the app appears.
    case launching(userID: String?)
  }

  let configuration: AppConfiguration
  let launchOptions: LaunchOptions
  let services: AppServices
  let toasts = ToastCenter()
  let router = AppRouter()
  let network = NetworkMonitor()
  let analytics: PostHogAnalytics
  /// "Now" for relative labels; pinned by `-PCOBFixedNow YES`.
  let clock: AppClock

  /// The shared reads for the current account context; nil when nobody is signed in.
  private(set) var account: AccountContext? = nil
  private(set) var signInActivity: SignInActivity = .idle
  /// Sign-in error copy for the sign-in screen.
  var signInMessage: String? = nil
  private(set) var isSigningOut = false
  /// A demo link opened while signed in, waiting for confirmation.
  var pendingDemoKey: String? = nil
  /// The feedback text, kept while the sheet is closed.
  var feedbackDraft = ""

  var appearance: AppAppearance {
    didSet {
      guard appearance != oldValue else { return }
      defaults.set(appearance.rawValue, forKey: AppAppearance.defaultsKey)
    }
  }

  var analyticsOptedOut: Bool {
    didSet {
      guard analyticsOptedOut != oldValue else { return }
      defaults.set(analyticsOptedOut, forKey: PostHogAnalytics.optOutKey)
      analytics.setOptedOut(analyticsOptedOut)
      if !analyticsOptedOut, let account, case .signedIn = session.phase,
        let user = account.accounts.value, !user.demo
      {
        analytics.identify(userID: user.session.userId)
      }
    }
  }

  @ObservationIgnored private let defaults: UserDefaults
  @ObservationIgnored private var hasLaunched: Bool
  @ObservationIgnored private var pendingLink: AppLink?
  @ObservationIgnored private var lastOpenedUserID: String?
  @ObservationIgnored private var accountsTask: Task<Void, Never>?
  @ObservationIgnored private var preparationTask: Task<Void, Never>?
  private var isPreparing: Bool

  private static let logger = Logger(subsystem: "com.pcobooster.ios", category: "app")
  /// How long the splash waits for the first feature flags before showing Services alone.
  static let featureWait: Duration = .milliseconds(1500)
  /// The shortest splash, so its rocket finishes taking off instead of flashing.
  static let minimumSplash: Duration = .milliseconds(650)
  /// The rocket's launch-away before the app replaces the sign-in screen.
  static let launchAwayDelay: Duration = .milliseconds(450)

  /// - Parameters:
  ///   - services: The runtime; build it with the same `analytics` so the client's workflow and
  ///     read events reach PostHog.
  ///   - analytics: The PostHog adapter.
  init(
    configuration: AppConfiguration,
    services: AppServices,
    analytics: PostHogAnalytics,
    launchOptions: LaunchOptions = .none,
    clock: AppClock = .live,
    defaults: UserDefaults = .standard
  ) {
    self.configuration = configuration
    self.services = services
    self.analytics = analytics
    self.launchOptions = launchOptions
    self.clock = clock
    self.defaults = defaults
    analyticsOptedOut = defaults.bool(forKey: PostHogAnalytics.optOutKey)
    appearance = launchOptions.appearance
      ?? defaults.string(forKey: AppAppearance.defaultsKey).flatMap(AppAppearance.init) ?? .system
    hasLaunched = false
    isPreparing = true

    services.queries.errorSink = { [weak self] failure in
      self?.toasts.showError(failure.message)
    }
    let switchScope = services.session.onScopeChange
    services.session.onScopeChange = { [weak self] scope in
      switchScope?(scope)
      self?.scopeDidChange(scope)
    }
    network.onReconnect = { [weak self] in
      self?.queries.refetchStale()
    }
    if session.isAuthenticated {
      account = makeAccountContext()
    }
    if let tab = launchOptions.tab {
      router.selectedTab = tab
    }
    pendingLink = launchOptions.route.flatMap(AppLink.parse(path:))
    // Skip the splash when nothing needs waiting for: signed out, or the flags are on disk.
    isPreparing = needsDevelopmentCheck || (account != nil && account?.features.value == nil)
    hasLaunched = !isPreparing
  }

  /// The production wiring, or mock data in Debug with `-PCOBMock YES`.
  static func live() throws(AppConfigurationError) -> AppModel {
    let configuration = try AppConfiguration.load()
    let options = LaunchOptions.current()
    let optedOut = UserDefaults.standard.bool(forKey: PostHogAnalytics.optOutKey)
    let analytics = PostHogAnalytics(configuration: configuration, optedOut: optedOut)
    #if DEBUG
    if configuration.usesMockData {
      let now = options.fixedNow ? MockFixtures.anchorNow : Date()
      let clock: AppClock = options.fixedNow ? .fixed(now) : .live
      let services = MockServices.make(configuration: configuration, options: options, now: now)
      return AppModel(
        configuration: configuration, services: services, analytics: analytics,
        launchOptions: options, clock: clock)
    }
    #endif
    let services = AppServices.live(configuration: configuration, analytics: analytics)
    return AppModel(
      configuration: configuration, services: services, analytics: analytics,
      launchOptions: options)
  }

  // MARK: - Shortcuts

  var rpc: RPCClient { services.rpc }
  var queries: QueryClient { services.queries }
  var session: SessionStore { services.session }

  // MARK: - Derived state

  var state: SessionState {
    if isPreparing { return .launching }
    switch session.phase {
    case .signedIn, .developmentBypass:
      return .signedIn
    case .demo:
      return .demo
    case .signedOut:
      return isAuthenticatingFromSignIn ? .signingIn : .signedOut(expired: nil)
    case .needsSignIn(let account):
      return isAuthenticatingFromSignIn ? .signingIn : .signedOut(expired: account)
    }
  }

  var capabilities: AppCapabilities {
    AppCapabilities(
      features: account?.features.value, access: account?.access.value, isDemo: session.isDemo)
  }

  var visibleTabs: [AppTab] { capabilities.visibleTabs }

  /// The congregation's zone for date labels (also in `@Environment(\.orgTimeZone)`).
  var timeZone: String { account?.timeZone ?? OrganizationTimeZone.lastResort }

  /// Who to show in the toolbar avatar and the account sheet.
  var identity: Identity? {
    if session.isDemo { return nil }
    if let list = account?.accounts.value, !list.demo {
      return Identity(
        name: list.session.name, email: list.session.email,
        imageURL: list.session.image.flatMap(URL.init(string:)))
    }
    if let active = session.activeAccount {
      return Identity(name: active.name, email: active.email, imageURL: active.imageURL)
    }
    return nil
  }

  struct Identity: Equatable {
    var name: String
    var email: String
    var imageURL: URL?
  }

  /// Whether Planning Center sign-in is running from the sign-in screen (not the account sheet).
  private var isAuthenticatingFromSignIn: Bool {
    signInActivity != .idle && !session.isAuthenticated
  }

  private var needsDevelopmentCheck: Bool {
    configuration.environment == .development && configuration.isLocalAPI
      && !configuration.usesMockData && session.phase == .signedOut
  }

  // MARK: - Launch and lifecycle

  /// Run once from the root view: restores the development session, waits briefly for the
  /// first feature flags, then reveals the app and opens any launch link.
  func launch() async {
    #if DEBUG
    if launchOptions.simulatesOffline {
      network.simulateOffline()
    }
    #endif
    network.start()
    guard !hasLaunched else {
      applyPendingLink()
      return
    }
    let started = ContinuousClock.now
    if needsDevelopmentCheck {
      await services.prepareSession()
    }
    if let account {
      await waitForFeatures(account)
    }
    let elapsed = ContinuousClock.now - started
    if elapsed < Self.minimumSplash {
      try? await Task.sleep(for: Self.minimumSplash - elapsed)
    }
    hasLaunched = true
    reveal()
  }

  func scenePhaseChanged(_ phase: ScenePhase) {
    switch phase {
    case .active:
      queries.refetchStale()
    case .background:
      Task { await queries.flushPersistence() }
    default:
      break
    }
  }

  // MARK: - Links

  /// `onOpenURL`: demo links and app paths; anything else is ignored.
  func open(_ url: URL) {
    guard let link = AppLink.parse(url, scheme: configuration.urlScheme) else {
      Self.logger.info("Ignored an unknown link")
      return
    }
    handle(link)
  }

  func handle(_ link: AppLink) {
    switch link {
    case .demo(let key):
      if case .signedIn = state, !session.isDemo {
        pendingDemoKey = key
      } else {
        Task { await openDemo(key: key) }
      }
    case .tab, .routes, .account:
      pendingLink = link
      applyPendingLink()
    }
  }

  private func applyPendingLink() {
    guard hasLaunched, !isPreparing, session.isAuthenticated, let link = pendingLink else { return }
    pendingLink = nil
    switch link {
    case .tab(let tab):
      router.show(visibleTabs.contains(tab) ? tab : .services)
    case .routes(let tab, let routes):
      router.show(visibleTabs.contains(tab) ? tab : .services, path: routes)
    case .account:
      router.presentAccount()
    case .demo:
      break
    }
  }

  // MARK: - Sign-in

  /// Signs in with Planning Center in an ephemeral web session (or resumes `account`, whose
  /// session ended). From the sign-in screen the rocket launches away first; from the account
  /// sheet (`addingAccount`) the new person becomes active directly.
  func signIn(
    using webAuth: WebAuthenticationSession, resuming account: DeviceAccount? = nil,
    addingAccount: Bool = false
  ) async {
    guard signInActivity == .idle else { return }
    signInMessage = nil
    signInActivity = .authenticating(userID: account?.userID)
    do {
      let result = try await authenticate(using: webAuth)
      if !addingAccount {
        signInActivity = .launching(userID: account?.userID)
        try? await Task.sleep(for: Self.launchAwayDelay)
      }
      let scopeBefore = queries.scope
      await session.completeSignIn(result)
      if queries.scope == scopeBefore {
        // Same person and organization again: keep the cache, reload what failed.
        queries.invalidate([.all])
      }
    } catch NativeSignInError.cancelled {
      // Closing the sheet is not an error.
    } catch {
      let message = error.userFacingMessage
      if addingAccount {
        toasts.showError(message)
      } else {
        signInMessage = message
      }
    }
    signInActivity = .idle
  }

  /// Continues as a remembered person: locally when their session is still valid, otherwise
  /// through Planning Center.
  func continueAs(_ account: DeviceAccount, using webAuth: WebAuthenticationSession) async {
    guard !account.needsSignIn else {
      await signIn(using: webAuth, resuming: account)
      return
    }
    guard signInActivity == .idle else { return }
    signInMessage = nil
    signInActivity = .launching(userID: account.userID)
    try? await Task.sleep(for: Self.launchAwayDelay)
    session.switchAccount(to: account.userID)
    signInActivity = .idle
  }

  private func authenticate(using webAuth: WebAuthenticationSession) async throws
    -> NativeSignInResult
  {
    #if DEBUG
    if configuration.usesMockData {
      try await Task.sleep(for: .milliseconds(500))
      return MockServices.signInResult()
    }
    #endif
    return try await services.signIn.signIn { url, scheme in
      try await webAuth.authenticate(
        using: url, callback: .customScheme(scheme), preferredBrowserSession: .ephemeral,
        additionalHeaderFields: [:])
    }
  }

  // MARK: - Accounts

  /// Makes another remembered person active (no server call). The app rebuilds for them.
  func switchAccount(to userID: String) {
    guard userID != session.activeAccount?.userID || session.isDemo else { return }
    session.switchAccount(to: userID)
  }

  /// Forgets a remembered person on this device and revokes their session.
  func forget(_ account: DeviceAccount) async {
    await session.remove(userID: account.userID)
  }

  /// Switches the signed-in person to another of their Planning Center organizations.
  func switchOrganization(to accountID: String) async {
    do {
      try await session.switchOrganization(to: accountID)
    } catch {
      showError(error)
    }
  }

  /// Signs out of this device (or leaves the demo).
  func signOut() async {
    guard !isSigningOut else { return }
    isSigningOut = true
    await session.signOut()
    isSigningOut = false
  }

  // MARK: - Demo

  /// Starts the read-only demo from a demo link key. Throws the API's error for the demo sheet.
  func startDemo(key: String) async throws {
    try await session.startDemo(key: key)
  }

  /// A demo link from outside the app (a URL, or a confirmed link while signed in).
  func openDemo(key: String) async {
    pendingDemoKey = nil
    do {
      try await startDemo(key: key)
    } catch let error where !error.isCancellation {
      if session.isAuthenticated {
        toasts.showError(error.userFacingMessage)
      } else {
        signInMessage = error.userFacingMessage
      }
    } catch {}
  }

  func exitDemo() async {
    await signOut()
  }

  // MARK: - Feedback

  /// Sends `feedbackDraft` with the current screen's path. Returns true when it was sent.
  func submitFeedback() async -> Bool {
    let message = String(
      feedbackDraft.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Self.feedbackLimit))
    guard !message.isEmpty else { return false }
    do {
      _ = try await rpc.call(
        RPC.Feedback.submit,
        FeedbackSubmitInput(message: message, path: router.currentPath, sessionId: analytics.sessionID))
      feedbackDraft = ""
      return true
    } catch let error where error.isCancellation {
      return false
    } catch let error as APIError where error.kind == .response {
      toasts.showError(error.userFacingMessage)
      return false
    } catch {
      toasts.showError("Couldn't send feedback. Try again.")
      return false
    }
  }

  /// `FEEDBACK_MESSAGE_MAX_LENGTH`.
  static let feedbackLimit = 5000

  // MARK: - Errors

  /// Shows an error toast with the error's user-facing copy (the API's `data.message` when
  /// present). Cancellations are ignored.
  func showError(_ error: any Error) {
    guard !error.isCancellation else { return }
    toasts.showError(error.userFacingMessage)
  }

  // MARK: - Debug

  /// Clears every cached read for this account, in memory and on disk.
  func resetCaches() {
    queries.clear()
    account = session.isAuthenticated ? makeAccountContext() : nil
  }

  // MARK: - Account context

  private func makeAccountContext() -> AccountContext {
    let context = AccountContext(
      queries: queries, scope: queries.scope,
      selectedAccountID: session.activeAccount?.selectedPlanningCenterAccountID)
    syncAccounts(for: context)
    return context
  }

  /// The session moved to another account context (sign-in, switch, organization change, demo,
  /// sign-out). The query cache has already been cleared for `scope`.
  private func scopeDidChange(_ scope: QueryScope) {
    router.reset()
    accountsTask?.cancel()
    preparationTask?.cancel()
    guard session.isAuthenticated else {
      account = nil
      isPreparing = false
      analytics.reset()
      lastOpenedUserID = nil
      return
    }
    if session.isDemo {
      analytics.reset()
    }
    let context = makeAccountContext()
    account = context
    // During launch, `launch()` owns the splash.
    guard hasLaunched else { return }
    guard context.features.value == nil else {
      reveal()
      return
    }
    // Hold the splash until this account's flags answer, so its tabs don't pop in.
    isPreparing = true
    preparationTask = Task { [weak self] in
      await self?.waitForFeatures(context)
      guard let self, !Task.isCancelled, self.account === context else { return }
      self.isPreparing = false
      self.reveal()
    }
  }

  private func reveal() {
    isPreparing = false
    applyPendingLink()
  }

  /// Waits until the context's `features.status` read (already loading) answers or fails, at
  /// most `featureWait`.
  private func waitForFeatures(_ context: AccountContext) async {
    let deadline = ContinuousClock.now + Self.featureWait
    while context.features.value == nil, context.features.status != .failure,
      ContinuousClock.now < deadline, !Task.isCancelled
    {
      try? await Task.sleep(for: .milliseconds(40))
    }
  }

  /// Keeps the session's profile and organization current from `accounts.list`, identifies the
  /// person for analytics, and sends `app opened` once per person.
  private func syncAccounts(for context: AccountContext) {
    accountsTask?.cancel()
    accountsTask = Task { [weak self] in
      guard let self else { return }
      let list: PlanningCenterAccounts
      do {
        list = try await self.queries.fetch(.accounts, RPC.Accounts.list, EmptyInput())
      } catch {
        return
      }
      guard !Task.isCancelled, self.account === context else { return }
      self.session.refresh(from: list)
      guard !list.demo, case .signedIn = self.session.phase else {
        self.analytics.reset()
        return
      }
      self.analytics.identify(userID: list.session.userId)
      if self.lastOpenedUserID != list.session.userId {
        self.lastOpenedUserID = list.session.userId
        self.analytics.capture(.appOpened)
      }
    }
  }
}

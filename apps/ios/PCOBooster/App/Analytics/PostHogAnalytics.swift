import Foundation
import PCOBoosterCore
@preconcurrency import PostHog
import Synchronization

/// The runtime's `AnalyticsSink`, backed by PostHog with the web's discipline
/// (`packages/analytics`):
///
/// - Off unless this is a production build against `https://pcobooster.com` with a PostHog key
///   (`AppConfiguration.allowsAnalytics`), and the person has not opted out.
/// - PostHog is set up only after a non-demo sign-in (`identify`), with the same Better Auth
///   user id the web identifies with, so web, iOS, and server events join one person. Events
///   before that, in a demo, and after sign-out are dropped.
/// - No autocapture, no lifecycle or screen autocapture, no session replay, no surveys, and no
///   feature flag calls. Screens are sent by the app with web route templates.
///
/// `capture` is called from any thread; state lives behind a `Mutex`.
nonisolated final class PostHogAnalytics: AnalyticsSink {
  /// `UserDefaults` key for the "Share usage analytics" switch (on by default).
  static let optOutKey = "PCOBAnalyticsOptOut"
  static let host = "https://us.i.posthog.com"

  private struct State {
    var isSetUp = false
    var isCapturing = false
    var optedOut: Bool
  }

  private let apiKey: String?
  private let state: Mutex<State>

  /// - Parameters:
  ///   - configuration: Analytics run only when `configuration.allowsAnalytics`.
  ///   - optedOut: The person turned "Share usage analytics" off.
  init(configuration: AppConfiguration, optedOut: Bool) {
    apiKey = configuration.allowsAnalytics && !AppConfiguration.isDebugBuild
      ? configuration.postHogKey : nil
    state = Mutex(State(optedOut: optedOut))
  }

  /// Whether this build can send analytics at all (for showing the opt-out switch).
  var isAvailable: Bool { apiKey != nil }

  // MARK: AnalyticsSink

  func capture(_ event: AnalyticsEvent) {
    guard state.withLock({ $0.isCapturing }) else { return }
    let sdk = PostHogSDK.shared
    let properties = event.properties.mapValues(\.rawValue) as [String: Any]
    switch event {
    case .screenViewed(let screen):
      sdk.screen(screen.routeTemplate, properties: properties)
    case .readFailed:
      guard let exception = event.exception else { return }
      sdk.captureException(DataLoadError(name: exception.type, message: exception.message), properties: properties)
    default:
      sdk.capture(event.name, properties: properties)
    }
  }

  // MARK: Identity

  /// Starts capturing for a signed-in (non-demo) person: sets PostHog up on first use, then
  /// identifies them by their Better Auth user id.
  func identify(userID: String) {
    guard let apiKey else { return }
    let shouldSetUp = state.withLock { state -> Bool? in
      guard !state.optedOut else { return nil }
      defer {
        state.isSetUp = true
        state.isCapturing = true
      }
      return !state.isSetUp
    }
    guard let shouldSetUp else { return }
    let sdk = PostHogSDK.shared
    if shouldSetUp {
      sdk.setup(Self.makeConfig(apiKey: apiKey))
    }
    sdk.identify(userID)
    sdk.register(["surface": "app", "is_authenticated": true])
  }

  /// Stops capturing and forgets the person (sign-out, demo).
  func reset() {
    let wasSetUp = state.withLock { state in
      state.isCapturing = false
      return state.isSetUp
    }
    if wasSetUp {
      PostHogSDK.shared.reset()
    }
  }

  /// The "Share usage analytics" switch.
  func setOptedOut(_ optedOut: Bool) {
    let wasSetUp = state.withLock { state in
      state.optedOut = optedOut
      if optedOut { state.isCapturing = false }
      return state.isSetUp
    }
    guard wasSetUp else { return }
    if optedOut {
      PostHogSDK.shared.optOut()
    } else {
      PostHogSDK.shared.optIn()
    }
  }

  /// The PostHog session id for feedback reports, or nil when not capturing.
  var sessionID: String? {
    guard state.withLock({ $0.isCapturing }) else { return nil }
    return PostHogSDK.shared.getSessionId()
  }

  private static func makeConfig(apiKey: String) -> PostHogConfig {
    let config = PostHogConfig(projectToken: apiKey, host: host)
    config.captureApplicationLifecycleEvents = false
    config.captureScreenViews = false
    config.enableSwizzling = false
    config.preloadFeatureFlags = false
    config.sendFeatureFlagEvent = false
    config.personProfiles = .identifiedOnly
    config.sessionReplay = false
    config.surveys = false
    return config
  }
}

/// The synthetic exception for a read that failed after its retry (the web's `DataLoadError`).
/// Its message names only the query family and error code.
nonisolated struct DataLoadError: LocalizedError, CustomStringConvertible {
  let name: String
  let message: String

  var errorDescription: String? { message }
  var description: String { message }
}

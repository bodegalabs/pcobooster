import Foundation

/// The runtime wired together: one scheduler, one RPC client, the session, and the query cache,
/// sharing credentials and the account scope. The app builds one at launch and injects its
/// parts into the environment.
///
/// ```swift
/// let services = AppServices.live(configuration: try AppConfiguration.load(), analytics: postHog)
/// services.queries.errorSink = { toasts.showError($0.message) }
/// // .onChange(of: scenePhase) { if $1 == .active { services.queries.refetchStale() } }
/// ```
@MainActor
public final class AppServices {
  public let configuration: AppConfiguration
  public let scheduler: RequestScheduler
  public let rpc: RPCClient
  public let signIn: NativeSignIn
  public let session: SessionStore
  public let queries: QueryClient

  /// - Parameters:
  ///   - rpcTransport: Where oRPC calls go (`URLSessionTransport`, or `MockTransport`).
  ///   - httpTransport: Where the sign-in exchange and sign-out go.
  ///   - keychain: Where the session is saved.
  ///   - cacheDirectory: Where persisted reads live; nil keeps them in memory.
  public init(
    configuration: AppConfiguration,
    rpcTransport: any RPCTransport,
    httpTransport: any HTTPTransport,
    keychain: any KeychainStore,
    cacheDirectory: URL?,
    analytics: any AnalyticsSink = NoAnalytics()
  ) {
    let credentials = SessionCredentials()
    let scheduler = RequestScheduler()
    let rpc = RPCClient(
      transport: rpcTransport, scheduler: scheduler, clientInfo: configuration.clientInfo,
      credentials: credentials, analytics: analytics)
    let signIn = NativeSignIn(
      baseURL: configuration.apiBaseURL, callbackScheme: configuration.urlScheme,
      transport: httpTransport, clientInfo: configuration.clientInfo, analytics: analytics)
    let session = SessionStore(
      store: CredentialStore(keychain: keychain), credentials: credentials, rpc: rpc,
      signIn: signIn)
    let queries = QueryClient(
      rpc: rpc, scope: session.queryScope, cacheDirectory: cacheDirectory, analytics: analytics)
    session.onScopeChange = { [weak queries] scope in
      queries?.switchScope(scope)
    }
    self.configuration = configuration
    self.scheduler = scheduler
    self.rpc = rpc
    self.signIn = signIn
    self.session = session
    self.queries = queries
  }

  /// The production wiring: a cookieless `URLSession`, the system Keychain (cleared on the
  /// first launch of a new install), and the Caches directory.
  public static func live(
    configuration: AppConfiguration,
    analytics: any AnalyticsSink = NoAnalytics(),
    defaults: UserDefaults = .standard
  ) -> AppServices {
    let transport = URLSessionTransport(baseURL: configuration.apiBaseURL)
    let keychain = SystemKeychain()
    CredentialStore(keychain: keychain).clearIfFreshInstall(defaults: defaults)
    return AppServices(
      configuration: configuration, rpcTransport: transport, httpTransport: transport,
      keychain: keychain, cacheDirectory: QueryClient.defaultCacheDirectory, analytics: analytics)
  }

  /// Offline wiring for previews, UI tests, and screenshots: answers come from `transport`
  /// (for example `MockTransport`), nothing is saved, sign-in is unavailable, and the session
  /// starts in `developmentBypass`.
  public static func preview(
    transport: any RPCTransport,
    configuration: AppConfiguration = .preview
  ) -> AppServices {
    let services = AppServices(
      configuration: configuration, rpcTransport: transport,
      httpTransport: UnavailableHTTPTransport(), keychain: InMemoryKeychain(), cacheDirectory: nil)
    services.session.enterDevelopmentBypass()
    return services
  }

  /// Run once at launch: in development against this Mac, uses the local API's PAT sign-in when
  /// nobody is signed in.
  public func prepareSession() async {
    guard configuration.environment == .development, configuration.isLocalAPI else { return }
    await session.checkDevelopmentBypass()
  }
}

extension AppConfiguration {
  /// A development configuration for previews and tests.
  public static let preview = AppConfiguration(
    apiBaseURL: SelectableEnvironment.local.baseURL, environment: .development,
    urlScheme: "pcobooster-dev",
    clientInfo: ClientInfo(appVersion: "0.0.0", build: "0", platform: "iOS", osVersion: "26.0"),
    usesMockData: true)
}

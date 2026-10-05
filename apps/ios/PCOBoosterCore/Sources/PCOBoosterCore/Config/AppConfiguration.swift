import Foundation

/// Build settings the app reads from `Info.plist` (`PCOBAPIBaseURL`, `PCOBEnvironment`,
/// `PCOBURLScheme`, `PCOBPostHogKey`, filled from the `PCOB_*` build settings), plus the
/// Debug-only base URL override.
public struct AppConfiguration: Sendable, Hashable {
  public enum Environment: String, Sendable, Hashable {
    /// Debug builds: local API by default, `pcobooster-dev` scheme.
    case development
    /// Release builds against `https://pcobooster.com`.
    case production
  }

  /// The product origin every call goes to.
  public var apiBaseURL: URL
  public var environment: Environment
  /// The custom scheme native sign-in redirects to.
  public var urlScheme: String
  /// The PostHog ingestion key; nil when the build has none.
  public var postHogKey: String?
  public var clientInfo: ClientInfo
  /// Serve fictional fixtures instead of the API (`-PCOBMock YES`).
  public var usesMockData: Bool
  /// The base URL came from the Debug override (the Debug menu or `PCOB_BASE_URL`).
  public var isBaseURLOverridden: Bool

  public init(
    apiBaseURL: URL,
    environment: Environment,
    urlScheme: String,
    postHogKey: String? = nil,
    clientInfo: ClientInfo = .current(),
    usesMockData: Bool = false,
    isBaseURLOverridden: Bool = false
  ) {
    self.apiBaseURL = apiBaseURL
    self.environment = environment
    self.urlScheme = urlScheme
    self.postHogKey = postHogKey
    self.clientInfo = clientInfo
    self.usesMockData = usesMockData
    self.isBaseURLOverridden = isBaseURLOverridden
  }

  // MARK: - Keys

  public static let baseURLKey = "PCOBAPIBaseURL"
  public static let environmentKey = "PCOBEnvironment"
  public static let urlSchemeKey = "PCOBURLScheme"
  public static let postHogKeyKey = "PCOBPostHogKey"
  /// `UserDefaults` key the Debug menu writes.
  public static let baseURLOverrideKey = "PCOBAPIBaseURLOverride"
  /// Process environment variable for a scheme or worktree port (`PCOB_BASE_URL`).
  public static let baseURLEnvironmentVariable = "PCOB_BASE_URL"
  /// Launch argument `-PCOBMock YES`, read through `UserDefaults`.
  public static let mockDataKey = "PCOBMock"

  /// Whether this binary was compiled for debugging.
  public static var isDebugBuild: Bool {
    #if DEBUG
    true
    #else
    false
    #endif
  }

  // MARK: - Loading

  /// The configuration for this process.
  ///
  /// When `allowsOverrides` (Debug builds), the base URL comes from, in order: the Debug
  /// menu's choice (`UserDefaults`), `PCOB_BASE_URL`, then `Info.plist`. Release builds always
  /// use `Info.plist`.
  public static func load(
    bundle: Bundle = .main,
    defaults: UserDefaults = .standard,
    processEnvironment: [String: String] = ProcessInfo.processInfo.environment,
    allowsOverrides: Bool = isDebugBuild
  ) throws(AppConfigurationError) -> AppConfiguration {
    try load(
      info: bundle.infoDictionary ?? [:],
      overrideBaseURL: allowsOverrides
        ? defaults.string(forKey: baseURLOverrideKey) ?? processEnvironment[baseURLEnvironmentVariable]
        : nil,
      usesMockData: allowsOverrides && defaults.bool(forKey: mockDataKey),
      clientInfo: .current(bundle: bundle))
  }

  /// The configuration for an `Info.plist` dictionary, for tests.
  public static func load(
    info: [String: Any],
    overrideBaseURL: String? = nil,
    usesMockData: Bool = false,
    clientInfo: ClientInfo = .current()
  ) throws(AppConfigurationError) -> AppConfiguration {
    let environmentName = try requiredString(environmentKey, in: info)
    guard let environment = Environment(rawValue: environmentName) else {
      throw .invalidValue(key: environmentKey, value: environmentName)
    }
    let scheme = try requiredString(urlSchemeKey, in: info)
    guard isValidScheme(scheme) else {
      throw .invalidValue(key: urlSchemeKey, value: scheme)
    }
    let configured = try requiredString(baseURLKey, in: info)
    let override = overrideBaseURL.flatMap(validBaseURL)
    guard let baseURL = override ?? validBaseURL(configured) else {
      throw .invalidValue(key: baseURLKey, value: configured)
    }
    let postHog = (info[postHogKeyKey] as? String).flatMap(expandedValue)
    return AppConfiguration(
      apiBaseURL: baseURL, environment: environment, urlScheme: scheme, postHogKey: postHog,
      clientInfo: clientInfo, usesMockData: usesMockData, isBaseURLOverridden: override != nil)
  }

  // MARK: - Derived

  /// `<scheme>://auth/callback`.
  public var redirectURI: URL {
    URL(string: "\(urlScheme)://auth/callback") ?? apiBaseURL
  }

  /// Whether product analytics may run: production environment, the production origin, a key,
  /// and real data. The app also requires a non-demo signed-in person and the opt-in.
  public var allowsAnalytics: Bool {
    environment == .production && apiBaseURL.host() == "pcobooster.com" && postHogKey != nil
      && !usesMockData
  }

  /// Whether the base URL is this Mac (the simulator shares its loopback), where `bun run dev`
  /// may sign requests in with a PAT.
  public var isLocalAPI: Bool {
    let host = apiBaseURL.host() ?? ""
    return host == "127.0.0.1" || host == "localhost" || host == "::1" || host.hasSuffix(".localhost")
  }

  // MARK: - Debug environments

  /// The environments the Debug menu offers.
  public static let selectableEnvironments: [SelectableEnvironment] = [.local, .production]

  /// Saves (or with nil, clears) the Debug menu's base URL. Takes effect on the next launch.
  public static func setBaseURLOverride(_ url: URL?, defaults: UserDefaults = .standard) {
    if let url {
      defaults.set(url.absoluteString, forKey: baseURLOverrideKey)
    } else {
      defaults.removeObject(forKey: baseURLOverrideKey)
    }
  }

  // MARK: - Validation

  private static func requiredString(_ key: String, in info: [String: Any])
    throws(AppConfigurationError) -> String
  {
    guard let value = (info[key] as? String).flatMap(expandedValue) else {
      throw .missingValue(key: key)
    }
    return value
  }

  /// Nil for empty values and unexpanded `$(BUILD_SETTING)` references.
  private static func expandedValue(_ value: String) -> String? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, !trimmed.hasPrefix("$(") else { return nil }
    return trimmed
  }

  /// An origin: `https://host[:port]`, or `http` for this Mac only (App Transport Security
  /// allows local networking in Debug).
  static func validBaseURL(_ text: String) -> URL? {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let url = URL(string: trimmed), let scheme = url.scheme?.lowercased(),
      let host = url.host(), !host.isEmpty, url.query() == nil, url.fragment() == nil
    else {
      return nil
    }
    let local = host == "127.0.0.1" || host == "localhost" || host == "::1"
      || host.hasSuffix(".localhost")
    guard scheme == "https" || (scheme == "http" && local) else { return nil }
    let path = url.path()
    guard path.isEmpty || path == "/" else { return nil }
    return URL(string: trimmed.hasSuffix("/") ? String(trimmed.dropLast()) : trimmed)
  }

  private static func isValidScheme(_ scheme: String) -> Bool {
    guard let first = scheme.unicodeScalars.first, first.isASCIILetter else { return false }
    return scheme.unicodeScalars.allSatisfy {
      $0.isASCIILetter || $0.isASCIIDigit || $0 == "+" || $0 == "-" || $0 == "."
    }
  }
}

/// An environment the Debug menu can switch to.
public struct SelectableEnvironment: Sendable, Hashable, Identifiable {
  public var id: String { name }
  public let name: String
  public let baseURL: URL

  public init(name: String, baseURL: URL) {
    self.name = name
    self.baseURL = baseURL
  }

  /// The main checkout's `bun run dev` product origin.
  public static let local = SelectableEnvironment(
    name: "Local", baseURL: URL(string: "http://127.0.0.1:3001")!)
  public static let production = SelectableEnvironment(
    name: "Production", baseURL: URL(string: "https://pcobooster.com")!)
}

public enum AppConfigurationError: Error, Sendable, Hashable, CustomStringConvertible {
  case missingValue(key: String)
  case invalidValue(key: String, value: String)

  public var description: String {
    switch self {
    case .missingValue(let key): "Info.plist is missing \(key)."
    case .invalidValue(let key, let value): "Info.plist \(key) is not valid: \(value)"
    }
  }
}

extension Unicode.Scalar {
  fileprivate var isASCIILetter: Bool {
    ("a"..."z").contains(self) || ("A"..."Z").contains(self)
  }

  fileprivate var isASCIIDigit: Bool {
    ("0"..."9").contains(self)
  }
}

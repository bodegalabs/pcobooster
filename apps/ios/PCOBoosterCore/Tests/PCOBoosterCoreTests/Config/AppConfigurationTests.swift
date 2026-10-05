import Foundation
import PCOBoosterCore
import Testing

struct AppConfigurationTests {
  private let debugInfo: [String: Any] = [
    "PCOBAPIBaseURL": "http://127.0.0.1:3001",
    "PCOBEnvironment": "development",
    "PCOBURLScheme": "pcobooster-dev",
    "PCOBPostHogKey": "",
  ]

  private let releaseInfo: [String: Any] = [
    "PCOBAPIBaseURL": "https://pcobooster.com",
    "PCOBEnvironment": "production",
    "PCOBURLScheme": "pcobooster",
    "PCOBPostHogKey": "phc_public",
  ]

  @Test func readsInfoPlistValues() throws {
    let configuration = try AppConfiguration.load(info: releaseInfo, clientInfo: testClientInfo)
    #expect(configuration.apiBaseURL == URL(string: "https://pcobooster.com"))
    #expect(configuration.environment == .production)
    #expect(configuration.urlScheme == "pcobooster")
    #expect(configuration.redirectURI == URL(string: "pcobooster://auth/callback"))
    #expect(configuration.postHogKey == "phc_public")
    #expect(configuration.allowsAnalytics)
    #expect(!configuration.isLocalAPI)
    #expect(!configuration.isBaseURLOverridden)
  }

  @Test func treatsEmptyKeysAsAbsent() throws {
    let configuration = try AppConfiguration.load(info: debugInfo)
    #expect(configuration.postHogKey == nil)
    #expect(!configuration.allowsAnalytics)
    #expect(configuration.isLocalAPI)
  }

  @Test func appliesTheDebugOverride() throws {
    let configuration = try AppConfiguration.load(
      info: debugInfo, overrideBaseURL: "https://pcobooster.com/")
    #expect(configuration.apiBaseURL == URL(string: "https://pcobooster.com"))
    #expect(configuration.isBaseURLOverridden)

    // An unusable override falls back to Info.plist.
    let fallback = try AppConfiguration.load(info: debugInfo, overrideBaseURL: "ftp://nope")
    #expect(fallback.apiBaseURL == URL(string: "http://127.0.0.1:3001"))
    #expect(!fallback.isBaseURLOverridden)
  }

  @Test func readsOverridesOnlyWhenAllowed() throws {
    let suite = "PCOBoosterCoreTests-\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let bundle = try makeBundle(info: debugInfo)

    let fromEnvironment = try AppConfiguration.load(
      bundle: bundle, defaults: defaults,
      processEnvironment: ["PCOB_BASE_URL": "http://127.0.0.1:4011"], allowsOverrides: true)
    #expect(fromEnvironment.apiBaseURL == URL(string: "http://127.0.0.1:4011"))

    AppConfiguration.setBaseURLOverride(SelectableEnvironment.production.baseURL, defaults: defaults)
    defaults.set(true, forKey: AppConfiguration.mockDataKey)
    let fromMenu = try AppConfiguration.load(
      bundle: bundle, defaults: defaults,
      processEnvironment: ["PCOB_BASE_URL": "http://127.0.0.1:4011"], allowsOverrides: true)
    #expect(fromMenu.apiBaseURL == URL(string: "https://pcobooster.com"))
    #expect(fromMenu.usesMockData)

    let release = try AppConfiguration.load(
      bundle: bundle, defaults: defaults,
      processEnvironment: ["PCOB_BASE_URL": "http://127.0.0.1:4011"], allowsOverrides: false)
    #expect(release.apiBaseURL == URL(string: "http://127.0.0.1:3001"))
    #expect(!release.usesMockData)

    AppConfiguration.setBaseURLOverride(nil, defaults: defaults)
    #expect(defaults.string(forKey: AppConfiguration.baseURLOverrideKey) == nil)
  }

  @Test func rejectsMissingOrInvalidValues() {
    var missing = releaseInfo
    missing["PCOBURLScheme"] = "$(PCOB_URL_SCHEME)"
    #expect(throws: AppConfigurationError.missingValue(key: "PCOBURLScheme")) {
      try AppConfiguration.load(info: missing)
    }
    var insecure = releaseInfo
    insecure["PCOBAPIBaseURL"] = "http://pcobooster.com"
    #expect(throws: AppConfigurationError.invalidValue(key: "PCOBAPIBaseURL", value: "http://pcobooster.com")) {
      try AppConfiguration.load(info: insecure)
    }
    var unknown = releaseInfo
    unknown["PCOBEnvironment"] = "staging"
    #expect(throws: AppConfigurationError.invalidValue(key: "PCOBEnvironment", value: "staging")) {
      try AppConfiguration.load(info: unknown)
    }
  }

  @Test func listsTheDebugEnvironments() {
    #expect(AppConfiguration.selectableEnvironments.map(\.name) == ["Local", "Production"])
    #expect(SelectableEnvironment.local.baseURL.absoluteString == "http://127.0.0.1:3001")
  }

  /// A bundle on disk with `info` as its Info.plist.
  private func makeBundle(info: [String: Any]) throws -> Bundle {
    let directory = FileManager.default.temporaryDirectory.appending(
      path: "PCOBConfig-\(UUID().uuidString).bundle", directoryHint: .isDirectory)
    let contents = directory.appending(path: "Contents", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: contents, withIntermediateDirectories: true)
    var plist = info
    plist["CFBundleIdentifier"] = "com.pcobooster.tests.\(UUID().uuidString)"
    plist["CFBundleShortVersionString"] = "1.0"
    plist["CFBundleVersion"] = "7"
    let data = try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0)
    try data.write(to: contents.appending(path: "Info.plist"))
    return try #require(Bundle(url: directory))
  }
}

@MainActor
struct AppServicesTests {
  @Test func previewServicesRunOnTheGivenTransport() async throws {
    let transport = StubTransport(rpc: { _ in .ok(#"[{"id":"1","name":"Sunday","sequence":1}]"#) })
    let services = AppServices.preview(transport: transport)
    #expect(services.session.phase == .developmentBypass)
    #expect(services.queries.scope == .development)
    let types = services.queries.query(.serviceTypes, RPC.Catalog.serviceTypes)
    await eventually { types.value != nil }
    #expect(transport.requests.first?.headers["x-pcobooster-client"] == "ios/0")
  }

  @Test func sessionChangesMoveTheQueryScope() async {
    let transport = StubTransport(
      rpc: { _ in .ok(#"[{"id":"1","name":"Sunday","sequence":1}]"#) },
      http: { _ in HTTPResponse(status: 200, body: Data("{}".utf8)) })
    let services = AppServices(
      configuration: .preview, rpcTransport: transport, httpTransport: transport,
      keychain: InMemoryKeychain(), cacheDirectory: nil)
    #expect(services.queries.scope == .signedOut)
    await services.session.completeSignIn(
      NativeSignInResult(
        token: "tok", user: NativeSignInUser(id: "u1", name: "A", email: "a@example.com"),
        selectedAccountId: "org"))
    #expect(services.queries.scope == .account(userID: "u1", planningCenterAccountID: "org"))
    _ = try? await services.rpc.call(RPC.Catalog.serviceTypes)
    #expect(transport.requests.last?.headers["Authorization"] == "Bearer tok")
    #expect(transport.requests.last?.headers["x-pcobooster-account"] == "org")
  }
}

struct AnalyticsEventTests {
  @Test func namesEventsLikeTheWebAllowlist() {
    #expect(AnalyticsEvent.appOpened.name == "app opened")
    #expect(AnalyticsEvent.signInStarted.name == "sign in started")
    #expect(AnalyticsEvent.signInFailed(errorCode: "access_denied").properties == ["error_code": .string("access_denied")])
    #expect(AnalyticsEvent.signInFailed(errorCode: nil).properties.isEmpty)
    #expect(
      AnalyticsEvent.workflowCompleted(.planItemsReorder, duration: .milliseconds(1234)).properties
        == ["operation": .string("planItems.reorder"), "duration_ms": .int(1234)])
    #expect(
      AnalyticsEvent.screenViewed(.plan(.lineup)).properties
        == ["$screen_name": .string("/services/:serviceTypeId/plans/:planId/lineup")])
    #expect(AnalyticsEvent.screenViewed(.person).name == "$screen")
    #expect(AnalyticsEvent.readFailed(nil, errorCode: .unknown).properties["operation"] == .string("unknown-read"))
  }

  @Test func tracksTheWebsOperations() {
    #expect(WorkflowOperation.allCases.count == 17)
    #expect(WorkflowOperation(procedurePath: "neededPositions/adjust") == .neededPositionsAdjust)
    #expect(WorkflowOperation(procedurePath: "catalog/plans") == nil)
    for operation in WorkflowOperation.allCases {
      let path = operation.rawValue.replacingOccurrences(of: ".", with: "/")
      #expect(RPC.allPaths.contains(path), "\(path) is not a procedure")
    }
  }

  @Test func boundsErrorCodes() {
    #expect(WorkflowErrorCode(APIError(kind: .response, code: .conflict, status: 409, message: "")) == .conflict)
    #expect(
      WorkflowErrorCode(APIError(kind: .response, code: .unknown("SERVICE_UNAVAILABLE"), status: 503, message: ""))
        == .serviceUnavailable)
    #expect(WorkflowErrorCode(APIError(kind: .response, code: .unknown("TEAPOT"), status: 418, message: "")) == .unknown)
    #expect(WorkflowErrorCode(APIError(kind: .offline, message: "")) == .unknown)
    #expect(WorkflowErrorCode(URLError(.timedOut)) == .unknown)
  }
}

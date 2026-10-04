#if DEBUG
import Foundation
import PCOBoosterCore
import PCOBoosterMock

/// The `-PCOBMock YES` wiring: fixtures through `MockTransport`, nothing saved, and a seeded
/// session (`-PCOBMockSession`). Debug builds only.
enum MockServices {
  /// The fixture worship pastor (`accounts.list`), signed in at Cedar Grove Church.
  static let jordan = DeviceAccount(
    userID: "usr_9f3c2a7d1e",
    name: "Jordan Hale",
    email: "jordan.hale@cedargrove.example",
    token: "mock-session-jordan",
    selectedPlanningCenterAccountID: "acct_cedargrove",
    organizationName: "Cedar Grove Church",
    lastUsedAt: Date(timeIntervalSince1970: 1_790_000_000))

  /// A second remembered person, for the account switcher.
  static let riley = DeviceAccount(
    userID: "usr_4b81d0c2aa",
    name: "Riley Brooks",
    email: "riley@northside.example",
    token: "mock-session-riley",
    selectedPlanningCenterAccountID: "acct_northside",
    organizationName: "Northside Fellowship",
    lastUsedAt: Date(timeIntervalSince1970: 1_788_800_000))

  static func make(configuration: AppConfiguration, options: LaunchOptions, now: Date)
    -> AppServices
  {
    if options.fixedNow {
      MockTransport.fixedNow = MockFixtures.anchorNow
    }
    let keychain = InMemoryKeychain()
    try? CredentialStore(keychain: keychain).save(seededSession(options.mockSession, now: now))
    let transport = MockOverrideTransport(
      base: MockTransport(latency: options.mockLatency), features: options.features?.features)
    return AppServices(
      configuration: configuration, rpcTransport: transport,
      httpTransport: UnavailableHTTPTransport(), keychain: keychain, cacheDirectory: nil)
  }

  /// A completed sign-in as Jordan, standing in for Planning Center in mock mode.
  static func signInResult() -> NativeSignInResult {
    NativeSignInResult(
      token: jordan.token,
      user: NativeSignInUser(id: jordan.userID, name: jordan.name, email: jordan.email),
      selectedAccountId: jordan.selectedPlanningCenterAccountID)
  }

  private static func seededSession(_ session: LaunchOptions.MockSession, now: Date)
    -> StoredSession
  {
    var jordan = jordan
    jordan.lastUsedAt = now.addingTimeInterval(-2 * 3600)
    var riley = riley
    riley.lastUsedAt = now.addingTimeInterval(-9 * 86400)
    switch session {
    case .signedIn:
      return StoredSession(accounts: [jordan, riley], activeUserID: jordan.userID)
    case .signedOut:
      return StoredSession(accounts: [jordan, riley], activeUserID: nil)
    case .expired:
      jordan.needsSignIn = true
      return StoredSession(accounts: [jordan, riley], activeUserID: jordan.userID)
    case .demo:
      return StoredSession(
        accounts: [], activeUserID: nil,
        demo: DemoCredential(token: "mock-demo", startedAt: now))
    }
  }
}

/// Adjusts mock replies the fixtures cannot express: a `features.status` override, and the demo
/// cookie `demo.start` sets on the real API.
struct MockOverrideTransport: RPCTransport {
  let base: any RPCTransport
  let features: EnabledFeatures?

  func send(_ request: RPCRequest) async throws -> RPCResponse {
    var response = try await base.send(request)
    switch request.path {
    case RPC.Features.status.path:
      if let features {
        let body = try JSONCoding.makeEncoder().encode(["json": features])
        response = RPCResponse(status: 200, body: body, headers: response.headers)
      }
    case RPC.Demo.start.path where response.status == 200:
      response.headers["set-cookie"] = "\(DemoCookie.name)=mock-demo; Path=/; HttpOnly"
    default:
      break
    }
    return response
  }
}
#endif

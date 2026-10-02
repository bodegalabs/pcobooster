import Foundation
import PCOBoosterCore
import Testing

private func account(_ id: String, minutesAgo: Int, token: String? = nil) -> DeviceAccount {
  DeviceAccount(
    userID: id, name: "Person \(id)", email: "\(id)@example.com", token: token ?? "token-\(id)",
    selectedPlanningCenterAccountID: "org-\(id)",
    lastUsedAt: Date(timeIntervalSince1970: 1_790_000_000 - Double(minutesAgo * 60)))
}

private func result(_ id: String, token: String, selected: String? = "org-new") -> NativeSignInResult {
  NativeSignInResult(
    token: token,
    user: NativeSignInUser(id: id, name: "Person \(id)", email: "\(id)@example.com", image: "https://example.com/\(id).png"),
    selectedAccountId: selected)
}

struct CredentialStoreTests {
  @Test func roundTripsThroughTheKeychain() throws {
    let keychain = InMemoryKeychain()
    let store = CredentialStore(keychain: keychain)
    #expect(store.load() == .empty)

    let session = StoredSession(
      accounts: [account("u1", minutesAgo: 0)], activeUserID: "u1",
      demo: DemoCredential(token: "demo", startedAt: Date(timeIntervalSince1970: 1_790_000_000)))
    try store.save(session)
    #expect(keychain.keys == [CredentialStore.itemKey])
    #expect(CredentialStore(keychain: keychain).load() == session)

    try store.save(.empty)
    #expect(keychain.keys.isEmpty)
  }

  @Test func treatsAnUnreadableItemAsSignedOut() throws {
    let keychain = InMemoryKeychain([CredentialStore.itemKey: Data("not json".utf8)])
    #expect(CredentialStore(keychain: keychain).load() == .empty)
    #expect(keychain.keys.isEmpty)
  }

  @Test func remembersFourPeopleDroppingTheLeastRecentlyUsed() {
    var session = StoredSession()
    for (index, id) in ["a", "b", "c", "d"].enumerated() {
      #expect(session.upsert(account(id, minutesAgo: 10 - index)).isEmpty)
    }
    let dropped = session.upsert(account("e", minutesAgo: 0))
    #expect(dropped.map(\.userID) == ["a"])
    #expect(session.accounts.map(\.userID) == ["e", "d", "c", "b"])

    // Replacing a remembered person keeps one entry.
    #expect(session.upsert(account("c", minutesAgo: -1, token: "new")).isEmpty)
    #expect(session.accounts.map(\.userID) == ["c", "e", "d", "b"])
    #expect(session.accounts.first?.token == "new")
  }

  @Test func neverPrintsTokens() {
    let person = account("u1", minutesAgo: 0, token: "secret-token")
    #expect(!person.description.contains("secret"))
    #expect(!"\(DemoCredential(token: "secret-demo", startedAt: Date()))".contains("secret"))
    #expect(!RequestCredentials(bearerToken: "secret", demoToken: "secret").description.contains("secret"))
  }

  @Test func clearsOnTheFirstLaunchOfANewInstall() throws {
    let suite = "PCOBoosterCoreTests-\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let keychain = InMemoryKeychain()
    let store = CredentialStore(keychain: keychain)
    try store.save(StoredSession(accounts: [account("u1", minutesAgo: 0)], activeUserID: "u1"))

    #expect(store.clearIfFreshInstall(defaults: defaults))
    #expect(store.load() == .empty)
    try store.save(StoredSession(accounts: [account("u1", minutesAgo: 0)], activeUserID: "u1"))
    #expect(!store.clearIfFreshInstall(defaults: defaults))
    #expect(store.load().accounts.count == 1)
  }
}

struct DemoCookieTests {
  private let url = URL(string: "https://pcobooster.com/")!

  @Test func readsTheDemoToken() {
    let headers = [
      "set-cookie": "pcobooster-demo=AbC_123-xyz; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax"
    ]
    #expect(DemoCookie.token(fromHeaders: headers, url: url) == "AbC_123-xyz")
  }

  @Test func readsItAmongJoinedCookies() {
    let headers = [
      "set-cookie":
        "other=1; Path=/; Expires=Wed, 21 Oct 2099 07:28:00 GMT, pcobooster-demo=tok; Path=/; HttpOnly"
    ]
    #expect(DemoCookie.token(fromHeaders: headers, url: url) == "tok")
  }

  @Test func ignoresMissingOrExpiringCookies() {
    #expect(DemoCookie.token(fromHeaders: [:], url: url) == nil)
    #expect(DemoCookie.token(fromHeaders: ["set-cookie": "pcobooster-demo=; Path=/; Max-Age=0"], url: url) == nil)
  }
}

@MainActor
struct SessionStoreTests {
  @MainActor
  private struct Harness {
    let keychain = InMemoryKeychain()
    let credentials = SessionCredentials()
    let transport: StubTransport
    let session: SessionStore
    let scopes = Recorder<QueryScope>()

    init(
      stored: StoredSession = .empty,
      rpc: @escaping StubTransport.RPCHandler = { _ in .ok("null") },
      http: @escaping StubTransport.HTTPHandler = { _ in HTTPResponse(status: 200, body: Data("{}".utf8)) }
    ) {
      try? CredentialStore(keychain: keychain).save(stored)
      transport = StubTransport(rpc: rpc, http: http)
      let rpcClient = RPCClient(
        transport: transport, scheduler: RequestScheduler(quietPeriod: .zero),
        clientInfo: testClientInfo, credentials: credentials)
      let signIn = NativeSignIn(
        baseURL: URL(string: "https://pcobooster.com")!, callbackScheme: "pcobooster",
        transport: transport, clientInfo: testClientInfo)
      session = SessionStore(
        store: CredentialStore(keychain: keychain), credentials: credentials, rpc: rpcClient,
        signIn: signIn, now: { Date(timeIntervalSince1970: 1_790_000_000) })
      let scopes = scopes
      session.onScopeChange = { scopes.append($0) }
    }

    var saved: StoredSession { CredentialStore(keychain: keychain).load() }
  }

  @Test func startsFromTheSavedSession() {
    let harness = Harness(stored: StoredSession(accounts: [account("u1", minutesAgo: 5)], activeUserID: "u1"))
    #expect(harness.session.phase == .signedIn(account("u1", minutesAgo: 5)))
    #expect(harness.session.isAuthenticated)
    #expect(harness.credentials.current == RequestCredentials(bearerToken: "token-u1", planningCenterAccountID: "org-u1"))
    #expect(harness.session.queryScope == .account(userID: "u1", planningCenterAccountID: "org-u1"))
  }

  @Test func signingInSavesAndActivatesThePerson() async {
    let harness = Harness()
    #expect(harness.session.phase == .signedOut)
    #expect(harness.credentials.current == .none)

    await harness.session.completeSignIn(result("u1", token: "tok-1"))
    #expect(harness.session.activeAccount?.userID == "u1")
    #expect(harness.session.activeAccount?.imageURL == URL(string: "https://example.com/u1.png"))
    #expect(harness.credentials.current == RequestCredentials(bearerToken: "tok-1", planningCenterAccountID: "org-new"))
    #expect(harness.saved.activeUserID == "u1")
    #expect(harness.scopes.values == [.account(userID: "u1", planningCenterAccountID: "org-new")])
    #expect(harness.transport.httpRequests.isEmpty)
  }

  @Test func signingInAgainReplacesAndRevokesTheOldToken() async {
    let harness = Harness(stored: StoredSession(accounts: [account("u1", minutesAgo: 5)], activeUserID: "u1"))
    await harness.session.completeSignIn(result("u1", token: "tok-2", selected: nil))
    #expect(harness.session.accounts.count == 1)
    #expect(harness.credentials.current.bearerToken == "tok-2")
    // No organization came back, so the remembered one stays.
    #expect(harness.credentials.current.planningCenterAccountID == "org-u1")
    #expect(harness.transport.httpRequests.map(\.path) == ["/api/auth/sign-out"])
    #expect(harness.transport.httpRequests.first?.headers["Authorization"] == "Bearer token-u1")
  }

  @Test func switchingPeopleChangesCredentialsAndScope() {
    let stored = StoredSession(
      accounts: [account("u1", minutesAgo: 1), account("u2", minutesAgo: 9)], activeUserID: "u1")
    let harness = Harness(stored: stored)
    harness.session.switchAccount(to: "u2")
    #expect(harness.credentials.current.bearerToken == "token-u2")
    #expect(harness.session.accounts.first?.userID == "u2")
    #expect(harness.scopes.values == [.account(userID: "u2", planningCenterAccountID: "org-u2")])
    harness.session.switchAccount(to: "nobody")
    #expect(harness.scopes.count == 1)
  }

  @Test func unauthorizedForTheActiveTokenAsksToSignInAgain() {
    let harness = Harness(stored: StoredSession(accounts: [account("u1", minutesAgo: 1)], activeUserID: "u1"))
    // A stale answer for another token changes nothing.
    harness.session.handleUnauthorized(RequestCredentials(bearerToken: "older"))
    #expect(harness.session.isAuthenticated)

    harness.session.handleUnauthorized(harness.credentials.current)
    #expect(harness.session.phase == .needsSignIn(harness.session.accounts[0]))
    #expect(harness.session.accounts[0].needsSignIn)
    #expect(harness.credentials.current == .none)
    #expect(harness.saved.accounts.first?.needsSignIn == true)
    // The person and organization are the same, so caches stay.
    #expect(harness.scopes.values.isEmpty)
  }

  @Test func unauthorizedResponsesReachTheSessionThroughTheClient() async {
    let harness = Harness(
      stored: StoredSession(accounts: [account("u1", minutesAgo: 1)], activeUserID: "u1"),
      rpc: { _ in .orpcError(status: 401, code: "UNAUTHORIZED", message: "Unauthorized") })
    let client = RPCClient(
      transport: harness.transport, scheduler: RequestScheduler(quietPeriod: .zero),
      clientInfo: testClientInfo, credentials: harness.credentials)
    _ = try? await client.call(RPC.Access.me)
    await eventually { !harness.session.isAuthenticated }
    #expect(harness.session.activeAccount?.needsSignIn == true)
  }

  @Test func signingOutRevokesAndForgetsThePerson() async {
    let stored = StoredSession(
      accounts: [account("u1", minutesAgo: 1), account("u2", minutesAgo: 9)], activeUserID: "u1")
    let harness = Harness(stored: stored)
    await harness.session.signOut()
    #expect(harness.session.phase == .signedOut)
    #expect(harness.session.accounts.map(\.userID) == ["u2"])
    #expect(harness.credentials.current == .none)
    #expect(harness.scopes.values == [.signedOut])
    #expect(harness.transport.httpRequests.first?.headers["Authorization"] == "Bearer token-u1")
  }

  @Test func demoSessionsUseTheCookieToken() async throws {
    let harness = Harness(
      stored: StoredSession(accounts: [account("u1", minutesAgo: 1)], activeUserID: "u1"),
      rpc: { request in
        request.path == "demo/start"
          ? .ok(#"{"demo":true}"#, headers: ["set-cookie": "pcobooster-demo=demo-token; Path=/; HttpOnly"])
          : .ok(#"{"demo":false}"#)
      })
    try await harness.session.startDemo(key: "k")
    #expect(harness.session.isDemo)
    #expect(harness.credentials.current == RequestCredentials(demoToken: "demo-token"))
    #expect(harness.saved.demo?.token == "demo-token")

    await harness.session.exitDemo()
    #expect(harness.transport.requests(to: "demo/exit").first?.headers["x-pcobooster-demo"] == "demo-token")
    #expect(harness.session.activeAccount?.userID == "u1")
    #expect(harness.scopes.values == [.demo, .account(userID: "u1", planningCenterAccountID: "org-u1")])
  }

  @Test func rejectsADemoWithoutAToken() async {
    let harness = Harness(rpc: { _ in .ok(#"{"demo":true}"#) })
    await #expect(throws: APIError.self) { try await harness.session.startDemo(key: "k") }
    #expect(!harness.session.isDemo)
  }

  @Test func switchesOrganizationsThroughAccountsSelect() async throws {
    let harness = Harness(
      stored: StoredSession(accounts: [account("u1", minutesAgo: 1)], activeUserID: "u1"),
      rpc: { _ in .ok(#"{"success":true,"selectedAccountId":"org-2"}"#) })
    try await harness.session.switchOrganization(to: "org-2")
    #expect(try json(#require(harness.transport.requests.first).body) == ["json": ["accountId": "org-2"]])
    #expect(harness.credentials.current.planningCenterAccountID == "org-2")
    #expect(harness.scopes.values == [.account(userID: "u1", planningCenterAccountID: "org-2")])
  }

  @Test func refreshesTheProfileFromAccountsList() {
    let harness = Harness(stored: StoredSession(accounts: [account("u1", minutesAgo: 1)], activeUserID: "u1"))
    let response = PlanningCenterAccounts(
      session: PlanningCenterAccountsSession(userId: "u1", name: "Jordan Hale", email: "j@example.com"),
      selectedAccountId: "org-u1",
      accounts: [
        PlanningCenterAccount(
          id: "org-u1", providerId: "planning-center", updatedAt: "2026-09-01",
          identity: PlanningCenterIdentity(organizationName: "Grace Church"))
      ],
      demo: false)
    harness.session.refresh(from: response)
    #expect(harness.session.activeAccount?.name == "Jordan Hale")
    #expect(harness.session.activeAccount?.organizationName == "Grace Church")
    #expect(harness.scopes.values.isEmpty)
  }

  @Test func entersTheDevelopmentBypassWhenTheLocalAPISignsIn() async {
    let harness = Harness(rpc: { _ in .ok(#"{"authenticated":true}"#) })
    await harness.session.checkDevelopmentBypass()
    #expect(harness.session.phase == .developmentBypass)
    #expect(harness.session.isAuthenticated)
    #expect(harness.scopes.values == [.development])
    await harness.session.signOut()
    #expect(harness.session.phase == .signedOut)
  }
}

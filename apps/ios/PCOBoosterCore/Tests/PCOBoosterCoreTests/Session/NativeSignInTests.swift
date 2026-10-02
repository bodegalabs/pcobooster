import Foundation
import PCOBoosterCore
import Testing

@testable import PCOBoosterCore

private let exchangeBody = #"""
  {"token":"sess+/=.c2ln","user":{"id":"u1","name":"Jordan Hale","email":"jordan@example.com","image":null},"selectedAccountId":"acct-1"}
  """#

struct NativeSignInTests {
  private let base = URL(string: "https://pcobooster.com")!

  private func signIn(
    _ transport: StubTransport, analytics: any AnalyticsSink = NoAnalytics()
  ) -> NativeSignIn {
    NativeSignIn(
      baseURL: base, callbackScheme: "pcobooster-dev", transport: transport,
      clientInfo: testClientInfo, analytics: analytics)
  }

  private func query(_ url: URL) -> [String: String] {
    let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
    return Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") })
  }

  // MARK: - Start

  @Test func buildsTheStartURL() throws {
    let pkce = try #require(PKCE(verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
    let attempt = signIn(StubTransport()).makeAttempt(pkce: pkce, state: "state-1234567890ab")
    let url = attempt.startURL
    #expect(url.scheme == "https")
    #expect(url.host() == "pcobooster.com")
    #expect(url.path() == "/api/auth/native/start")
    #expect(
      query(url) == [
        "redirect_uri": "pcobooster-dev://auth/callback",
        "code_challenge": "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        "code_challenge_method": "S256",
        "state": "state-1234567890ab",
      ])
    #expect(attempt.callbackScheme == "pcobooster-dev")
  }

  @Test func freshAttemptsUseNewSecrets() {
    let flow = signIn(StubTransport())
    let first = flow.makeAttempt()
    let second = flow.makeAttempt()
    #expect(first.state != second.state)
    #expect(first.pkce != second.pkce)
    #expect(first.state.count == 43)
  }

  // MARK: - Callback

  @Test func readsTheCodeFromAMatchingCallback() throws {
    let flow = signIn(StubTransport())
    let attempt = flow.makeAttempt()
    let url = try #require(URL(string: "pcobooster-dev://auth/callback?code=abc123&state=\(attempt.state)"))
    #expect(try flow.code(fromCallback: url, for: attempt) == "abc123")
  }

  @Test func readsServerErrorCodes() throws {
    let flow = signIn(StubTransport())
    let attempt = flow.makeAttempt()
    let cases: [(String, NativeSignInCallbackError)] = [
      ("access_denied", .accessDenied), ("sign_in_expired", .signInExpired),
      ("email_not_found", .emailNotFound), ("profile_unavailable", .profileUnavailable),
      ("account_not_linked", .accountNotLinked),
      ("account_linked_elsewhere", .accountLinkedElsewhere),
      ("invalid_request", .invalidRequest), ("server_error", .serverError),
      ("brand_new", .unknown("brand_new")),
    ]
    for (code, expected) in cases {
      let url = try #require(URL(string: "pcobooster-dev://auth/callback?error=\(code)&state=\(attempt.state)"))
      #expect(throws: NativeSignInError.callback(expected)) {
        try flow.code(fromCallback: url, for: attempt)
      }
    }
    // An invalid request may come back without a state.
    let stateless = try #require(URL(string: "pcobooster-dev://auth/callback?error=invalid_request"))
    #expect(throws: NativeSignInError.callback(.invalidRequest)) {
      try flow.code(fromCallback: stateless, for: attempt)
    }
    #expect(
      NativeSignInError.callback(.accountLinkedElsewhere).userMessage
        == "This Planning Center login is already connected to a different PCOBooster account.")
  }

  @Test func rejectsForeignOrMalformedCallbacks() throws {
    let flow = signIn(StubTransport())
    let attempt = flow.makeAttempt()
    let mismatched = try #require(URL(string: "pcobooster-dev://auth/callback?code=abc&state=other"))
    #expect(throws: NativeSignInError.stateMismatch) {
      try flow.code(fromCallback: mismatched, for: attempt)
    }
    let errorWithForeignState = try #require(URL(string: "pcobooster-dev://auth/callback?error=access_denied&state=other"))
    #expect(throws: NativeSignInError.stateMismatch) {
      try flow.code(fromCallback: errorWithForeignState, for: attempt)
    }
    for text in [
      "pcobooster://auth/callback?code=abc&state=\(attempt.state)",
      "pcobooster-dev://other/callback?code=abc&state=\(attempt.state)",
      "pcobooster-dev://auth/callback?state=\(attempt.state)",
    ] {
      let url = try #require(URL(string: text))
      #expect(throws: NativeSignInError.malformedCallback) {
        try flow.code(fromCallback: url, for: attempt)
      }
    }
  }

  // MARK: - Exchange

  @Test func exchangesTheCodeWithoutCookies() async throws {
    let transport = StubTransport(http: { _ in HTTPResponse(status: 200, body: Data(exchangeBody.utf8)) })
    let result = try await signIn(transport).exchange(code: "code-1", verifier: "verifier-1")
    #expect(result.token == "sess+/=.c2ln")
    #expect(result.user == NativeSignInUser(id: "u1", name: "Jordan Hale", email: "jordan@example.com"))
    #expect(result.selectedAccountId == "acct-1")
    #expect(!result.description.contains("sess"))

    let request = try #require(transport.httpRequests.first)
    #expect(request.method == "POST")
    #expect(request.path == "/api/auth/native/exchange")
    #expect(request.headers["Content-Type"] == "application/json")
    #expect(request.headers["Cookie"] == nil)
    #expect(request.headers["Authorization"] == nil)
    #expect(request.headers["x-pcobooster-client"] == "ios/45")
    #expect(try json(#require(request.body)) == ["code": "code-1", "codeVerifier": "verifier-1"])
  }

  @Test func mapsExchangeFailures() async throws {
    let invalidGrant = StubTransport(http: { _ in
      HTTPResponse(status: 400, body: Data(#"{"code":"INVALID_GRANT","message":"Invalid grant"}"#.utf8))
    })
    await #expect(throws: NativeSignInError.invalidGrant) {
      try await signIn(invalidGrant).exchange(code: "c", verifier: "v")
    }
    let limited = StubTransport(http: { _ in
      HTTPResponse(status: 429, body: Data(#"{"error":"Too many requests"}"#.utf8))
    })
    await #expect(throws: NativeSignInError.rateLimited) {
      try await signIn(limited).exchange(code: "c", verifier: "v")
    }
    let invalidRequest = StubTransport(http: { _ in
      HTTPResponse(status: 400, body: Data(#"{"code":"INVALID_REQUEST","message":"Bad"}"#.utf8))
    })
    await #expect(throws: NativeSignInError.server(status: 400, code: "INVALID_REQUEST")) {
      try await signIn(invalidRequest).exchange(code: "c", verifier: "v")
    }
    let offline = StubTransport(http: { _ in throw URLError(.notConnectedToInternet) })
    let error = await #expect(throws: NativeSignInError.self) {
      try await signIn(offline).exchange(code: "c", verifier: "v")
    }
    guard case .transport(let failure) = error else {
      Issue.record("Expected a transport failure, got \(String(describing: error))")
      return
    }
    #expect(failure.kind == .offline)
    #expect(error?.analyticsCode == "offline")
  }

  // MARK: - Whole flow

  @Test func runsTheWholeFlow() async throws {
    let analytics = RecordingAnalytics()
    let transport = StubTransport(http: { _ in HTTPResponse(status: 200, body: Data(exchangeBody.utf8)) })
    let flow = signIn(transport, analytics: analytics)
    let result = try await flow.signIn { startURL, scheme in
      #expect(scheme == "pcobooster-dev")
      let state = URLComponents(url: startURL, resolvingAgainstBaseURL: false)?
        .queryItems?.first { $0.name == "state" }?.value ?? ""
      return URL(string: "pcobooster-dev://auth/callback?code=xyz&state=\(state)")!
    }
    #expect(result.user.id == "u1")
    #expect(analytics.events == [.signInStarted])
    let body = try json(#require(transport.httpRequests.first?.body))
    #expect(body["code"] == "xyz")
    #expect(body["codeVerifier"]?.stringValue?.count == 43)
  }

  @Test func reportsFailuresButNotCancellations() async throws {
    let analytics = RecordingAnalytics()
    let flow = signIn(StubTransport(), analytics: analytics)
    await #expect(throws: NativeSignInError.callback(.accessDenied)) {
      try await flow.signIn { startURL, _ in
        let state = URLComponents(url: startURL, resolvingAgainstBaseURL: false)?
          .queryItems?.first { $0.name == "state" }?.value ?? ""
        return URL(string: "pcobooster-dev://auth/callback?error=access_denied&state=\(state)")!
      }
    }
    await #expect(throws: NativeSignInError.cancelled) {
      try await flow.signIn { _, _ in
        throw NSError(domain: "com.apple.AuthenticationServices.WebAuthenticationSession", code: 1)
      }
    }
    #expect(
      analytics.events == [.signInStarted, .signInFailed(errorCode: "access_denied"), .signInStarted])
  }

  // MARK: - Sign out

  @Test func signsOutWithTheBearerToken() async throws {
    let transport = StubTransport(http: { _ in HTTPResponse(status: 200, body: Data("{}".utf8)) })
    try await signIn(transport).signOut(token: "tok.sig")
    let request = try #require(transport.httpRequests.first)
    #expect(request.method == "POST")
    #expect(request.path == "/api/auth/sign-out")
    #expect(request.headers["Authorization"] == "Bearer tok.sig")
    #expect(request.headers["Content-Type"] == "application/json")
    #expect(request.body == Data("{}".utf8))

    let gone = StubTransport(http: { _ in HTTPResponse(status: 401, body: Data()) })
    try await signIn(gone).signOut(token: "tok.sig")
  }
}
